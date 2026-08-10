import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  attributionValidity,
  boundedCaptureReportEvent,
  publicCaptureSource,
  reportingReasonForInputError,
} from '../lib/capture-reporting.mjs'
import { acknowledgeResultDisplay, CaptureRequestError } from '../lib/capture-client.mjs'
import {
  createFixtureAuthorization,
  FIXTURE_AUTHORIZATION_TTL_MS,
  verifyFixtureAuthorization,
} from '../lib/fixture-authorization.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const captureId = '123e4567-e89b-42d3-a456-426614174000'

test('attribution validity is a bounded classification and never retains values', () => {
  assert.equal(attributionValidity({}), 'direct')
  assert.equal(attributionValidity({ normalized_referrer: 'https://publisher.example/a' }), 'external_referrer')
  assert.equal(attributionValidity({ utm_source: 'reddit' }), 'valid_utm')
  assert.equal(attributionValidity({ utm_source: 'google', gclid: 'opaque-click' }), 'valid_click_id')
  assert.deepEqual(boundedCaptureReportEvent({
    eventType: 'rejected', reasonCode: 'invalid_attribution',
    attributionValidity: 'invalid', trafficClass: 'unknown',
  }), {
    eventType: 'rejected', reasonCode: 'invalid_attribution',
    attributionValidity: 'invalid', trafficClass: 'unknown',
  })
  assert.throws(() => boundedCaptureReportEvent({
    eventType: 'rejected', reasonCode: 'attacker supplied detail',
    attributionValidity: 'invalid', trafficClass: 'unknown',
  }))
  assert.equal(reportingReasonForInputError('unbounded-new-code'), 'invalid_body')
})

test('public source reporting has fixed cardinality and never reflects arbitrary labels', () => {
  const attackerValues = Array.from({ length: 500 }, (_, index) => `person_${index}_5551212`)
  assert.deepEqual(new Set(attackerValues.map((value) => publicCaptureSource(value))), new Set(['other']))
  assert.equal(publicCaptureSource('ReDdIt'), 'reddit')
  assert.equal(publicCaptureSource('anything', { fixture: true }), 'fixture')
})

test('fixture authorization is server-signed, tamper-resistant, and short-lived', () => {
  const secret = 'test-only-admin-secret-at-least-16'
  const issuedAt = 1_800_000_000_000
  const token = createFixtureAuthorization(secret, issuedAt)
  assert.equal(verifyFixtureAuthorization(token, secret, issuedAt + 1_000), true)
  assert.equal(verifyFixtureAuthorization(`${token}x`, secret, issuedAt + 1_000), false)
  assert.equal(verifyFixtureAuthorization(token, 'different-test-only-secret-value', issuedAt + 1_000), false)
  assert.equal(verifyFixtureAuthorization(token, secret, issuedAt + FIXTURE_AUTHORIZATION_TTL_MS + 1), false)
})

test('display acknowledgement uses the same identity on bounded response-loss retry', async () => {
  let attempts = 0
  const fetcher = async (_url, options) => {
    attempts += 1
    assert.deepEqual(JSON.parse(options.body), { captureId })
    if (attempts === 1) throw new Error('response lost')
    return { ok: true, json: async () => ({ ok: true, first_display: false }) }
  }
  await assert.rejects(acknowledgeResultDisplay(fetcher, captureId), CaptureRequestError)
  assert.deepEqual(await acknowledgeResultDisplay(fetcher, captureId), { ok: true, first_display: false })
  assert.equal(attempts, 2)
})

test('accepted and deduplicated reporting is atomic with durable lead and message work', async () => {
  const source = await read('../lib/db.ts')
  assert.match(source, /eligible_risk as[\s\S]*captured as[\s\S]*message_work as[\s\S]*attempt_report as[\s\S]*outcome_report as/)
  assert.match(source, /case when message_work\.lead_id is not null then 'accepted' else 'deduplicated' end/)
  assert.match(source, /case when message_work\.lead_id is not null then 'none' else 'stable_replay' end/)
  assert.match(source, /cross join attempt_report[\s\S]*cross join outcome_report/)
  assert.doesNotMatch(source, /insert into capture_reporting_buckets[\s\S]{0,500}(email|phone|referrer|capture_id|request_hash)/i)
})

