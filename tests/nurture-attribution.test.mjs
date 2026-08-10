import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createUnsubscribeToken, unsubscribeHeaders, verifyUnsubscribeToken } from '../lib/unsubscribe.mjs'
import { claimable, logicalMessageKey, nextDueStage, providerIdempotencyKey, retryDelayMs } from '../lib/message-policy.mjs'
import { checkoutPaymentState, disputeState, parseLeadTouch } from '../lib/stripe-ledger.mjs'
import { aggregateCumulativeRefunds, latestDisputeState } from '../lib/stripe-ledger.mjs'
import { withCheckoutReference } from '../lib/checkout-url.mjs'

test('logical and provider identities are stable per lead and touch', () => {
  assert.equal(logicalMessageKey(42, 'results'), 'lead:42:results')
  assert.equal(logicalMessageKey(42, 'nurture', 3), 'lead:42:nurture:3')
  assert.equal(providerIdempotencyKey(42, 'results'), 'ft-lead-42-results')
  assert.equal(providerIdempotencyKey(42, 'nurture', 3), 'ft-lead-42-n3')
})

test('results acceptance gates the unchanged 2, 5, 8, and 12 day schedule', () => {
  for (const status of ['pending', 'claimed', 'retryable']) assert.equal(nextDueStage(0, 30, status), null)
  assert.equal(nextDueStage(0, 1.99, 'accepted'), null)
  assert.equal(nextDueStage(0, 2, 'accepted'), 1)
  assert.equal(nextDueStage(1, 5, 'accepted'), 2)
  assert.equal(nextDueStage(2, 8, 'accepted'), 3)
  assert.equal(nextDueStage(3, 12, 'accepted'), 4)
  assert.equal(nextDueStage(0, 12, 'terminal'), 1)
})

test('claims exclude overlap and permit stale lease recovery', () => {
  const now = 10_000
  assert.equal(claimable('pending', now, now, 0), true)
  assert.equal(claimable('retryable', now, now + 1, 0), false)
  assert.equal(claimable('claimed', now, now, now + 1), false)
  assert.equal(claimable('claimed', now, now, now), true)
  assert.equal(claimable('pending', now, now, 0, true), false)
  assert.equal(retryDelayMs(1), 600_000)
  assert.equal(retryDelayMs(99), 19_200_000)
})

