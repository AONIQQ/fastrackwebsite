import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  ATTRIBUTION_TOKEN_TTL_SECONDS,
  checkoutAttributionOutcome,
  createCheckoutToken,
  createEngagementToken,
  messageStep,
  verifyCheckoutToken,
  verifyEngagementToken,
} from '../lib/attribution-tokens.mjs'
import { isCheckoutTokenShape } from '../lib/checkout-url.mjs'
import { destinationForUrl, messageTrackingLinks, resolvedDestination } from '../lib/tracking-links.mjs'

const secret = 'fixture-attribution-secret-32-bytes'
const trackingId = '8ec8c78c-1e21-4f63-89e2-20b2c3f19eb6'
const now = 1_800_000_000
const expiry = now + ATTRIBUTION_TOKEN_TTL_SECONDS
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('engagement tokens bind opaque message identity, bounded step, destination, and expiry', () => {
  const token = createEngagementToken({ trackingId, step: 'n2', destination: 'credit_map', expiresAt: expiry }, secret, now)
  assert.deepEqual(verifyEngagementToken(token, secret, now), {
    trackingId, step: 'n2', destination: 'credit_map', expiresAt: expiry,
  })
  assert.equal(verifyEngagementToken(token.replace('.n2.', '.n3.'), secret, now), null)
  assert.equal(verifyEngagementToken(token.replace('.credit_map.', '.checkout.'), secret, now), null)
  assert.equal(verifyEngagementToken(`${token.slice(0, -1)}A`, secret, now), null)
  assert.equal(verifyEngagementToken(token, secret, expiry + 1), null)
  assert.throws(() => createEngagementToken({ trackingId, step: 'n5', destination: 'home', expiresAt: expiry }, secret, now))
  assert.throws(() => createEngagementToken({ trackingId, step: 'n2', destination: 'external', expiresAt: expiry }, secret, now))
  assert.throws(() => createEngagementToken({
    trackingId, step: 'n2', destination: 'home', expiresAt: expiry + 1,
  }, secret, now))
})

test('checkout tokens are purpose-separated and reject forgery', () => {
  const checkout = createCheckoutToken({ trackingId, step: 'results', expiresAt: expiry }, secret, now)
  assert.equal(isCheckoutTokenShape(checkout), true)
  assert.deepEqual(verifyCheckoutToken(checkout, secret, now), { trackingId, step: 'results', expiresAt: expiry })
  assert.equal(verifyCheckoutToken(checkout.replace('.results.', '.n4.'), secret, now), null)
  const open = createEngagementToken({ trackingId, step: 'results', destination: 'open', expiresAt: expiry }, secret, now)
  assert.equal(verifyCheckoutToken(open, secret, now), null)
  assert.equal(verifyEngagementToken(checkout, secret, now), null)
})

test('logical-message step ownership is exact', () => {
  assert.equal(messageStep('results', null), 'results')
  for (let stage = 1; stage <= 4; stage += 1) assert.equal(messageStep('nurture', stage), `n${stage}`)
  assert.throws(() => messageStep('results', 1))
  assert.throws(() => messageStep('nurture', 5))
})

test('forwarded purchases are explicitly unattributed unless checkout email ownership matches', () => {
  assert.equal(checkoutAttributionOutcome({
    referencePresent: false, tokenValid: false, identityExists: false, emailMatches: false,
  }), 'unattributed')
  assert.equal(checkoutAttributionOutcome({
    referencePresent: true, tokenValid: false, identityExists: false, emailMatches: false,
  }), 'invalid_token')
  assert.equal(checkoutAttributionOutcome({
    referencePresent: true, tokenValid: true, identityExists: false, emailMatches: false,
  }), 'invalid_identity')
  assert.equal(checkoutAttributionOutcome({
    referencePresent: true, tokenValid: true, identityExists: true, emailMatches: false,
  }), 'forwarded_unattributed')
  assert.equal(checkoutAttributionOutcome({
    referencePresent: true, tokenValid: true, identityExists: true, emailMatches: true,
  }), 'attributed')
})

test('tracking URLs contain no recipient identity or nested destination URL', () => {
  const parent = 'parent@example.com'
  const links = messageTrackingLinks(trackingId, 'n3', Math.floor(Date.now() / 1000), {
    ATTRIBUTION_SIGNING_SECRET: secret,
  })
  for (const url of [links.pixel, links.click('home'), links.click('guide'), links.click('checkout'), links.click('credit_map')]) {
    assert.equal(url.includes(parent), false)
    assert.equal(url.includes(Buffer.from(parent).toString('base64url')), false)
    assert.equal(new URL(url).searchParams.has('e'), false)
    assert.equal(new URL(url).searchParams.has('u'), false)
    assert.deepEqual([...new URL(url).searchParams.keys()], ['t'])
  }
})

