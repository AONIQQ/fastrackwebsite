import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  FIXTURE_RESULT_DISPATCH_CONTROL,
  FIXTURE_RESULT_QUARANTINE_SCOPE,
  fixtureResultQuarantineResponse,
  fixtureResultQuarantineRolloutReady,
  parseFixtureResultDispatchBody,
} from '../lib/fixture-result-dispatch.mjs'
import { createScopedFixtureAuthorization, verifyScopedFixtureAuthorization } from '../lib/fixture-authorization.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const captureId = '123e4567-e89b-42d3-a456-426614174000'
const secret = 'fixture-quarantine-test-secret'

test('quarantine authorization is purpose-separated, capture-bound, and short-lived', () => {
  const now = Date.now()
  const token = createScopedFixtureAuthorization(secret, FIXTURE_RESULT_QUARANTINE_SCOPE, captureId, now)
  assert.equal(verifyScopedFixtureAuthorization(token, secret, FIXTURE_RESULT_QUARANTINE_SCOPE, captureId, now + 1_000), true)
  assert.equal(verifyScopedFixtureAuthorization(token, secret, 'fixture_result_dispatch', captureId, now + 1_000), false)
  assert.equal(verifyScopedFixtureAuthorization(token, secret, FIXTURE_RESULT_QUARANTINE_SCOPE, '223e4567-e89b-42d3-a456-426614174000', now + 1_000), false)
  assert.equal(verifyScopedFixtureAuthorization(token, secret, FIXTURE_RESULT_QUARANTINE_SCOPE, captureId, now + 300_001), false)
})

test('quarantine accepts only the exact bounded capture body and fixed responses', () => {
  assert.deepEqual(parseFixtureResultDispatchBody({ captureId }), { captureId })
  for (const body of [null, {}, { captureId, extra: true }, { captureId: 'bad' }, [captureId]]) {
    assert.equal(parseFixtureResultDispatchBody(body), null)
  }
  assert.deepEqual(fixtureResultQuarantineResponse('quarantined'), { ok: true, status: 'fixture_result_quarantined' })
  assert.deepEqual(fixtureResultQuarantineResponse('blocked'), { ok: false, status: 'fixture_result_quarantine_blocked' })
})

test('quarantine gate requires exact fixture gate on and every global producer or dispatcher off', () => {
  const configured = {
    shadowLedger: false, resultsEnqueue: false, resultsDispatch: false, resultsRetry: false,
    nurtureEnqueue: false, nurtureClaim: false, nurtureDispatch: false, captureAcknowledgement: false,
  }
  const snapshot = { configurationStatus: 'valid', configured }
  assert.equal(fixtureResultQuarantineRolloutReady(snapshot, { [FIXTURE_RESULT_DISPATCH_CONTROL]: '1' }), true)
  assert.equal(fixtureResultQuarantineRolloutReady({ ...snapshot, configured: { ...configured, shadowLedger: true } }, { [FIXTURE_RESULT_DISPATCH_CONTROL]: '1' }), true)
  assert.equal(fixtureResultQuarantineRolloutReady(snapshot, { [FIXTURE_RESULT_DISPATCH_CONTROL]: '0' }), false)
  for (const key of ['resultsEnqueue', 'resultsDispatch', 'resultsRetry', 'nurtureEnqueue', 'nurtureClaim', 'nurtureDispatch', 'captureAcknowledgement']) {
    assert.equal(fixtureResultQuarantineRolloutReady({ ...snapshot, configured: { ...configured, [key]: true } }, { [FIXTURE_RESULT_DISPATCH_CONTROL]: '1' }), false)
  }
})

test('routes enforce same-origin admin, 512-byte body, quarantine scope, and never dispatch', async () => {
  const [authorize, route, ledger, sql] = await Promise.all([
    read('../app/api/admin/fixture-result-quarantine/authorize/route.ts'),
    read('../app/api/admin/fixture-result-quarantine/route.ts'),
    read('../lib/message-ledger.ts'),
    read('../lib/fixture-result-quarantine-sql.mjs'),
  ])
  for (const source of [authorize, route]) {
    assert.match(source, /isAllowedCaptureOrigin/)
    assert.match(source, /isAdmin\(\)/)
    assert.match(source, /FIXTURE_RESULT_DISPATCH_BODY_LIMIT/)
    assert.match(source, /parseFixtureResultDispatchBody/)
  }
  assert.match(authorize, /createScopedFixtureAuthorization\([\s\S]*FIXTURE_RESULT_QUARANTINE_SCOPE[\s\S]*input\.captureId/)
  assert.match(route, /verifyScopedFixtureAuthorization\([\s\S]*FIXTURE_RESULT_QUARANTINE_SCOPE[\s\S]*input\.captureId/)
  assert.match(route, /fixtureResultQuarantineRolloutReady/)
  assert.match(ledger, /sql\.query\(RESERVED_FIXTURE_RESULT_QUARANTINE_SQL/)
  assert.doesNotMatch(route, /dispatchClaimedMessage|sendResultsEmail|sendNurtureStep/)
  assert.doesNotMatch(sql, /email_provider_events|delete|provider_message_id\s*=/i)
})
