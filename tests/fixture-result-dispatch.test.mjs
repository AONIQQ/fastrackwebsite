import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  FIXTURE_RESULT_DISPATCH_SCOPE,
  FIXTURE_RESULT_DISPATCH_CONTROL,
  RESEND_RESERVED_TEST_RECIPIENTS,
  fixtureResultDispatchRolloutReady,
  fixtureResultDispatchEnabled,
  fixtureResultDispatchResponse,
  isResendReservedTestRecipient,
  parseFixtureResultDispatchBody,
} from '../lib/fixture-result-dispatch.mjs'
import {
  createScopedFixtureAuthorization,
  verifyScopedFixtureAuthorization,
} from '../lib/fixture-authorization.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const captureId = '123e4567-e89b-42d3-a456-426614174000'

test('reserved recipient allowlist is exact, normalized, and never wildcarded', () => {
  assert.deepEqual(RESEND_RESERVED_TEST_RECIPIENTS, [
    'bounced@resend.dev', 'complained@resend.dev', 'delivered@resend.dev', 'suppressed@resend.dev',
  ])
  for (const recipient of RESEND_RESERVED_TEST_RECIPIENTS) {
    assert.equal(isResendReservedTestRecipient(` ${recipient.toUpperCase()} `), true)
  }
  for (const recipient of [
    'person@example.com', 'person@resend.dev', 'delivered+person@resend.dev',
    'delivered@resend.dev.example.com', 'delivered@resend.dev,person@example.com',
  ]) assert.equal(isResendReservedTestRecipient(recipient), false)
})

test('dispatch body accepts only one canonicalizable capture UUID', () => {
  assert.deepEqual(parseFixtureResultDispatchBody({ captureId: captureId.toUpperCase() }), { captureId })
  for (const body of [null, [], {}, { captureId: 'nope' }, { captureId, extra: true }, { capture_id: captureId }]) {
    assert.equal(parseFixtureResultDispatchBody(body), null)
  }
})

test('dispatch authorization is short-lived and bound to action plus capture UUID', () => {
  const secret = 'test-only-admin-secret-at-least-16'
  const now = 1_800_000_000_000
  const token = createScopedFixtureAuthorization(secret, FIXTURE_RESULT_DISPATCH_SCOPE, captureId, now)
  assert.equal(verifyScopedFixtureAuthorization(token, secret, FIXTURE_RESULT_DISPATCH_SCOPE, captureId, now + 1_000), true)
  assert.equal(verifyScopedFixtureAuthorization(token, secret, 'different_action', captureId, now + 1_000), false)
  assert.equal(verifyScopedFixtureAuthorization(token, secret, FIXTURE_RESULT_DISPATCH_SCOPE, '223e4567-e89b-42d3-a456-426614174000', now + 1_000), false)
  assert.equal(verifyScopedFixtureAuthorization(token, secret, FIXTURE_RESULT_DISPATCH_SCOPE, captureId, now + 300_001), false)
})

test('targeted rollout is allowed only while every global send path and public ACK remain stopped', () => {
  const configured = {
    shadowLedger: true, resultsEnqueue: false, resultsDispatch: false, resultsRetry: false,
    nurtureEnqueue: false, nurtureClaim: false, nurtureDispatch: false,
    resendWebhookIngest: true, resendWebhookProject: true, captureAcknowledgement: false,
  }
  const enabled = { [FIXTURE_RESULT_DISPATCH_CONTROL]: '1' }
  assert.equal(fixtureResultDispatchEnabled({}), false)
  assert.equal(fixtureResultDispatchEnabled({ [FIXTURE_RESULT_DISPATCH_CONTROL]: '0' }), false)
  assert.equal(fixtureResultDispatchEnabled({ [FIXTURE_RESULT_DISPATCH_CONTROL]: 'true' }), false)
  assert.equal(fixtureResultDispatchEnabled(enabled), true)
  assert.equal(fixtureResultDispatchRolloutReady({ configurationStatus: 'valid', configured }, enabled), true)
  for (const key of [
    'resultsEnqueue', 'resultsDispatch', 'resultsRetry', 'nurtureEnqueue',
    'nurtureClaim', 'nurtureDispatch', 'captureAcknowledgement',
  ]) assert.equal(fixtureResultDispatchRolloutReady({
    configurationStatus: 'valid', configured: { ...configured, [key]: true },
  }, enabled), false)
  assert.equal(fixtureResultDispatchRolloutReady({
    configurationStatus: 'valid', configured: { ...configured, shadowLedger: false },
  }, enabled), false)
  assert.equal(fixtureResultDispatchRolloutReady({ configurationStatus: 'invalid_dependencies', configured }, enabled), false)
  assert.equal(fixtureResultDispatchRolloutReady({ configurationStatus: 'valid', configured }, {}), false)
})

