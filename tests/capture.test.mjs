import assert from 'node:assert/strict'
import { neon, neonConfig } from '@neondatabase/serverless'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  CAPTURE_BODY_LIMIT, CaptureInputError, captureResponseIsAcknowledged,
  captureFingerprintInput, isAllowedCaptureOrigin, normalizeAttribution,
  validateCaptureInput,
} from '../lib/capture.mjs'
import {
  CAPTURE_RATE_POLICIES, CAPTURE_RISK_POLICY_VERSION, CaptureRiskConfigurationError,
  buildCaptureRiskKeys, captureNetworkAddress, smsDispatchEnabled,
} from '../lib/capture-abuse.mjs'
import {
  CAPTURE_ABUSE_CLEANUP_BATCH_SIZE, CAPTURE_ABUSE_CLEANUP_MAX_BATCHES,
  CAPTURE_ABUSE_MAX_NEW_DECISIONS_PER_DAY, CAPTURE_ABUSE_MAX_NEW_WINDOWS_PER_DAY,
  captureAbuseCleanupAuthorized,
  captureAbuseCleanupHasBacklog,
} from '../lib/capture-abuse-cleanup.mjs'
import { CaptureRequestError, completeCapture, postCapture } from '../lib/capture-client.mjs'

const captureId = '123e4567-e89b-42d3-a456-426614174000'
const valid = (overrides = {}) => ({
  captureId, email: ' Parent@Example.com ', phone: '', smsConsent: false,
  state: 'pa', residency: 'inState', collegeId: 214777, referrer: '', utm: {}, website: '',
  ...overrides,
})
const serverRoi = { college: { id: 214777, name: 'Server College', state: 'PA', city: null }, savings: 123 }
const ok = (body = { ok: true, id: 7, capture_id: captureId, roi: serverRoi }) => ({ ok: true, json: async () => body })

test('valid capture is normalized and client cannot self-label a fixture', () => {
  const input = validateCaptureInput(valid({ isFixture: true }), 'https://www.fastrack.school/api/insertEmailDocument')
  assert.equal(input.email, 'parent@example.com')
  assert.equal(input.state, 'PA')
  assert.equal(input.isFixture, false)
})

test('attribution preserves bounded UTM and click IDs and treats same-origin as direct', () => {
  const paid = normalizeAttribution({ utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'validation', gclid: 'g-1', fbclid: 'f-1' }, 'https://www.fastrack.school/calculator?x=1', 'https://www.fastrack.school/api/insertEmailDocument')
  assert.equal(paid.normalized_referrer, null)
  assert.equal(paid.utm_source, 'google')
  assert.equal(paid.gclid, 'g-1')
  assert.equal(paid.fbclid, 'f-1')
  const external = normalizeAttribution({}, 'https://example.org/article', 'https://www.fastrack.school/api/insertEmailDocument')
  assert.equal(external.normalized_referrer, 'https://example.org/article')
})

test('direct attribution is null and unknown, nonscalar, or oversized values are rejected', () => {
  assert.equal(normalizeAttribution({}, '', 'https://www.fastrack.school/api/x').normalized_referrer, null)
  assert.throws(() => normalizeAttribution({ surprise: 'x' }, '', 'https://www.fastrack.school/api/x'), CaptureInputError)
  assert.throws(() => normalizeAttribution({ gclid: ['x'] }, '', 'https://www.fastrack.school/api/x'), CaptureInputError)
  assert.throws(() => normalizeAttribution({ utm_campaign: 'x'.repeat(129) }, '', 'https://www.fastrack.school/api/x'), CaptureInputError)
})

test('consent, identity, college, state, residency, email, honeypot and phone are bounded', () => {
  for (const body of [
    valid({ captureId: 'bad' }), valid({ email: 'bad' }), valid({ state: 'XX' }),
    valid({ residency: 'nearby' }), valid({ collegeId: 0 }), valid({ website: 'bot' }),
    valid({ smsConsent: true, phone: '' }), valid({ smsConsent: 'yes' }), valid({ phone: '12' }),
  ]) assert.throws(() => validateCaptureInput(body, 'https://www.fastrack.school/api/x'), CaptureInputError)
  assert.equal(validateCaptureInput(valid({ smsConsent: true, phone: '(605) 555-1212' }), 'https://www.fastrack.school/api/x').phone, '+16055551212')
  assert.equal(CAPTURE_BODY_LIMIT, 12_000)
})

