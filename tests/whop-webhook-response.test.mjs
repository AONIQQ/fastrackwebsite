import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { createWhopPost } from '../lib/whop-webhook.mjs'

const key = Buffer.from('route-fixture-signing-key-32byte!')
const secret = `whsec_${key.toString('base64')}`
const now = 1_800_000_000
const scope = { companyId: 'biz_expected', productId: 'prod_expected', planId: 'plan_expected' }
const payment = (overrides = {}) => ({ id: 'pay_route123', total: 47, currency: 'usd',
  product: { id: scope.productId }, plan: { id: scope.planId }, created_at: '2027-01-15T08:00:00.000Z',
  paid_at: '2027-01-15T08:01:00.000Z', user: { email: 'route@example.test' }, ...overrides })
const event = (overrides = {}) => ({ id: 'msg_route123', api_version: 'v1', type: 'payment_succeeded',
  timestamp: '2027-01-15T08:00:00.000Z', company_id: scope.companyId, data: payment(), ...overrides })
const signed = (value, options = {}) => {
  const body = Buffer.isBuffer(value) ? value : typeof value === 'string' ? value : JSON.stringify(value)
  const id = options.id ?? (typeof value === 'object' ? value.id : 'msg_route123')
  const timestamp = String(options.timestamp ?? now)
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  return new Request('https://www.fastrack.school/api/webhooks/whop', {
    method: 'POST', body, headers: { 'content-type': 'application/json', 'webhook-id': id,
      'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}`, ...(options.headers || {}) },
  })
}
const config = (persist, overrides = {}) => ({ secret, ...scope, persist, nowSeconds: () => now, ...overrides })
const body = (response) => response.json()

test('actual Whop POST response rejects missing config, bad/expired signatures, malformed JSON, and oversized bodies without writes', async () => {
  let writes = 0
  const persist = async () => { writes += 1 }
  let response = await createWhopPost(config(persist, { secret: '' }))(signed(event()))
  assert.equal(response.status, 503)
  response = await createWhopPost(config(persist))(new Request('https://www.fastrack.school/api/webhooks/whop', { method: 'POST', body: '{}' }))
  assert.equal(response.status, 400)
  response = await createWhopPost(config(persist))(signed(event(), { timestamp: now - 301 }))
  assert.equal(response.status, 400)
  response = await createWhopPost(config(persist))(signed('{not-json'))
  assert.equal(response.status, 400)
  response = await createWhopPost(config(persist))(signed('x'.repeat(128 * 1024 + 1), { headers: { 'content-length': String(128 * 1024 + 1) } }))
  assert.equal(response.status, 413)
  const streamed = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(128 * 1024)); controller.enqueue(new Uint8Array([1])); controller.close() } })
  response = await createWhopPost(config(persist))(new Request('https://www.fastrack.school/api/webhooks/whop', {
    method: 'POST', body: streamed, duplex: 'half', headers: { 'webhook-id': 'msg_route123', 'webhook-timestamp': String(now), 'webhook-signature': 'v1,AAAA' },
  }))
  assert.equal(response.status, 413)
  response = await createWhopPost(config(persist))(signed(Buffer.from([0xc3, 0x28])))
  assert.equal(response.status, 400)
  assert.equal(writes, 0)
})