test('response vocabulary is fixed and identity-free', () => {
  assert.deepEqual(fixtureResultDispatchResponse('accepted'), { ok: true, status: 'fixture_result_accepted' })
  assert.deepEqual(fixtureResultDispatchResponse('stopped'), { ok: false, status: 'fixture_result_stopped' })
  assert.deepEqual(fixtureResultDispatchResponse('failed'), { ok: false, status: 'fixture_result_failed' })
  assert.deepEqual(fixtureResultDispatchResponse('anything'), { ok: false, status: 'fixture_result_blocked' })
})

test('route requires same-origin admin signed authorization before body and rollout work', async () => {
  const route = await read('../app/api/admin/fixture-result-dispatch/route.ts')
  const auth = route.indexOf('!allowedOrigin || !isAdmin()')
  const body = route.indexOf('request.text()')
  const signed = route.indexOf('if (!verifyScopedFixtureAuthorization')
  const rollout = route.indexOf('rolloutConfigurationStatus()')
  const claim = route.indexOf('claimReservedFixtureResult(input.captureId)')
  assert.ok(auth > -1 && auth < body && body < signed && signed < rollout && rollout < claim)
  assert.match(route, /verifyScopedFixtureAuthorization\([\s\S]*authorization, process\.env\.ADMIN_TOKEN, FIXTURE_RESULT_DISPATCH_SCOPE, input\.captureId/)
  assert.match(route, /fixtureResultDispatchRolloutReady\(rollout\)/)
  assert.match(route, /Buffer\.byteLength\(raw, 'utf8'\) > FIXTURE_RESULT_DISPATCH_BODY_LIMIT/)
  assert.doesNotMatch(route, /enqueueShadowResults|claimNextMessage|cron/)
})

test('targeted claim is one atomic reserved fixture compare-and-set', async () => {
  const [ledger, source] = await Promise.all([
    read('../lib/message-ledger.ts'), read('../lib/fixture-result-claim-sql.mjs'),
  ])
  assert.match(source, /capture_id = \$1::uuid/)
  assert.match(source, /kind = 'results'[\s\S]*status = 'pending'[\s\S]*rollout_dispatch_eligible, true\) = false/)
  assert.match(source, /status = 'retryable'[\s\S]*next_attempt_at <= now\(\)/)
  assert.match(source, /status = 'claimed'[\s\S]*claim_expires_at <= now\(\)/)
  assert.match(source, /message_is_fixture and lead_is_fixture[\s\S]*unsubscribed_at is null/)
  assert.match(source, /normalized_recipient = any\(\$4::text\[\]\)/)
  assert.match(source, /active_claim_count = 0[\s\S]*other_dispatch_candidate_count = 0/)
  assert.match(source, /target_message_count = 1/)
  assert.match(source, /for update of m, l/)
  assert.match(source, /on conflict \(email_message_id\) do update[\s\S]*tracking_id = email_message_identities\.tracking_id/)
  assert.match(source, /provider_idempotency_key/)
  assert.doesNotMatch(source, /enqueueShadowResults|claimNextMessage/)
  assert.match(ledger, /sql\.query\(RESERVED_FIXTURE_RESULT_CLAIM_SQL/)
  assert.match(ledger, /authorizedFixtureDispatch[\s\S]*fixture_pending'[\s\S]*fixture_retryable'[\s\S]*fixture_claimed'[\s\S]*message\.is_fixture === true[\s\S]*fixtureResultDispatchRolloutReady/)
})

test('concurrent and repeat calls can claim only the pending ineligible row once', async () => {
  const source = await read('../lib/fixture-result-claim-sql.mjs')
  assert.match(source, /pg_advisory_xact_lock/)
  assert.match(source, /where m\.id = candidate\.id[\s\S]*m\.status = 'pending'[\s\S]*m\.status = 'retryable'[\s\S]*m\.status = 'claimed'/)
  assert.match(source, /attempt_count = attempt_count \+ 1/)
})
