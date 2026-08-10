import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { Webhook } from 'standardwebhooks'
import { Resend } from 'resend'
import {
  assertAggregateReport,
  ingestResendWebhook,
  normalizeResendEvent,
  shouldAdvanceProviderState,
  validateSignedHeaders,
} from '../lib/resend-events.mjs'

const secret = `whsec_${Buffer.from('fixture signing key fixture signing').toString('base64')}`
const now = 1_800_000_000
const providerEventId = 'evt_fixture_1'

function payload(type = 'email.delivered', createdAt = '2027-01-15T08:00:00.000Z') {
  return JSON.stringify({
    type,
    created_at: createdAt,
    data: {
      email_id: 'provider_message_fixture_1',
      from: 'private@example.test',
      to: ['recipient@example.test'],
      subject: 'must never be persisted',
      created_at: createdAt,
    },
  })
}

function signedRequest(body, timestamp = now) {
  const timestampDate = new Date(timestamp * 1000)
  return {
    id: providerEventId,
    timestamp: String(timestamp),
    signature: new Webhook(secret).sign(providerEventId, timestampDate, body),
  }
}

const sdk = new Resend('re_webhook_verification_fixture')
const sdkVerify = (options) => {
  const originalNow = Date.now
  Date.now = () => now * 1000
  try { return sdk.webhooks.verify(options) } finally { Date.now = originalNow }
}

test('valid raw-body signature verifies before a normalized event is persisted', async () => {
  const body = payload()
  let persisted
  const response = await ingestResendWebhook({
    rawBody: body,
    headers: signedRequest(body),
    secret,
    nowSeconds: now,
    verify: sdkVerify,
    persist: async (event) => { persisted = event; return { duplicate: false, outcome: 'matched' } },
  })
  assert.equal(response.status, 200)
  assert.equal(persisted.eventType, 'delivered')
  assert.equal(persisted.providerEventId, providerEventId)
  assert.deepEqual(Object.keys(persisted).sort(), [
    'eventType', 'failureCategory', 'providerCreatedAt', 'providerEventId', 'providerMessageId',
  ])
})

test('missing, invalid, mutated-body, stale, and future signatures fail before persistence', async () => {
  const body = payload()
  const cases = [
    {},
    { ...signedRequest(body), signature: 'v1,invalid' },
    signedRequest(body.replace('delivered', 'bounced')),
    signedRequest(body, now - 301),
    signedRequest(body, now + 301),
  ]
  for (const headers of cases) {
    let writes = 0
    const response = await ingestResendWebhook({
      rawBody: body,
      headers,
      secret,
      nowSeconds: now,
      verify: sdkVerify,
      persist: async () => { writes += 1; return { duplicate: false, outcome: 'matched' } },
    })
    assert.equal(response.status, 400)
    assert.equal(writes, 0)
  }
})

test('duplicate provider event IDs are rejected and do not project twice', async () => {
  const body = payload()
  const seen = new Set()
  let projections = 0
  const persist = async (event) => {
    if (seen.has(event.providerEventId)) return { duplicate: true }
    seen.add(event.providerEventId)
    projections += 1
    return { duplicate: false, outcome: 'matched' }
  }
  const request = { rawBody: body, headers: signedRequest(body), secret, nowSeconds: now, verify: sdkVerify, persist }
  assert.deepEqual(await ingestResendWebhook(request), { status: 200, body: { ok: true, outcome: 'matched' } })
  assert.deepEqual(await ingestResendWebhook(request), { status: 200, body: { ok: true, duplicate: true } })
  assert.equal(projections, 1)
})