test('actual Whop POST response accepts exact $47 USD scope idempotently and preserves event ordering inputs', async () => {
  const writes = new Map()
  const persist = async (normalized, context) => {
    if (!writes.has(normalized.eventId)) writes.set(normalized.eventId, { normalized, context })
  }
  const post = createWhopPost(config(persist))
  const first = await post(signed(event()))
  const duplicate = await post(signed(event()))
  assert.equal(first.status, 200); assert.equal(duplicate.status, 200); assert.equal(writes.size, 1)
  assert.equal(writes.get('msg_route123').normalized.paymentAmountCents, 4700)
  assert.equal(writes.get('msg_route123').normalized.paidAt, '2027-01-15T08:01:00.000Z')

  const refundUpdated = event({ id: 'msg_refund_up', type: 'refund_updated', timestamp: '2027-01-15T08:03:00.000Z',
    data: { id: 'rf_route123', amount: 47, currency: 'usd', status: 'succeeded', created_at: '2027-01-15T08:00:00.000Z', payment: payment() } })
  const refundCreated = event({ id: 'msg_refund_cr', type: 'refund_created', timestamp: '2027-01-15T08:02:00.000Z',
    data: { id: 'rf_route123', amount: 47, currency: 'usd', status: 'pending', created_at: '2027-01-15T08:00:00.000Z', payment: payment() } })
  assert.equal((await post(signed(refundUpdated))).status, 200)
  assert.equal((await post(signed(refundCreated))).status, 200)
  assert.equal(writes.get('msg_refund_up').normalized.lifecycleAt, '2027-01-15T08:03:00.000Z')
  assert.equal(writes.get('msg_refund_cr').normalized.lifecycleAt, '2027-01-15T08:02:00.000Z')

  const productAbsent = event({ id: 'msg_dispute_no_product', type: 'dispute_created', timestamp: '2027-01-15T08:04:00.000Z',
    data: { id: 'dspt_route123', amount: 47, currency: 'usd', status: 'warning_needs_response', created_at: '2027-01-15T08:04:00.000Z',
      payment: { id: 'pay_route123', total: 47, currency: 'usd', created_at: '2027-01-15T08:00:00.000Z' } } })
  assert.equal((await post(signed(productAbsent))).status, 200)
  assert.equal(writes.has('msg_dispute_no_product'), true)

  const productMismatch = event({ id: 'msg_dispute_wrong_product', type: 'dispute_created', timestamp: '2027-01-15T08:05:00.000Z',
    data: { id: 'dspt_route999', amount: 47, currency: 'usd', status: 'warning_needs_response', product: { id: 'prod_other' },
      created_at: '2027-01-15T08:05:00.000Z', payment: { id: 'pay_route123', total: 47, currency: 'usd' } } })
  assert.deepEqual(await body(await post(signed(productMismatch))), { received: true, ignored: true })
  assert.equal(writes.has('msg_dispute_wrong_product'), false)
})

test('scope mismatches are ignored normally and only out-of-scope provider samples can be fixture proof', async () => {
  const persisted = []
  const wrong = event({ data: payment({ product: { id: 'prod_other' } }) })
  let response = await createWhopPost(config(async (...args) => persisted.push(args)))(signed(wrong))
  assert.equal(response.status, 200); assert.deepEqual(await body(response), { received: true, ignored: true }); assert.equal(persisted.length, 0)
  const wrongPlan = event({ data: payment({ plan: { id: 'plan_other' } }) })
  response = await createWhopPost(config(async (...args) => persisted.push(args)))(signed(wrongPlan))
  assert.deepEqual(await body(response), { received: true, ignored: true })
  const wrongAmount = event({ data: payment({ total: 46.99 }) })
  response = await createWhopPost(config(async (...args) => persisted.push(args)))(signed(wrongAmount))
  assert.deepEqual(await body(response), { received: true, ignored: true })
  const wrongCurrency = event({ data: payment({ currency: 'eur' }) })
  response = await createWhopPost(config(async (...args) => persisted.push(args)))(signed(wrongCurrency))
  assert.equal(response.status, 400)

  const proof = createWhopPost(config(async (...args) => persisted.push(args), { runtimeProof: true }))
  response = await proof(signed(event()))
  assert.equal(response.status, 503); assert.equal(persisted.length, 0)
  response = await proof(signed(wrong))
  assert.equal(response.status, 200); assert.equal(persisted.length, 1); assert.equal(persisted[0][1].runtimeProof, true)
})

test('persist failures return retryable 500 and body event ID must match signed header ID', async () => {
  const failing = createWhopPost(config(async () => { throw new Error('private database failure') }))
  const response = await failing(signed(event()))
  assert.equal(response.status, 500); assert.deepEqual(await body(response), { error: 'processing_failed' })
  const mismatch = await createWhopPost(config(async () => {}))(signed(event(), { id: 'msg_different' }))
  assert.equal(mismatch.status, 400)
})