test('first result display transition and aggregate increment share one SQL statement', async () => {
  const source = await read('../lib/db.ts')
  assert.match(source, /with displayed as \([\s\S]*result_displayed_at is null[\s\S]*returning is_fixture, attribution_validity[\s\S]*\), report as \([\s\S]*from displayed/)
  assert.match(source, /exists\(select 1 from displayed\).*first_display/)
})

test('reporting migration is additive, privacy-minimized, and prospectively constrained', async () => {
  const migration = await read('../db/migrations/0008_capture_reporting_invariants.sql')
  assert.match(migration, /capture_reporting_buckets/)
  assert.match(migration, /event_type in \('attempt', 'accepted', 'deduplicated', 'rejected', 'persistence_unconfirmed', 'result_displayed'\)/)
  assert.match(migration, /leads_capture_state_check[\s\S]*not valid/)
  assert.match(migration, /leads_capture_residency_check[\s\S]*not valid/)
  assert.match(migration, /leads_capture_attribution_bounds_check[\s\S]*gclid[\s\S]*fbclid[\s\S]*not valid/)
  assert.match(migration, /leads_capture_consent_relationship_check[\s\S]*capture_id is null[\s\S]*sms_consent = false/)
  assert.match(migration, /leads_capture_lifecycle_check[\s\S]*capture_risk_decision_id[\s\S]*not valid/)
  assert.match(migration, /leads_nurture_stage_check[\s\S]*between 0 and 4[\s\S]*not valid/)
  const tableDefinition = migration.slice(0, migration.indexOf('-- migrate:split'))
  assert.doesNotMatch(tableDefinition, /^\s+(email|phone|ip_address|referrer|token|body|capture_id|key_digest)\s+/im)
})

test('risk-binding migration prospectively enforces the complete accepted decision identity', async () => {
  const migration = await read('../db/migrations/0009_capture_reporting_risk_binding.sql')
  assert.match(migration, /capture_risk_decisions_binding_idx[\s\S]*id, capture_id, request_hash, decision, accepted_at, policy_version/)
  assert.match(migration, /capture_risk_decision = 'accepted'/)
  assert.match(migration, /leads_capture_risk_binding_fk foreign key[\s\S]*capture_risk_decision_id, capture_id, capture_request_hash,[\s\S]*capture_risk_decision, capture_risk_accepted_at, capture_risk_policy_version[\s\S]*references capture_risk_decisions/)
  assert.match(migration, /not valid/)
})

test('aggregate admin report separates durable lead classes from browser events', async () => {
  const source = await read('../lib/db.ts')
  const route = await read('../app/api/admin/capture-report/route.ts')
  assert.match(source, /snapshot \? '_legacy_mongo_id' then 'retired'/)
  assert.match(source, /coalesce\(is_fixture, false\)[\s\S]*then 'test'/)
  assert.match(source, /left join capture_risk_decisions accepted_risk[\s\S]*accepted_risk\.id = leads\.capture_risk_decision_id[\s\S]*accepted_risk\.capture_id = leads\.capture_id[\s\S]*accepted_risk\.request_hash = leads\.capture_request_hash[\s\S]*accepted_risk\.decision = 'accepted'[\s\S]*accepted_risk\.accepted_at = leads\.capture_risk_accepted_at[\s\S]*accepted_risk\.policy_version = leads\.capture_risk_policy_version/)
  assert.match(source, /when accepted_risk\.id is not null then 'genuine'/)
  assert.match(source, /raw_source in \('direct', 'referral', 'google', 'reddit', 'facebook', 'forum', 'email', 'youtube'\)/)
  assert.match(source, /else 'other'/)
  assert.doesNotMatch(source, /then lower\(raw_source\)/)
  assert.match(source, /return \{ window_days: safeDays, durable_leads: leads, capture_events: events \}/)
  assert.match(route, /isAdmin\(\)/)
  assert.match(route, /Cache-Control': 'no-store'/)
})

test('capture route explicitly bounds rejection and unconfirmed persistence evidence', async () => {
  const route = await read('../app/api/insertEmailDocument/route.ts')
  assert.match(route, /recordRejected\('payload_too_large'\)/)
  assert.match(route, /recordRejected\(risk\.reason_code, reportingAttribution\)/)
  assert.match(route, /eventType: 'persistence_unconfirmed'/)
  assert.match(route, /database_or_response_unconfirmed/)
  assert.match(route, /let persistenceAttempted = false/)
  assert.match(route, /persistenceAttempted = true[\s\S]*await insertLead/)
  assert.match(route, /if \(persistenceAttempted\)[\s\S]*eventType: 'persistence_unconfirmed'/)
  assert.match(route, /async function recordRejected[\s\S]*try[\s\S]*capture rejection reporting unavailable/)
  assert.doesNotMatch(route, /recordCaptureReportingEvents\(\[\{[\s\S]{0,250}eventType: 'attempt'[\s\S]{0,250}persistence_unconfirmed/)
})

test('fixture capture requires admin session plus bounded authorization and cannot be public-labeled', async () => {
  const publicRoute = await read('../app/api/insertEmailDocument/route.ts')
  const authorizeRoute = await read('../app/api/admin/capture-fixture/authorize/route.ts')
  const calculator = await read('../app/calculator/page.tsx')
  assert.match(publicRoute, /fixtureAuthorization !== null/)
  assert.match(publicRoute, /isFixture && \(!isAdmin\(\) \|\| !verifyFixtureAuthorization/)
  assert.match(publicRoute, /isFixture,/)
  assert.match(authorizeRoute, /isAllowedCaptureOrigin[\s\S]*isAdmin\(\)/)
  assert.match(authorizeRoute, /createFixtureAuthorization\(process\.env\.ADMIN_TOKEN\)/)
  assert.match(calculator, /capture-fixture\/authorize[\s\S]*x-fastrack-fixture-authorization/)
})

test('ordinary admin cohorts exclude durable fixture rows in SQL', async () => {
  const source = await read('../lib/db.ts')
  assert.match(source, /bySource[\s\S]*coalesce\(is_fixture, false\) = false/)
  assert.match(source, /byStage[\s\S]*coalesce\(is_fixture, false\) = false/)
  assert.match(source, /from sales[\s\S]*not exists \([\s\S]*coalesce\(leads\.is_fixture, false\)/)
  assert.match(source, /from sales[\s\S]*email_messages\.id = sales\.email_message_id and email_messages\.is_fixture/)
  assert.match(source, /email_messages\.is_fixture = false/)
})
