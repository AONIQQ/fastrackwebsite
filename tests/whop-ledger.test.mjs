import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { boundedMetadata, cents, disputeState, normalizeWhopEvent, sanitizeUtm, verifyWhopSignature, WHOP_WEBHOOK_EVENTS } from '../lib/whop-ledger.mjs'

const payment = { id: 'pay_fixture123', total: 47, currency: 'usd', checkout_configuration_id: 'ch_fixture123',
  product: { id: 'prod_fixture123' }, plan: { id: 'plan_fixture123' }, user: { email: ' Person@Example.com ' },
  metadata: { checkout_ref: 'v1.x.abc', utm_source: 'email', ignored: 'x', nested: { bad: true } },
  created_at: '2026-08-13T20:00:00.000Z' }

test('Whop normalizer retains only bounded ledger fields', () => {
  const event = normalizeWhopEvent({ id: 'msg_fixture123', api_version: 'v1', type: 'payment_succeeded',
    timestamp: '2026-08-13T20:00:01.000Z', company_id: 'biz_fixture123', data: payment })
  assert.deepEqual(event, { eventId: 'msg_fixture123', eventType: 'payment_succeeded', objectId: 'pay_fixture123', paymentId: 'pay_fixture123',
    companyId: 'biz_fixture123', checkoutId: 'ch_fixture123', productId: 'prod_fixture123', planId: 'plan_fixture123', amountCents: 4700,
    paymentAmountCents: 4700, currency: 'usd', email: 'person@example.com', metadata: { checkout_ref: 'v1.x.abc', utm_source: 'email' },
    state: 'paid', providerCreatedAt: '2026-08-13T20:00:00.000Z', paidAt: '2026-08-13T20:00:00.000Z', lifecycleAt: '2026-08-13T20:00:01.000Z' })
  assert.equal(cents(47.005), null); assert.equal(cents(-1), null); assert.equal(cents('47.00'), 4700)
  assert.deepEqual(boundedMetadata({ utm_source: 'reddit', bad: 'secret', utm_medium: 'bad value' }), { utm_source: 'reddit' })
})

test('Whop V1 contract is the exact six live underscore events', () => {
  assert.deepEqual(WHOP_WEBHOOK_EVENTS, [
    'payment_succeeded', 'payment_failed', 'refund_created', 'refund_updated', 'dispute_created', 'dispute_updated',
  ])
  assert.equal(normalizeWhopEvent({ id: 'msg_fixture123', api_version: 'v1', type: 'payment.succeeded',
    timestamp: '2026-08-13T20:00:01.000Z', company_id: 'biz_fixture123', data: payment }), null)
})

test('Whop refund and dispute events attach to their payment', () => {
  const refund = normalizeWhopEvent({ id: 'msg_refund123', api_version: 'v1', type: 'refund_updated',
    timestamp: '2026-08-13T20:00:02.000Z', company_id: 'biz_fixture123',
    data: { id: 'rf_fixture123', amount: 12.5, status: 'succeeded', updated_at: '2026-08-13T20:00:02.000Z',
      payment: { id: payment.id, total: payment.total, currency: payment.currency } } })
  assert.equal(refund.paymentId, payment.id); assert.equal(refund.amountCents, 1250); assert.equal(refund.state, 'succeeded')
  assert.equal(refund.productId, null); assert.equal(refund.lifecycleAt, '2026-08-13T20:00:02.000Z')
  assert.equal(disputeState('warning_needs_response'), 'open'); assert.equal(disputeState('resolved_won'), 'won'); assert.equal(disputeState('resolved_lost'), 'lost')
})

test('Standard Webhooks signature is raw-body and timestamp-bound', () => {
  const body = JSON.stringify({ ok: true }); const id = 'msg_fixture123'; const timestamp = '1786651200'
  const key = Buffer.alloc(32, 0x5a); const secret = `ws_${key.toString('hex')}`
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  const headers = new Headers({ 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` })
  assert.equal(verifyWhopSignature(body, headers, secret, Number(timestamp)), true)
  assert.equal(verifyWhopSignature(`${body} `, headers, secret, Number(timestamp)), false)
  assert.equal(verifyWhopSignature(body, headers, secret, Number(timestamp) + 301), false)
  const prefixed = `ws_${key.toString('hex')}`
  const prefixedSignature = signature
  assert.equal(verifyWhopSignature(body, new Headers({ 'webhook-id': id, 'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${prefixedSignature}` }), prefixed, Number(timestamp)), true)
  assert.equal(verifyWhopSignature(body, headers, 'unprefixed-secret', Number(timestamp)), false)
  assert.equal(verifyWhopSignature(body, headers, 'ws_%%%%', Number(timestamp)), false)
  assert.equal(verifyWhopSignature(body, headers, `ws_${Buffer.alloc(31).toString('hex')}`, Number(timestamp)), false)
  assert.equal(verifyWhopSignature(body, headers, `ws_${Buffer.alloc(33).toString('hex')}`, Number(timestamp)), false)
  assert.equal(verifyWhopSignature(body, headers, `whsec_${key.toString('base64')}`, Number(timestamp)), false)
})

test('webhook route and migration are fail-closed and provider-neutral', async () => {
  const [webhook, migration, guide] = await Promise.all([
    readFile(new URL('../app/api/webhooks/whop/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../db/migrations/0013_provider_neutral_payments.sql', import.meta.url), 'utf8'),
    readFile(new URL('../app/guide/page.tsx', import.meta.url), 'utf8')])
  assert.match(webhook, /createWhopPost/)
  assert.doesNotMatch(webhook, /JSON\.stringify\(parsed|raw:\s*raw/)
  assert.match(migration, /sales_provider_payment_unique/); assert.match(migration, /payment_provider_events/)
  assert.match(guide, /WHOP_CHECKOUT_URL/); assert.match(guide, /4DXyLzCDqEtib03t4d-fKRL-ukfw-a2np-khb2B9MVaq84/)
  assert.equal(sanitizeUtm('Agent-20260813'), 'agent-20260813'); assert.equal(sanitizeUtm('has space'), null)
})
