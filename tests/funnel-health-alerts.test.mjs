import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  actionableFunnelIssues,
  assertOwnerAlertPrivacy,
  buildOwnerAlert,
  issueFingerprint,
  runFunnelHealthAlert,
} from '../lib/funnel-health-alerts.mjs'
import { STRIPE_REQUIRED_EVENTS, STRIPE_WEBHOOK_URL, verifyStripeWebhookRegistration } from '../lib/stripe-registration.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const healthy = () => ({
  generated_at: '2026-08-14T18:00:00.000Z',
  status: 'WARNING',
  component_status: { cron: 'READY', stripe_registration: 'READY', whop_instrumentation: 'WARNING', resend_callbacks: 'WARNING' },
  rollout: {
    controls: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`control${index}`, { configuration: 'valid', effective: true }])),
    dependency_status: 'valid', dependency_warnings: [],
  },
  capture: { persistence_uncertain_24h: 0 },
  nurture_cron: { freshness_hours: 3, latest: { failed: 0, failure_category: null } },
  messages: {
    results: { due: 0, oldest_due_at: null, retryable: 0, terminal_failed: 0 },
    nurture: { due: 0, oldest_due_at: null, retryable: 0, terminal_failed: 0 },
  },
  leases: { expired: 0 },
  resend: { projection_pending: 0, failed_7d: 0, bounced_7d: 0, complained_7d: 0, unmatched_24h: 256 },
  whop: { status: 'WARNING', webhook: { registration_status: 'PENDING_RUNTIME_PROOF' } },
})

test('known noncustomer warnings do not trigger owner alerts', () => {
  const issues = actionableFunnelIssues(healthy())
  assert.deepEqual(issues, [])
  assert.equal(issueFingerprint(issues), null)
})

test('actionable vocabulary covers every customer-path failure without raw detail', () => {
  const report = healthy()
  report.component_status.cron = 'CRITICAL'
  report.component_status.stripe_registration = 'WARNING'
  report.rollout.controls.control0 = { configuration: 'malformed', effective: false }
  report.rollout.controls.control1 = { configuration: 'valid', effective: false }
  report.rollout.dependency_status = 'invalid'
  report.rollout.dependency_warnings = ['raw_dependency_name_must_not_escape']
  report.capture.persistence_uncertain_24h = 2
  report.nurture_cron.latest = { failed: 3, failure_category: 'raw_provider_error_must_not_escape' }
  report.messages.results = { due: 2, oldest_due_at: '2026-08-14T15:00:00.000Z', retryable: 2, terminal_failed: 1 }
  report.messages.nurture = { due: 1, oldest_due_at: '2026-08-13T15:00:00.000Z', retryable: 1, terminal_failed: 1 }
  report.leases.expired = 1
  report.resend = { ...report.resend, projection_pending: 2, failed_7d: 1, bounced_7d: 1, complained_7d: 1 }
  const issues = actionableFunnelIssues(report)
  const codes = new Set(issues.map(({ code }) => code))
  for (const code of [
    'CONTROLS_INVALID', 'CONTROLS_INEFFECTIVE', 'DEPENDENCIES_INVALID', 'CAPTURE_PERSISTENCE_UNCERTAIN',
    'NURTURE_CRON_FAILED', 'RESULTS_WORK_OLD', 'NURTURE_WORK_OLD', 'MESSAGE_LEASE_EXPIRED',
    'RESEND_PROJECTION_BACKLOG', 'MESSAGE_RETRYABLE', 'RESULTS_MESSAGE_TERMINAL',
    'NURTURE_MESSAGE_TERMINAL', 'ORDINARY_PROVIDER_FAILURE', 'ORDINARY_PROVIDER_COMPLAINT',
    'STRIPE_REGISTRATION_STALE',
  ]) assert.ok(codes.has(code), code)
  const message = assertOwnerAlertPrivacy(buildOwnerAlert('alert', issues, report.generated_at))
  assert.doesNotMatch(JSON.stringify(message), /raw_dependency|raw_provider|@|\.invalid/i)
})

test('fingerprints are deterministic, order-stable, and materiality-bucketed', () => {
  const a = [{ code: 'MESSAGE_RETRYABLE', level: 'WARNING', count: 2 }]
  const b = [{ code: 'MESSAGE_RETRYABLE', level: 'WARNING', count: 2 }]
  const c = [{ code: 'MESSAGE_RETRYABLE', level: 'WARNING', count: 5 }]
  assert.equal(issueFingerprint(a), issueFingerprint([...a]))
  assert.equal(issueFingerprint(a), issueFingerprint(b))
  assert.notEqual(issueFingerprint(a), issueFingerprint(c))
})