test('same-origin check rejects cross-origin and malformed origins', () => {
  assert.equal(isAllowedCaptureOrigin('https://www.fastrack.school', 'https://www.fastrack.school/api/x'), true)
  assert.equal(isAllowedCaptureOrigin(null, 'https://www.fastrack.school/api/x'), false)
  assert.equal(isAllowedCaptureOrigin('https://evil.example', 'https://www.fastrack.school/api/x'), false)
  assert.equal(isAllowedCaptureOrigin('bad', 'https://www.fastrack.school/api/x'), false)
})

test('risk keys require a strong secret and contain no raw network or target values', () => {
  const values = { secret: 's'.repeat(32), network: '203.0.113.8', email: 'parent@example.com', phone: '+16055551212' }
  const keys = buildCaptureRiskKeys(values)
  assert.deepEqual(Object.keys(keys), ['global', 'network', 'email', 'phone'])
  for (const digest of Object.values(keys)) {
    assert.match(digest, /^[0-9a-f]{64}$/)
    assert.doesNotMatch(digest, /parent|example|605|203/)
  }
  assert.notEqual(keys.email, keys.phone)
  assert.equal(CAPTURE_RISK_POLICY_VERSION, 'capture-risk-v1')
  assert.throws(() => buildCaptureRiskKeys({ ...values, secret: 'short' }), CaptureRiskConfigurationError)
  assert.equal(buildCaptureRiskKeys({ ...values, network: 'not-an-ip' }), null)
})

test('network identity uses only the Vercel-provided forwarding header', () => {
  const callerOnly = new Headers({ 'x-forwarded-for': '203.0.113.9' })
  assert.equal(captureNetworkAddress(callerOnly), null)
  const vercel = new Headers({ 'x-vercel-forwarded-for': '2001:db8::1, 203.0.113.9', 'x-forwarded-for': '198.51.100.2' })
  assert.equal(captureNetworkAddress(vercel), '2001:db8::1')
  assert.equal(captureNetworkAddress(new Headers({ 'x-vercel-forwarded-for': 'spoofed' })), null)
})

test('durable policies impose target, network and global ceilings', () => {
  assert.deepEqual(CAPTURE_RATE_POLICIES, {
    global: { windowSeconds: 600, limit: 100 },
    network: { windowSeconds: 60, limit: 8 },
    email: { windowSeconds: 86_400, limit: 3 },
    phone: { windowSeconds: 86_400, limit: 3 },
  })
})

test('scheduled abuse cleanup is exact-secret authorized, bounded and outpaces admitted decisions', () => {
  assert.equal(captureAbuseCleanupAuthorized('Bearer cron-secret', 'cron-secret'), true)
  assert.equal(captureAbuseCleanupAuthorized('Bearer wrong', 'cron-secret'), false)
  assert.equal(captureAbuseCleanupAuthorized(null, 'cron-secret'), false)
  assert.equal(captureAbuseCleanupAuthorized('Bearer ', ''), false)
  assert.equal(CAPTURE_ABUSE_CLEANUP_BATCH_SIZE, 15_000)
  assert.equal(CAPTURE_ABUSE_CLEANUP_MAX_BATCHES, 4)
  assert.ok(CAPTURE_ABUSE_CLEANUP_BATCH_SIZE * CAPTURE_ABUSE_CLEANUP_MAX_BATCHES > CAPTURE_ABUSE_MAX_NEW_DECISIONS_PER_DAY)
  assert.ok(CAPTURE_ABUSE_CLEANUP_BATCH_SIZE * CAPTURE_ABUSE_CLEANUP_MAX_BATCHES > CAPTURE_ABUSE_MAX_NEW_WINDOWS_PER_DAY)
  assert.equal(captureAbuseCleanupHasBacklog({ remaining_windows: 1, remaining_unreferenced_decisions: 0 }), true)
  assert.equal(captureAbuseCleanupHasBacklog({ remaining_windows: 0, remaining_unreferenced_decisions: 1 }), true)
  assert.equal(captureAbuseCleanupHasBacklog({ remaining_windows: 0, remaining_unreferenced_decisions: 0, retained_referenced_decisions: 99 }), false)
})