test('provider state is monotonic across reverse delivery and same-rank events', () => {
  assert.equal(shouldAdvanceProviderState(
    { state: 'delivered', at: '2027-01-15T08:02:00Z' },
    { state: 'delivery_delayed', at: '2027-01-15T08:03:00Z' },
  ), false)
  assert.equal(shouldAdvanceProviderState(
    { state: 'delivered', at: '2027-01-15T08:02:00Z' },
    { state: 'bounced', at: '2027-01-15T08:01:00Z' },
  ), true)
  assert.equal(shouldAdvanceProviderState(
    { state: 'bounced', at: '2027-01-15T08:02:00Z' },
    { state: 'failed', at: '2027-01-15T08:01:00Z' },
  ), false)
  assert.equal(shouldAdvanceProviderState(
    { state: 'delivered', at: '2027-01-15T08:02:00Z' },
    { state: 'complained', at: '2027-01-15T08:03:00Z' },
  ), true)
})

test('signed unknown-message events remain aggregate unmatched evidence', async () => {
  const body = payload('email.failed')
  const response = await ingestResendWebhook({
    rawBody: body,
    headers: signedRequest(body),
    secret,
    nowSeconds: now,
    verify: sdkVerify,
    persist: async () => ({ duplicate: false, outcome: 'unmatched' }),
  })
  assert.deepEqual(response, { status: 200, body: { ok: true, outcome: 'unmatched' } })
})

test('normalization stores bounded categories, never provider PII detail', () => {
  const event = normalizeResendEvent(JSON.parse(payload('email.bounced')), providerEventId)
  assert.equal(event.failureCategory, 'permanent_bounce')
  assert.equal(JSON.stringify(event).includes('recipient@example.test'), false)
  assert.equal(JSON.stringify(event).includes('must never be persisted'), false)
})

test('operations reporting rejects accidental identifiers or recipient detail', () => {
  assert.deepEqual(assertAggregateReport({ window_days: 30, events: [{ event_type: 'delivered', count: 3 }] }), {
    window_days: 30,
    events: [{ event_type: 'delivered', count: 3 }],
  })
  assert.throws(() => assertAggregateReport({ recipient: 'private@example.test' }), /disallowed/)
  assert.throws(() => assertAggregateReport({ provider_message_id: 'secret-ish-id' }), /disallowed/)
})

test('header timestamp boundary is exactly five minutes', () => {
  assert.doesNotThrow(() => validateSignedHeaders(signedRequest(payload(), now - 300), now))
  assert.throws(() => validateSignedHeaders(signedRequest(payload(), now - 301), now), /stale/)
})

test('database source is atomic, idempotent, linked, monotonic, and fixture-safe', async () => {
  const [ledger, messageLedger, migration, route] = await Promise.all([
    readFile(new URL('../lib/resend-event-ledger.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/message-ledger.ts', import.meta.url), 'utf8'),
    readFile(new URL('../db/migrations/0004_resend_delivery_events.sql', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/webhooks/resend/route.ts', import.meta.url), 'utf8'),
  ])
  assert.match(ledger, /with matched_message as[\s\S]*inserted as[\s\S]*projected as/)
  assert.match(ledger, /on conflict \(provider_event_id\) do nothing/)
  assert.match(ledger, /provider = 'resend' and provider_message_id/)
  assert.match(ledger, /provider_created_at/)
  assert.match(ledger, /is_fixture = false/)
  assert.doesNotMatch(ledger, /\b(?:subject|recipient|body|payload|from_address|to_address)\b/i)
  assert.match(migration, /provider_event_id text primary key/)
  assert.match(migration, /email_message_id bigint references email_messages\(id\)/)
  assert.doesNotMatch(migration, /\b(?:recipient|subject|body|payload)\b/i)
  assert.ok(route.indexOf('const rawBody = await request.text()') < route.indexOf('const response = await ingestResendWebhook'))
  assert.match(messageLedger, /candidate as materialized[\s\S]*linked_events as[\s\S]*best_event as[\s\S]*accepted as[\s\S]*projected as/)
  assert.match(messageLedger, /event\.email_message_id is null/)
  assert.match(messageLedger, /event\.provider_message_id = \$\{receipt\.messageId\}/)
  assert.match(messageLedger, /order by case event\.event_type[\s\S]*desc,[\s\S]*event\.provider_created_at desc/)
})