function fakeState() {
  let alerted = null
  let pending = null
  let lease = false
  let sequence = 0
  return {
    claim: async (fingerprint, messages) => {
      if (lease) return null
      if (pending) { lease = true; return pending }
      const kind = fingerprint == null ? (alerted == null ? null : 'recovery') : (alerted === fingerprint ? null : 'alert')
      if (!kind) { pending = null; return null }
      if (!pending || pending.kind !== kind || pending.fingerprint !== (fingerprint ?? alerted)) {
        sequence += 1
        pending = { kind, fingerprint: fingerprint ?? alerted, token: `token-${sequence}`, idempotencyKey: `funnel-health-${sequence}-${kind}`, message: structuredClone(messages[kind]) }
      }
      lease = true
      return pending
    },
    complete: async (token) => {
      assert.equal(token, pending.token)
      alerted = pending.kind === 'alert' ? pending.fingerprint : null
      pending = null
      lease = false
    },
    release: async (token) => { assert.equal(token, pending.token); lease = false },
    expire: () => { lease = false },
  }
}

test('concurrent invocations send once, repeat is a no-op, and recovery sends once', async () => {
  const state = fakeState()
  const report = healthy()
  report.capture.persistence_uncertain_24h = 1
  const sent = []
  const dependencies = {
    report: async () => structuredClone(report), ...state,
    send: async (message) => { sent.push(message) },
  }
  const results = await Promise.all([runFunnelHealthAlert(dependencies), runFunnelHealthAlert(dependencies)])
  assert.equal(results.filter((result) => result.sent).length, 1)
  assert.equal(sent.length, 1)
  assert.equal((await runFunnelHealthAlert(dependencies)).sent, false)
  report.capture.persistence_uncertain_24h = 0
  assert.deepEqual((await runFunnelHealthAlert(dependencies)).kind, 'recovery')
  assert.equal((await runFunnelHealthAlert(dependencies)).sent, false)
  assert.equal(sent.length, 2)
})

test('provider failure releases the durable transition for a same-key retry', async () => {
  const state = fakeState()
  const report = healthy()
  report.leases.expired = 1
  const keys = []
  let attempts = 0
  const dependencies = {
    report: async () => structuredClone(report), ...state,
    send: async ({ idempotencyKey }) => {
      keys.push(idempotencyKey)
      attempts += 1
      if (attempts === 1) throw new Error('raw provider error')
    },
  }
  assert.equal((await runFunnelHealthAlert(dependencies)).failure, 'provider_rejected')
  assert.equal((await runFunnelHealthAlert(dependencies)).sent, true)
  assert.deepEqual(keys, [keys[0], keys[0]])
})

test('accepted-provider completion gaps preserve transition truth across changed health', async () => {
  const state = fakeState()
  const report = healthy()
  report.leases.expired = 1
  const keys = []
  let failComplete = true
  const dependencies = {
    report: async () => structuredClone(report),
    claim: state.claim, release: state.release,
    send: async ({ idempotencyKey }) => { keys.push(idempotencyKey) },
    complete: async (token) => {
      if (failComplete) { failComplete = false; throw new Error('database completion failed') }
      return state.complete(token)
    },
  }
  await assert.rejects(() => runFunnelHealthAlert(dependencies), /database completion failed/)
  report.leases.expired = 0
  state.expire()
  assert.equal((await runFunnelHealthAlert(dependencies)).kind, 'alert')
  assert.equal(keys[0], keys[1])
  assert.equal((await runFunnelHealthAlert(dependencies)).kind, 'recovery')

  report.leases.expired = 1
  assert.equal((await runFunnelHealthAlert(dependencies)).kind, 'alert')
  report.leases.expired = 0
  failComplete = true
  await assert.rejects(() => runFunnelHealthAlert(dependencies), /database completion failed/)
  report.leases.expired = 1
  state.expire()
  assert.equal((await runFunnelHealthAlert(dependencies)).kind, 'recovery')
  assert.equal((await runFunnelHealthAlert(dependencies)).kind, 'alert')
})

