import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  attributionValidity,
  boundedCaptureReportEvent,
  reportingReasonForInputError,
} from '../lib/capture-reporting.mjs'
import { acknowledgeResultDisplay, CaptureRequestError } from '../lib/capture-client.mjs'

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

test('aggregate admin report separates durable lead classes from browser events', async () => {
  const source = await read('../lib/db.ts')
  const route = await read('../app/api/admin/capture-report/route.ts')
  assert.match(source, /snapshot \? '_legacy_mongo_id' then 'retired'/)
  assert.match(source, /coalesce\(is_fixture, false\)[\s\S]*then 'test'/)
  assert.match(source, /capture_id is not null and capture_risk_accepted_at is not null then 'genuine'/)
  assert.match(source, /raw_source ~ '\^\[A-Za-z0-9\]\[A-Za-z0-9\._-\]\{0,63\}\$'/)
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
  assert.doesNotMatch(route, /recordCaptureReportingEvents\(\[\{[\s\S]{0,250}eventType: 'attempt'[\s\S]{0,250}persistence_unconfirmed/)
})
