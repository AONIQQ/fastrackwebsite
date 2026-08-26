import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  assertCreditMapOwnerMessagePrivacy,
  creditMapOwnerMessage,
  runCreditMapOwnerAlerts,
} from '../lib/credit-map-owner-alerts.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

function fakeState() {
  const row = {
    status: 'pending', token: null, providerMessageId: null,
    idempotencyKey: '10000000-0000-4000-8000-000000000001', message: null,
  }
  return {
    row,
    claim: async (message) => {
      if (row.status === 'sent' || row.status === 'claimed') return null
      row.status = 'claimed'
      row.token = '20000000-0000-4000-8000-000000000002'
      row.message ??= structuredClone(message)
      return { token: row.token, idempotencyKey: row.idempotencyKey, message: structuredClone(row.message) }
    },
    complete: async (token, providerMessageId) => {
      assert.equal(token, row.token)
      row.status = 'sent'
      row.token = null
      row.providerMessageId = providerMessageId
    },
    release: async (token) => {
      assert.equal(token, row.token)
      row.status = 'pending'
      row.token = null
    },
  }
}

test('owner message contains only an action and the protected admin link', () => {
  const message = assertCreditMapOwnerMessagePrivacy(creditMapOwnerMessage())
  assert.equal(message.subject, 'Credit Map intake ready')
  assert.match(message.text, /https:\/\/www\.fastrack\.school\/admin\/leads/)
  assert.doesNotMatch(JSON.stringify(message), /@|student|checkout|session|payment_intent|sale_id|intake_id|token/i)
  assert.throws(() => assertCreditMapOwnerMessagePrivacy({ subject: 'Ready', text: 'person@example.com' }), /disallowed_detail/)
})

test('concurrent drains accept one provider message and replay becomes a no-op', async () => {
  const state = fakeState()
  const sent = []
  const dependencies = {
    claim: state.claim, complete: state.complete, release: state.release,
    send: async (message) => { sent.push(message); return { messageId: 'provider-message-1' } },
  }
  const results = await Promise.all([
    runCreditMapOwnerAlerts(dependencies, 1),
    runCreditMapOwnerAlerts(dependencies, 1),
  ])
  assert.equal(results.reduce((sum, result) => sum + result.sent, 0), 1)
  assert.equal(sent.length, 1)
  assert.deepEqual(await runCreditMapOwnerAlerts(dependencies, 1), { ok: true, sent: 0 })
})

test('provider failure releases the same durable message and idempotency key for retry', async () => {
  const state = fakeState()
  const attempts = []
  let first = true
  const dependencies = {
    claim: state.claim, complete: state.complete, release: state.release,
    send: async (message) => {
      attempts.push(structuredClone(message))
      if (first) { first = false; throw new Error('provider unavailable') }
      return { messageId: 'provider-message-1' }
    },
  }
  assert.deepEqual(await runCreditMapOwnerAlerts(dependencies, 1), { ok: false, sent: 0, failure: 'provider_or_completion_rejected' })
  assert.deepEqual(await runCreditMapOwnerAlerts(dependencies, 1), { ok: true, sent: 1 })
  assert.equal(attempts[0].idempotencyKey, attempts[1].idempotencyKey)
  assert.equal(attempts[0].subject, attempts[1].subject)
  assert.equal(attempts[0].text, attempts[1].text)
})

test('submitted intake creates one durable alert while webhook payment does not create a second alert', async () => {
  const [intake, webhook, route, state, migration] = await Promise.all([
    read('../app/api/credit-map/intake/route.ts'),
    read('../app/api/webhooks/stripe/route.ts'),
    read('../app/api/cron/funnel-health-alert/route.ts'),
    read('../lib/credit-map-owner-alert-state.ts'),
    read('../db/migrations/0025_credit_map_owner_notifications.sql'),
  ])
  assert.match(intake, /insert into credit_map_owner_notifications/)
  assert.match(intake, /on conflict \(intake_id\) do nothing/)
  assert.match(intake, /exists\(select 1 from saved\)/)
  assert.doesNotMatch(webhook, /credit_map_owner_notifications/)
  assert.match(route, /runCreditMapOwnerAlerts/)
  assert.match(route, /sendViaResend/)
  assert.match(route, /requireIdempotentProvider: true/)
  assert.match(state, /pg_advisory_xact_lock/)
  assert.match(state, /claim_expires_at/)
  assert.match(state, /provider_idempotency_key/)
  assert.match(state, /sale\.payment_state = 'paid'/)
  assert.match(state, /coalesce\(sale\.refunded_cents, 0\) = 0/)
  assert.match(state, /coalesce\(sale\.dispute_state, ''\) not in \('open', 'lost'\)/)
  assert.match(migration, /intake_id bigint primary key/)
  assert.doesNotMatch(migration, /\b(?:email|phone|student_grade|target_college|checkout_session_id|payment_intent|buyer_token)\b/i)
})