test('click destinations are allowlisted and checkout URLs never prefill recipient email', () => {
  assert.equal(destinationForUrl('https://www.fastrack.school/guide?utm_source=email'), 'guide')
  assert.equal(destinationForUrl('https://www.fastrack.school/credit-map?utm_source=email'), 'credit_map')
  assert.equal(destinationForUrl('https://buy.stripe.com/example?anything=1'), 'checkout')
  assert.equal(destinationForUrl('https://attacker.example/'), null)
  const checkout = new URL(resolvedDestination('checkout', 'n3', trackingId, Math.floor(Date.now() / 1000) + 600, secret))
  assert.equal(checkout.hostname, 'buy.stripe.com')
  assert.equal(checkout.searchParams.has('prefilled_email'), false)
  assert.equal(isCheckoutTokenShape(checkout.searchParams.get('client_reference_id')), true)
  const guide = new URL(resolvedDestination('guide', 'n2', trackingId, Math.floor(Date.now() / 1000) + 600, secret))
  assert.equal(guide.pathname, '/guide')
  assert.equal(guide.searchParams.get('utm_source'), 'email')
  assert.equal(guide.searchParams.get('utm_medium'), 'nurture')
  assert.equal(guide.searchParams.get('utm_campaign'), 'n2')
  assert.equal(isCheckoutTokenShape(guide.searchParams.get('checkout_ref')), true)
  assert.equal(new URL(resolvedDestination('guide', 'results', trackingId, Math.floor(Date.now() / 1000) + 600, secret)).searchParams.has('checkout_ref'), false)
  assert.equal(guide.searchParams.has('prefilled_email'), false)
})

test('migration and routes persist only verified logical-message engagement', async () => {
  const [migration, guideDestinationMigration, click, open, ledger, nurture, mail, stripe, creditMap, db] = await Promise.all([
    read('../db/migrations/0005_signed_attribution.sql'),
    read('../db/migrations/0020_guide_engagement_destination.sql'),
    read('../app/api/t/c/route.ts'),
    read('../app/api/t/o/route.ts'),
    read('../lib/message-ledger.ts'),
    read('../lib/nurture.ts'),
    read('../lib/mail.ts'),
    read('../app/api/webhooks/stripe/route.ts'),
    read('../app/credit-map/page.tsx'),
    read('../lib/db.ts'),
  ])
  assert.match(migration, /email_message_identities/)
  assert.match(migration, /tracking_id uuid not null unique/)
  assert.match(migration, /email_message_id bigint not null references email_messages\(id\)/)
  assert.doesNotMatch(migration.slice(migration.indexOf('create table if not exists email_engagement_events')), /\bemail\b|\burl\b/)
  assert.match(guideDestinationMigration, /destination_key in \('home', 'calculator', 'guide', 'credit_map', 'checkout'\)/)
  assert.match(ledger, /insert into email_message_identities \(email_message_id, tracking_id\)/)
  assert.match(click, /verifyEngagementToken[\s\S]*insert into email_engagement_events/)
  assert.match(open, /verifyEngagementToken[\s\S]*insert into email_engagement_events/)
  assert.match(click + open, /identity\.tracking_id = \$\{claims\.trackingId\}::uuid/)
  assert.doesNotMatch(click + open + nurture, /searchParams\.get\('e'\)|base64url'\)\.toString|prefilled_email/)
  assert.match(mail, /tracking\.click\('credit_map'\)/)
  assert.doesNotMatch(mail + nurture, /lead_ref=|lead-\$\{|prefilled_email/)
  assert.match(db, /from email_engagement_events/)
  assert.doesNotMatch(db, /count\(distinct email\)/)
  assert.match(creditMap, /return CHECKOUT_URL/)
  assert.doesNotMatch(creditMap, /utm_source.*client_reference_id|lead_ref/)
  assert.match(stripe, /verifyCheckoutToken\(rawReference, attributionSecret\(\)\)/)
  assert.match(stripe, /identity\.tracking_id = \$\{claims\?\.trackingId \?\? null\}::uuid/)
  assert.match(stripe, /join leads on leads\.id = candidate\.lead_id[\s\S]*lower\(trim\(leads\.email\)\) = \$\{checkoutEmail\}/)
  assert.match(stripe, /'forwarded_unattributed'/)
  assert.match(stripe, /email_message_id, lead_id, touch_ref, attribution_outcome/)
})
