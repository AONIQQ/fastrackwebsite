import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  findOrCreateWhopGuideCheckout,
  whopCheckoutConfiguration,
  whopCheckoutListMatch,
} from '../lib/guide-checkout.mjs'

const plan = 'plan_exact'
const reference = 'v1.x.123e4567-e89b-42d3-a456-426614174000.n2.1999999999.signature'
const configuration = {
  id: 'ch_exact123', purchase_url: 'https://whop.com/checkout/ch_exact123/',
  plan: { id: plan }, metadata: { checkout_ref: reference },
}

test('guide checkout accepts only exact Whop host, plan, and signed reference metadata', () => {
  assert.deepEqual(whopCheckoutConfiguration(configuration, plan, reference), {
    id: 'ch_exact123', purchaseUrl: 'https://whop.com/checkout/ch_exact123/',
  })
  assert.equal(whopCheckoutConfiguration({ ...configuration, purchase_url: 'https://evil.example/checkout/ch_exact123/' }, plan, reference), null)
  assert.equal(whopCheckoutConfiguration({ ...configuration, plan: { id: 'plan_other' } }, plan, reference), null)
  assert.equal(whopCheckoutConfiguration({ ...configuration, metadata: { checkout_ref: 'other' } }, plan, reference), null)
  assert.equal(whopCheckoutListMatch({ data: [{ bad: true }, configuration] }, plan, reference)?.id, 'ch_exact123')
})

test('guide checkout recovers an existing configuration before creating a provider object', async () => {
  const calls = []
  const result = await findOrCreateWhopGuideCheckout({
    apiKey: 'key', companyId: 'biz_exact', planId: plan, reference,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET' })
      return new Response(JSON.stringify({ data: [configuration] }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  assert.equal(result.id, 'ch_exact123')
  assert.equal(calls.length, 1)
  const list = new URL(calls[0].url)
  assert.equal(list.searchParams.get('company_id'), 'biz_exact')
  assert.equal(list.searchParams.get('plan_id'), plan)
})

test('guide checkout creates exact bounded metadata only after no recovery match', async () => {
  const calls = []
  const result = await findOrCreateWhopGuideCheckout({
    apiKey: 'key', companyId: 'biz_exact', planId: plan, reference,
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), ...init })
      return calls.length === 1
        ? new Response(JSON.stringify({ data: [] }), { status: 200 })
        : new Response(JSON.stringify(configuration), { status: 200 })
    },
  })
  assert.equal(result.id, 'ch_exact123')
  assert.equal(calls.length, 2)
  assert.equal(calls[1].method, 'POST')
  assert.deepEqual(JSON.parse(calls[1].body), {
    plan_id: plan,
    metadata: { checkout_ref: reference, utm_source: 'email', utm_medium: 'nurture', utm_campaign: 'n2' },
    redirect_url: 'https://www.fastrack.school/guide?checkout=complete',
  })
})

test('guide route is same-origin, token-bound, no-store, idempotent, and aggregate-logged', async () => {
  const [route, page, button, tracking, migration] = await Promise.all([
    readFile(new URL('../app/api/checkout/guide/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/guide/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/guide/GuideCheckoutButton.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/tracking-links.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../db/migrations/0022_guide_checkout_sessions.sql', import.meta.url), 'utf8'),
  ])
  assert.match(route, /firstPartyRequestContextIsAllowed/)
  assert.match(route, /MAX_BODY_BYTES = 512/)
  assert.match(route, /claims\.step !== 'n2'/)
  assert.match(route, /pg_advisory_xact_lock/)
  assert.doesNotMatch(route, /console\.(?:log|error)[^\n]*(?:checkout_ref|trackingId|email|lead_id)/)
  assert.match(page, /GuideCheckoutButton/)
  assert.match(button, /credentials: 'same-origin'/)
  assert.match(tracking, /checkout_ref.*createCheckoutToken/s)
  assert.match(migration, /references email_message_identities\(tracking_id\)/)
  assert.doesNotMatch(migration, /\bemail\s+text|\blead_id\b|viewer|request_body|payload/i)
})
