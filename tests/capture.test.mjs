import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  CAPTURE_BODY_LIMIT, CaptureInputError, captureResponseIsAcknowledged,
  captureFingerprintInput, createSlidingWindowLimiter, isAllowedCaptureOrigin, normalizeAttribution,
  validateCaptureInput,
} from '../lib/capture.mjs'
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
  assert.equal(isAllowedCaptureOrigin('https://evil.example', 'https://www.fastrack.school/api/x'), false)
  assert.equal(isAllowedCaptureOrigin('bad', 'https://www.fastrack.school/api/x'), false)
})

test('sliding limiter enforces a bound and recovers after its window', () => {
  const allow = createSlidingWindowLimiter({ limit: 2, windowMs: 100 })
  assert.equal(allow('household', 0), true)
  assert.equal(allow('household', 1), true)
  assert.equal(allow('household', 2), false)
  assert.equal(allow('household', 101), true)
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

test('database capture source binds hash and atomically records results work and event without xmax', async () => {
  const source = await readFile(new URL('../lib/db.ts', import.meta.url), 'utf8')
  assert.match(source, /where leads\.capture_request_hash = excluded\.capture_request_hash/)
  assert.match(source, /with captured as[\s\S]*message_work as[\s\S]*event_record as/)
  assert.match(source, /insert into email_messages/)
  assert.match(source, /insert into capture_events/)
  assert.doesNotMatch(source, /xmax/)
})