test('a process death after claim retries the exact durable message snapshot', async () => {
  const state = fakeState()
  const report = healthy()
  report.leases.expired = 1
  const firstIssues = actionableFunnelIssues(report)
  const firstMessage = buildOwnerAlert('alert', firstIssues, report.generated_at)
  const claimed = await state.claim(issueFingerprint(firstIssues), { alert: firstMessage, recovery: buildOwnerAlert('recovery', [], report.generated_at) })
  assert.ok(claimed)
  report.leases.expired = 0
  report.capture.persistence_uncertain_24h = 5
  state.expire()
  const sent = []
  const result = await runFunnelHealthAlert({
    report: async () => structuredClone(report), ...state,
    send: async (message) => { sent.push(message) },
  })
  assert.equal(result.kind, 'alert')
  assert.equal(sent[0].subject, firstMessage.subject)
  assert.equal(sent[0].text, firstMessage.text)
  assert.doesNotMatch(sent[0].text, /Capture persistence uncertain/)
})

test('live Stripe registration verification is exact, provider-free injectable, and fail closed', async () => {
  const endpoint = { url: STRIPE_WEBHOOK_URL, status: 'enabled', enabled_events: [...STRIPE_REQUIRED_EVENTS].reverse() }
  const response = (data, ok = true) => async () => ({ ok, json: async () => ({ data }) })
  assert.equal(await verifyStripeWebhookRegistration('sk_test_fixture', response([endpoint])), 'VERIFIED')
  assert.equal(await verifyStripeWebhookRegistration('sk_test_fixture', response([{ ...endpoint, enabled_events: [...STRIPE_REQUIRED_EVENTS, 'customer.created'] }])), 'INVALID')
  assert.equal(await verifyStripeWebhookRegistration('sk_test_fixture', response([])), 'INVALID')
  assert.equal(await verifyStripeWebhookRegistration('sk_test_fixture', response([endpoint, endpoint])), 'INVALID')
  assert.equal(await verifyStripeWebhookRegistration(undefined, response([endpoint])), 'UNVERIFIED')
  assert.equal(await verifyStripeWebhookRegistration('sk_test_fixture', async () => { throw new Error('raw provider detail') }), 'UNVERIFIED')
  assert.equal(await verifyStripeWebhookRegistration('sk_test_fixture', response([], false)), 'UNVERIFIED')
  const started = Date.now()
  assert.equal(await verifyStripeWebhookRegistration('sk_test_fixture', async () => new Promise(() => {}), 5), 'UNVERIFIED')
  assert.ok(Date.now() - started < 250)
})

test('route is authenticated, owner-only, Resend-only, and hourly schedule is static', async () => {
  const [route, schedule, state, migration] = await Promise.all([
    read('../app/api/cron/funnel-health-alert/route.ts'), read('../vercel.json'),
    read('../lib/funnel-health-alert-state.ts'), read('../db/migrations/0014_funnel_health_alert_state.sql'),
  ])
  assert.match(route, /auth !== `Bearer \$\{process\.env\.CRON_SECRET\}`/)
  assert.match(route, /const OWNER_INBOX = 'info@fastrack\.school'/)
  assert.match(route, /sendViaResend/)
  assert.match(route, /if \(!receipt\.messageId\) throw new Error\('owner_alert_provider_receipt_missing'\)/)
  assert.match(route, /verifyStripeWebhookRegistration\(process\.env\.STRIPE_SECRET_KEY\)/)
  assert.doesNotMatch(route, /sendMail\(/)
  assert.match(schedule, /"path": "\/api\/cron\/funnel-health-alert"[\s\S]*"schedule": "17 \* \* \* \*"/)
  assert.match(state, /pg_advisory_xact_lock/)
  assert.match(state, /claim_expires_at/)
  assert.match(state, /transition_sequence/)
  assert.match(state, /pending_message/)
  assert.match(migration, /funnel_health_alert_state/)
  assert.doesNotMatch(migration, /\b(?:email|phone|recipient|payload|provider_message_id|provider_event_id|tracking_id|capture_id|lead_id)\b/i)
})

test('privacy assertion rejects identities and raw provider errors', () => {
  assert.throws(() => assertOwnerAlertPrivacy({ text: 'person@example.com' }), /disallowed_detail/)
  assert.throws(() => assertOwnerAlertPrivacy({ text: 'provider error detail' }), /disallowed_detail/)
})