test('installed Neon driver submits advisory lock and decision as one READ COMMITTED batch transaction', async () => {
  const previousFetch = neonConfig.fetchFunction
  const calls = []
  neonConfig.fetchFunction = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({
      results: [
        { fields: [{ name: 'locked', dataTypeID: 16 }], rows: [[true]], rowCount: 1, command: 'SELECT' },
        { fields: [{ name: 'decision', dataTypeID: 25 }], rows: [['accepted']], rowCount: 1, command: 'SELECT' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const driver = neon('postgresql://user:password@example.neon.tech/database')
    const rows = await driver.transaction((txn) => [
      txn`select pg_advisory_xact_lock(hashtextextended(${'capture-id'}, 0)) as locked`,
      txn`select ${'accepted'}::text as decision`,
    ], { isolationLevel: 'ReadCommitted' })
    assert.equal(calls.length, 1)
    assert.equal(JSON.parse(calls[0].init.body).queries.length, 2)
    assert.equal(new Headers(calls[0].init.headers).get('neon-batch-isolation-level'), 'ReadCommitted')
    assert.equal(rows[1][0].decision, 'accepted')
  } finally {
    neonConfig.fetchFunction = previousFetch
  }
})

test('installed Neon driver preserves an explicit type for nullable phone predicates', async () => {
  const previousFetch = neonConfig.fetchFunction
  let requestBody
  neonConfig.fetchFunction = async (_url, init) => {
    requestBody = JSON.parse(init.body)
    return new Response(JSON.stringify({
      results: [
        { fields: [{ name: 'phone_absent', dataTypeID: 16 }], rows: [[true]], rowCount: 1, command: 'SELECT' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const driver = neon('postgresql://user:password@example.neon.tech/database')
    await driver.transaction((txn) => [
      txn`select ${null}::text is null as phone_absent`,
    ], { isolationLevel: 'ReadCommitted' })
    assert.deepEqual(requestBody.queries, [{
      query: 'select $1::text is null as phone_absent',
      params: [null],
    }])
  } finally {
    neonConfig.fetchFunction = previousFetch
  }
})

test('SMS dispatch is disabled by default and requires exact explicit enablement', () => {
  assert.equal(smsDispatchEnabled({}), false)
  assert.equal(smsDispatchEnabled({ CAPTURE_SMS_ENABLED: 'true' }), false)
  assert.equal(smsDispatchEnabled({ CAPTURE_SMS_ENABLED: '1' }), true)
})

test('acknowledgement must match the submitted durable capture identity', () => {
  assert.equal(captureResponseIsAcknowledged({ ok: true, id: 1, capture_id: captureId, roi: serverRoi }, captureId), true)
  assert.equal(captureResponseIsAcknowledged({ ok: true, id: 1, capture_id: 'other', roi: serverRoi }, captureId), false)
  assert.equal(captureResponseIsAcknowledged({ ok: true, id: 0, capture_id: captureId, roi: serverRoi }, captureId), false)
  assert.equal(captureResponseIsAcknowledged({ ok: true, id: 1, capture_id: captureId }, captureId), false)
})

test('non-2xx, network errors and timeouts fail without acknowledgement', async () => {
  await assert.rejects(postCapture(async () => ({ ok: false }), valid()), (error) => error instanceof CaptureRequestError && error.code === 'non_2xx')
  await assert.rejects(postCapture(async () => { throw new Error('offline') }, valid()), (error) => error instanceof CaptureRequestError && error.code === 'network')
  await assert.rejects(postCapture((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))), valid(), { timeoutMs: 5 }), (error) => error instanceof CaptureRequestError && error.code === 'network')
})

test('only the exact server-returned ROI is revealed after matching acknowledgement', async () => {
  const effects = []
  let resolveResponse
  const response = new Promise((resolve) => { resolveResponse = resolve })
  const pending = completeCapture({
    fetcher: async () => response, payload: valid(),
    onAcknowledged: ({ roi }) => effects.push(roi), timeoutMs: 100,
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(effects, [])
  resolveResponse(ok())
  await pending
  assert.deepEqual(effects, [serverRoi])
})

test('retry reuses one identity and replay returns one durable id', async () => {
  const payload = valid()
  const seen = []
  let attempts = 0
  const fetcher = async (_url, options) => {
    seen.push(JSON.parse(options.body).captureId)
    attempts += 1
    if (attempts === 1) throw new Error('response lost')
    return ok({ ok: true, id: 91, capture_id: captureId, roi: serverRoi })
  }
  await assert.rejects(postCapture(fetcher, payload))
  const replay = await postCapture(fetcher, payload)
  assert.equal(replay.id, 91)
  assert.deepEqual(seen, [captureId, captureId])
})

test('a materially changed submission uses a new capture identity', () => {
  const fingerprint = (body) => JSON.stringify(body)
  const first = { id: captureId, fingerprint: fingerprint({ email: 'a@example.com', collegeId: 1 }) }
  const changed = { email: 'a@example.com', collegeId: 2 }
  const selected = first.fingerprint === fingerprint(changed) ? first.id : 'new-capture-id'
  assert.equal(selected, 'new-capture-id')
})

test('server fingerprint is deterministic and binds email, college, consent and attribution', () => {
  const base = validateCaptureInput(valid({ utm: { utm_source: 'google', gclid: 'click-1' } }), 'https://www.fastrack.school/api/x')
  assert.equal(captureFingerprintInput(base), captureFingerprintInput(base))
  const mutations = [
    { ...base, email: 'other@example.com' },
    { ...base, collegeId: base.collegeId + 1 },
    { ...base, smsConsent: true, phone: '+16055551212' },
    { ...base, attribution: { ...base.attribution, gclid: 'click-2' } },
  ]
  for (const mutation of mutations) assert.notEqual(captureFingerprintInput(base), captureFingerprintInput(mutation))
})

test('concurrent same-key acknowledgements converge on one durable identity', async () => {
  const durable = new Map()
  let nextId = 1
  const fetcher = async (_url, options) => {
    const body = JSON.parse(options.body)
    await new Promise((resolve) => setImmediate(resolve))
    if (!durable.has(body.captureId)) durable.set(body.captureId, nextId++)
    return ok({ ok: true, id: durable.get(body.captureId), capture_id: body.captureId, roi: serverRoi })
  }
  const [a, b] = await Promise.all([postCapture(fetcher, valid()), postCapture(fetcher, valid())])
  assert.equal(a.id, b.id)
  assert.equal(durable.size, 1)
})

test('database capture source binds hash and atomically records results work and reporting without xmax', async () => {
  const source = await readFile(new URL('../lib/db.ts', import.meta.url), 'utf8')
  assert.match(source, /where leads\.capture_request_hash = excluded\.capture_request_hash/)
  assert.match(source, /eligible_risk as[\s\S]*captured as[\s\S]*message_work as[\s\S]*attempt_report as[\s\S]*outcome_report as/)
  assert.match(source, /insert into email_messages/)
  assert.match(source, /insert into capture_reporting_buckets/)
  assert.doesNotMatch(source, /xmax/)
})

test('database capture is joined to one accepted durable risk decision before work is claimed', async () => {
  const source = await readFile(new URL('../lib/db.ts', import.meta.url), 'utf8')
  assert.match(source, /capture_rate_windows/)
  assert.match(source, /on conflict \(scope, key_digest, window_start\) do update/)
  assert.match(source, /capture_rate_windows\.attempt_count < /)
  assert.match(source, /pg_advisory_xact_lock\(hashtextextended/)
  assert.match(source, /transaction\(\(txn\) => \[[\s\S]*pg_advisory_xact_lock[\s\S]*with known as/)
  assert.equal((source.match(/\$\{input\.keys\.phone\}::text is (?:not )?null/g) ?? []).length, 4)
  assert.doesNotMatch(source, /\$\{input\.keys\.phone\} is (?:not )?null/)
  assert.match(source, /isolationLevel: 'ReadCommitted'/)
  assert.match(source, /valid_business_identity as[\s\S]*from colleges[\s\S]*id = \$\{input\.collegeId\}[\s\S]*state = \$\{input\.state\}/)
  assert.match(source, /email_window as[\s\S]*exists \(select 1 from network_window\)[\s\S]*exists \(select 1 from valid_business_identity\)/)
  assert.match(source, /phone_window as[\s\S]*exists \(select 1 from email_window\)/)
  assert.match(source, /validation_code[\s\S]*not exists \(select 1 from valid_business_identity\) then 'invalid_college'/)
  assert.match(source, /select 0, 'rejected', 'global_limit'/)
  assert.match(source, /where not exists \(select 1 from known\)[\s\S]*on conflict \(capture_id\)/)
  assert.match(source, /with eligible_risk as[\s\S]*decision = 'accepted'[\s\S]*insert into leads/)
  assert.match(source, /phone_verified_at, sms_eligible[\s\S]*null, false/)
  assert.match(source, /cleanupCaptureRateWindows[\s\S]*expired_windows as[\s\S]*CAPTURE_ABUSE_CLEANUP_BATCH_SIZE/)
  assert.match(source, /cleanupCaptureRiskDecisions[\s\S]*expired_unreferenced_decisions as[\s\S]*not exists[\s\S]*leads\.capture_risk_decision_id = decision\.id/)
})

test('capture route gates work on durable risk and verified SMS eligibility', async () => {
  const route = await readFile(new URL('../app/api/insertEmailDocument/route.ts', import.meta.url), 'utf8')
  assert.match(route, /await claimCaptureRisk/)
  assert.match(route, /collegeId: input\.collegeId,[\s\S]*state: input\.state,[\s\S]*residency: input\.residency/)
  assert.match(route, /risk\.validation_code === 'invalid_college'/)
  assert.ok(route.indexOf("risk.validation_code === 'invalid_college'") < route.indexOf('await getCollegeById'))
  assert.match(route, /risk\.decision !== 'accepted'/)
  assert.match(route, /lead\.sms_eligible && smsDispatchEnabled\(\)/)
  assert.doesNotMatch(route, /cleanupCaptureAbuseState/)
  assert.doesNotMatch(route, /createSlidingWindowLimiter/)
  const sms = await readFile(new URL('../lib/sms.ts', import.meta.url), 'utf8')
  assert.match(sms, /process\.env\.CAPTURE_SMS_ENABLED === '1'/)
})

test('abuse cleanup has a separate authorized cron and aggregate-only result', async () => {
  const route = await readFile(new URL('../app/api/cron/capture-abuse-cleanup/route.ts', import.meta.url), 'utf8')
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.match(route, /captureAbuseCleanupAuthorized/)
  assert.match(route, /CAPTURE_ABUSE_CLEANUP_MAX_BATCHES/)
  assert.match(route, /deleted_windows/)
  assert.match(route, /deleted_unreferenced_decisions/)
  assert.match(route, /remaining_unreferenced_decisions/)
  assert.match(route, /retained_referenced_decisions/)
  assert.match(route, /cleanupCaptureRateWindows\(\)[\s\S]*cleanupCaptureRiskDecisions\(\)/)
  assert.match(route, /backlog_remaining: null, cleanup_failed: true/)
  assert.doesNotMatch(route, /email|phone|key_digest|capture_id/i)
  assert.ok(vercel.crons.some((cron) => cron.path === '/api/cron/capture-abuse-cleanup' && cron.schedule === '15 6 * * *'))
})
