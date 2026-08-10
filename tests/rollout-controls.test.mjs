import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { claimable } from '../lib/message-policy.mjs'
import {
  ROLLOUT_CONTROL_NAMES,
  canClaimMessage,
  captureAcknowledgementReady,
  publicRolloutStatus,
  rolloutControls,
  rolloutDependencyWarnings,
} from '../lib/rollout-controls.mjs'

const allEnabled = () => Object.fromEntries(Object.keys(ROLLOUT_CONTROL_NAMES).map((key) => [key, true]))

test('every rollout control is exact-on and fails closed when missing or malformed', () => {
  const empty = rolloutControls({})
  assert.deepEqual(Object.values(empty), Object.values(empty).map(() => false))

  for (const [key, name] of Object.entries(ROLLOUT_CONTROL_NAMES)) {
    const enabled = rolloutControls({ [name]: '1' })
    assert.equal(enabled[key], true, name)
    assert.equal(Object.entries(enabled).filter(([, value]) => value).length, 1)
    for (const malformed of ['true', 'yes', '01', ' 1 ', '2']) {
      assert.equal(rolloutControls({ [name]: malformed })[key], false, `${name}=${malformed}`)
    }
    assert.equal(rolloutControls({ [name]: '0' })[key], false)
  }
})

test('control status reveals only enabled and configuration classification', () => {
  const status = publicRolloutStatus({
    [ROLLOUT_CONTROL_NAMES.shadowLedger]: '1',
    [ROLLOUT_CONTROL_NAMES.resultsEnqueue]: 'not-valid',
  })
  assert.deepEqual(status.controls.shadowLedger, { enabled: true, configuration: 'valid' })
  assert.deepEqual(status.controls.resultsEnqueue, { enabled: false, configuration: 'malformed' })
  assert.equal(JSON.stringify(status).includes('not-valid'), false)
})

test('capture acknowledgement requires durable shadow creation and results enqueue', () => {
  const controls = allEnabled()
  assert.equal(captureAcknowledgementReady(controls), true)
  for (const key of ['captureAcknowledgement', 'shadowLedger', 'resultsEnqueue']) {
    assert.equal(captureAcknowledgementReady({ ...controls, [key]: false }), false, key)
  }
})

test('dependency warnings describe every unsafe staged transition', () => {
  assert.deepEqual(rolloutDependencyWarnings({ ...rolloutControls({}), resultsEnqueue: true }), [
    'results_enqueue_requires_shadow_ledger',
  ])
  assert.deepEqual(rolloutDependencyWarnings({ ...rolloutControls({}), resultsDispatch: true }), [
    'results_dispatch_requires_results_enqueue',
  ])
  assert.deepEqual(rolloutDependencyWarnings({ ...rolloutControls({}), resultsRetry: true }), [
    'results_retry_requires_results_dispatch',
  ])
  assert.deepEqual(rolloutDependencyWarnings({ ...rolloutControls({}), nurtureClaim: true }), [
    'nurture_claim_requires_nurture_enqueue',
  ])
  assert.deepEqual(rolloutDependencyWarnings({ ...rolloutControls({}), nurtureDispatch: true }), [
    'nurture_dispatch_requires_nurture_claim',
  ])
  assert.deepEqual(rolloutDependencyWarnings({ ...rolloutControls({}), resendWebhookProject: true }), [
    'resend_projection_requires_ingestion',
  ])
})

test('results initial dispatch and retries are independently controlled', () => {
  const stopped = rolloutControls({})
  assert.equal(canClaimMessage('results', 'pending', stopped), false)
  assert.equal(canClaimMessage('results', 'retryable', stopped), false)

  const initialOnly = { ...stopped, resultsDispatch: true }
  assert.equal(canClaimMessage('results', 'pending', initialOnly), true)
  assert.equal(canClaimMessage('results', 'retryable', initialOnly), false)
  assert.equal(canClaimMessage('results', 'claimed', initialOnly), false)

  const recovery = { ...initialOnly, resultsRetry: true }
  assert.equal(canClaimMessage('results', 'retryable', recovery), true)
  assert.equal(canClaimMessage('results', 'claimed', recovery), true)
})

test('nurture never claims unless claim and dispatch controls both permit a send', () => {
  const stopped = rolloutControls({})
  for (const status of ['pending', 'retryable', 'claimed']) {
    assert.equal(canClaimMessage('nurture', status, { ...stopped, nurtureClaim: true }), false)
    assert.equal(canClaimMessage('nurture', status, { ...stopped, nurtureDispatch: true }), false)
    assert.equal(canClaimMessage('nurture', status, { ...stopped, nurtureClaim: true, nurtureDispatch: true }), true)
  }
})

test('stopping claims preserves leases until expiry and permits recovery only after re-enable', () => {
  const now = 10_000
  const enabled = { ...rolloutControls({}), nurtureClaim: true, nurtureDispatch: true }
  const stopped = { ...enabled, nurtureClaim: false }
  const mayClaim = (controls, expiry) => canClaimMessage('nurture', 'claimed', controls)
    && claimable('claimed', now, now, expiry)

  assert.equal(mayClaim(enabled, now + 1), false)
  assert.equal(mayClaim(stopped, now), false)
  assert.equal(mayClaim(enabled, now), true)
})

test('source binds each control to its state-changing boundary and aggregate-only status', async () => {
  const [route, db, ledger, cron, webhook, providerLedger, statusRoute, status, migration] = await Promise.all([
    readFile(new URL('../app/api/insertEmailDocument/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/db.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/message-ledger.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/cron/nurture/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/webhooks/resend/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/resend-event-ledger.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/rollout-status/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/rollout-status.ts', import.meta.url), 'utf8'),
    readFile(new URL('../db/migrations/0011_email_rollout_controls.sql', import.meta.url), 'utf8'),
  ])
  assert.match(route, /captureAcknowledgementReady\(controls\)/)
  assert.match(route, /createShadowLedger: controls\.shadowLedger/)
  assert.match(route, /enqueueResults: controls\.resultsEnqueue/)
  assert.match(db, /where \$\{lead\.createShadowLedger\}/)
  assert.match(db, /rollout_dispatch_eligible[\s\S]*\$\{lead\.enqueueResults\}/)
  assert.match(ledger, /canClaimMessage\(kind, 'pending', controls\)/)
  assert.match(ledger, /coalesce\(m\.rollout_dispatch_eligible, true\)/)
  assert.match(ledger, /if \(!controls\.nurtureEnqueue\) return 0/)
  assert.match(ledger, /enqueueShadowResults[\s\S]*if \(!controls\.resultsEnqueue\) return 0[\s\S]*for update skip locked/)
  assert.match(cron, /projectResendEventBacklog/)
  assert.match(webhook, /ingestionEnabled: controls\.resendWebhookIngest/)
  assert.match(webhook, /projectionEnabled: controls\.resendWebhookProject/)
  assert.match(providerLedger, /projectResendEventBacklog[\s\S]*candidate_events[\s\S]*limit \$\{boundedLimit\}/)
  assert.match(statusRoute, /if \(!isAdmin\(\)\)/)
  assert.match(statusRoute, /Cache-Control': 'no-store'/)
  assert.doesNotMatch(status, /select[\s\S]*(?:lead_row\.email|lead_row\.phone|provider_message_id|provider_event_id|tracking_id|claim_token)/i)
  assert.match(migration, /add column if not exists rollout_dispatch_eligible boolean default true/)
})