test('unsubscribe tokens are signed and produce RFC one-click headers', () => {
  const token = createUnsubscribeToken('Parent@Example.com', 'fixture-secret')
  assert.equal(verifyUnsubscribeToken(token, 'fixture-secret'), 'parent@example.com')
  assert.equal(verifyUnsubscribeToken(`${token}x`, 'fixture-secret'), null)
  const headers = unsubscribeHeaders('https://www.fastrack.school', token)
  assert.match(headers['List-Unsubscribe'], /^<https:\/\/www\.fastrack\.school\/api\/u\?t=/)
  assert.equal(headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
})

test('every supported Credit Map touch resolves to a durable lead join', () => {
  for (const touch of ['results', 'n1', 'n2', 'n3', 'n4']) {
    assert.deepEqual(parseLeadTouch(`lead-73-${touch}`), { leadId: 73, touchRef: touch })
  }
  assert.deepEqual(parseLeadTouch('utm_source:email'), { leadId: null, touchRef: null })
})

test('checkout is revenue eligible only after paid confirmation', () => {
  assert.equal(checkoutPaymentState('checkout.session.completed', { payment_status: 'unpaid' }), 'pending')
  assert.equal(checkoutPaymentState('checkout.session.completed', { payment_status: 'paid' }), 'paid')
  assert.equal(checkoutPaymentState('checkout.session.async_payment_succeeded', {}), 'paid')
  assert.equal(checkoutPaymentState('checkout.session.async_payment_failed', {}), 'failed')
  assert.equal(disputeState('charge.dispute.created', {}), 'open')
  assert.equal(disputeState('charge.dispute.closed', { status: 'lost' }), 'lost')
})

test('dispute reconciliation follows provider creation time, not arrival order', () => {
  const created = { id: 'evt_created', objectId: 'dp_1', type: 'charge.dispute.created', providerCreated: 100, object: {} }
  const closed = { id: 'evt_closed', objectId: 'dp_1', type: 'charge.dispute.closed', providerCreated: 200, object: { status: 'won' } }
  assert.equal(latestDisputeState([closed, created]), 'won')
  assert.equal(latestDisputeState([created, closed, created]), 'won')
  assert.equal(latestDisputeState([closed, created, closed]), 'won')
  assert.equal(latestDisputeState([{ ...created, providerCreated: 200 }, closed]), 'won')
  assert.equal(latestDisputeState([closed, { ...created, providerCreated: 300 }]), 'won')
  assert.equal(latestDisputeState([closed, { ...created, id: 'evt_new', objectId: 'dp_2', providerCreated: 400 }]), 'open')
})

test('refund reconciliation sums the latest cumulative amount per charge', () => {
  const events = [
    { id: 'r2', objectId: 'ch_1', providerCreated: 200, amountCents: 4000 },
    { id: 'r1', objectId: 'ch_1', providerCreated: 100, amountCents: 1000 },
    { id: 'r3', objectId: 'ch_2', providerCreated: 150, amountCents: 2500 },
    { id: 'r2', objectId: 'ch_1', providerCreated: 200, amountCents: 4000 },
  ]
  assert.equal(aggregateCumulativeRefunds(events), 6500)
  assert.equal(aggregateCumulativeRefunds([...events].reverse()), 6500)
})

test('checkout references preserve provider query parameters', () => {
  const base = 'https://buy.stripe.com/example?prefilled_promo_code=SAVE&locale=en'
  const output = new URL(withCheckoutReference(base, 'lead-73-n2', { prefilled_email: 'parent@example.com' }))
  assert.equal(output.searchParams.get('prefilled_promo_code'), 'SAVE')
  assert.equal(output.searchParams.get('locale'), 'en')
  assert.equal(output.searchParams.get('client_reference_id'), 'lead-73-n2')
  assert.equal(output.searchParams.get('prefilled_email'), 'parent@example.com')
  assert.equal([...output.searchParams.keys()].length, 4)
})

test('integration source keeps atomic leases, result work, and lead projections', async () => {
  const [migration, db, ledger] = await Promise.all([
    readFile(new URL('../db/migrations/0003_nurture_conversion_ledger.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/db.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/message-ledger.ts', import.meta.url), 'utf8'),
  ])
  assert.match(migration, /logical_key text not null unique/)
  assert.match(migration, /provider_idempotency_key text not null unique/)
  assert.match(db, /insert into email_messages/)
  assert.match(ledger, /for update (?:of m )?skip locked/)
  assert.match(ledger, /claim_expires_at <= now\(\)/)
  assert.match(ledger, /and l\.unsubscribed_at is null[\s\S]*for update of m skip locked/)
  assert.match(ledger, /candidate as materialized[\s\S]+accepted as[\s\S]+projected as/)
})

test('all email Credit Map paths carry a durable touch reference', async () => {
  const [mail, nurture, creditMap] = await Promise.all([
    readFile(new URL('../lib/mail.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/nurture.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/credit-map/page.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(mail, /lead-\$\{r\.leadId\}-results/)
  assert.match(nurture, /leadRef = `lead-\$\{leadId\}-n\$\{step\.stage\}`/)
  assert.equal((nurture.match(/lead_ref=__LEAD_REF__/g) || []).length, 2)
  assert.match(creditMap, /\^lead-\\d\+-\(\?:results\|n\[1-4\]\)\$/)
})

test('dispatch and opt-out integration fail safe around duplicates and scanners', async () => {
  const [mail, unsubscribeRoute, stripeRoute] = await Promise.all([
    readFile(new URL('../lib/mail.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/u/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/webhooks/stripe/route.ts', import.meta.url), 'utf8'),
  ])
  assert.match(mail, /if \(args\.requireIdempotentProvider\)/)
  const getBody = unsubscribeRoute.slice(unsubscribeRoute.indexOf('export async function GET'))
  assert.doesNotMatch(getBody, /await unsubscribe\(/)
  assert.match(stripeRoute, /with refund_per_charge as/)
  assert.match(stripeRoute, /payment_intent, amount_cents, state, provider_created_at, outcome/)
  assert.match(stripeRoute, /when sales\.paid_at is not null then sales\.payment_state/)
  assert.match(stripeRoute, /distinct on \(object_id\)[\s\S]*charge\.dispute\.closed[\s\S]*provider_created_at desc/)
  assert.match(stripeRoute, /refund_per_charge[\s\S]*distinct on \(object_id\)[\s\S]*sum\(amount_cents\)/)
  assert.match(stripeRoute, /update stripe_events set outcome = 'applied', applied_at = coalesce\(applied_at, now\(\)\)/)
  assert.doesNotMatch(stripeRoute, /where payment_intent = \$\{object\.payment_intent \?\? null\}/)
})
