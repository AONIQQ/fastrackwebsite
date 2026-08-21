import assert from 'node:assert/strict'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { ATTRIBUTION_TOKEN_TTL_SECONDS, verifyEngagementToken } from '../lib/attribution-tokens.mjs'
import { messageTrackingLinks, resolvedDestination } from '../lib/tracking-links.mjs'

const secret = 'fixture-attribution-secret-32-bytes'
const issuedAt = 1_800_000_000
const trackingId = '8ec8c78c-1e21-4f63-89e2-20b2c3f19eb6'
const root = new URL('../lib/', import.meta.url)
const suffix = `${process.pid}-${Math.random().toString(16).slice(2)}`
const mailUrl = new URL(`.__t162-mail-${suffix}.mjs`, root)
const nurtureUrl = new URL(`.__t162-nurture-${suffix}.mjs`, root)

async function compile(sourceUrl, outputUrl, rewrite = (value) => value) {
  const source = await readFile(sourceUrl, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  await writeFile(outputUrl, rewrite(output), 'utf8')
}

await compile(new URL('../lib/mail.ts', import.meta.url), mailUrl)
await compile(new URL('../lib/nurture.ts', import.meta.url), nurtureUrl, (output) =>
  output.replace("from './mail'", `from './${mailUrl.pathname.split('/').pop()}'`),
)

const mail = await import(`${mailUrl.href}?v=${suffix}`)
const nurture = await import(`${nurtureUrl.href}?v=${suffix}`)

test.after(async () => {
  await Promise.all([unlink(mailUrl).catch(() => {}), unlink(nurtureUrl).catch(() => {})])
})

const withEnv = async (fn) => {
  const before = { ...process.env }
  process.env.ATTRIBUTION_SIGNING_SECRET = secret
  process.env.UNSUBSCRIBE_SECRET = secret
  process.env.EMAIL_FROM = 'info@example.invalid'
  process.env.RESEND_FROM = 'Fastrack <info@example.invalid>'
  process.env.BUSINESS_POSTAL_ADDRESS = '123 Example Street, Example City, DE 00000'
  try { return await fn() } finally {
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key]
    Object.assign(process.env, before)
  }
}

const intercept = async (args) => {
  const calls = []
  const client = { emails: { send: async (payload, options) => {
    calls.push({ payload, options })
    return { data: { id: 'provider-fixture-id' }, error: null }
  } } }
  await mail.sendViaResend(args, client)
  assert.equal(calls.length, 1)
  return calls[0]
}

const resultInput = {
  to: 'reserved@example.invalid', collegeName: 'Example College', residency: 'in-state',
  annualCost: 25_000, averageSalary: 60_000, costOfLiving: 40_000, discretionaryIncome: 20_000,
  standardTotal: 100_000, standardRecoup: '5 years', fastrackTotal: 50_000,
  fastrackRecoup: '2.5 years', savings: 50_000, earlyEarnings: 80_000,
  totalAdvantage: 130_000, yearsSaved: 2, trackingId, trackingIssuedAt: issuedAt,
  providerIdempotencyKey: 'stable-provider-key-results',
}

test('results and nurture Resend requests are byte-stable across retry clocks', async () => withEnv(async () => {
  const originalNow = Date.now
  try {
    Date.now = () => (issuedAt + 60) * 1000
    const resultFirst = await intercept(mail.buildResultsEmailArgs(resultInput))
    const nurtureFirst = await intercept(nurture.buildNurtureEmailArgs(
      resultInput.to, nurture.NURTURE_STEPS[2], trackingId, 'stable-provider-key-n3', issuedAt,
    ))
    Date.now = () => (issuedAt + 30 * 24 * 60 * 60) * 1000
    const resultRetry = await intercept(mail.buildResultsEmailArgs(resultInput))
    const nurtureRetry = await intercept(nurture.buildNurtureEmailArgs(
      resultInput.to, nurture.NURTURE_STEPS[2], trackingId, 'stable-provider-key-n3', issuedAt,
    ))
    assert.deepEqual(resultRetry, resultFirst)
    assert.deepEqual(nurtureRetry, nurtureFirst)
    assert.deepEqual(resultFirst.options, { idempotencyKey: 'stable-provider-key-results' })
    assert.deepEqual(nurtureFirst.options, { idempotencyKey: 'stable-provider-key-n3' })
    assert.equal(resultFirst.payload.to, resultInput.to)
    assert.equal(resultFirst.payload.subject, 'Example College: your modeled cost scenario')
    assert.equal(resultFirst.payload.replyTo, 'info@fastrack.school')
    assert.equal(resultFirst.payload.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
    assert.match(resultFirst.payload.headers['List-Unsubscribe'], /^<https:\/\/www\.fastrack\.school\/api\/u\?t=/)
  } finally { Date.now = originalNow }
}))

test('nurture uses the established public address by default and rejects an invalid commercial override', async () => withEnv(async () => {
  delete process.env.BUSINESS_POSTAL_ADDRESS
  const stageOne = nurture.buildNurtureEmailArgs(
    resultInput.to, nurture.NURTURE_STEPS[0], trackingId, 'stable-provider-key-n1', issuedAt,
  )
  assert.match(stageOne.html, /1007 N Orange St, Wilmington, Delaware<br>/)
  assert.doesNotMatch(stageOne.html, /__POSTAL_ADDRESS__|Advertisement from Fastrack EDU LLC/)
  assert.doesNotMatch(stageOne.text, /Advertisement from Fastrack EDU LLC/)

  const defaultCommercial = nurture.buildNurtureEmailArgs(
    resultInput.to, nurture.NURTURE_STEPS[1], trackingId, 'stable-provider-key-n2', issuedAt,
  )
  assert.match(defaultCommercial.html, /1007 N Orange St, Wilmington, Delaware<br>/)
  assert.match(defaultCommercial.text, /Advertisement from Fastrack EDU LLC\.\n1007 N Orange St, Wilmington, Delaware/)

  process.env.BUSINESS_POSTAL_ADDRESS = '<invalid>'
  assert.throws(() => nurture.buildNurtureEmailArgs(
    resultInput.to, nurture.NURTURE_STEPS[1], trackingId, 'stable-provider-key-n2', issuedAt,
  ), /business_postal_address_invalid/)

  process.env.BUSINESS_POSTAL_ADDRESS = '123 Example & Main, Example City, DE 00000'
  const commercial = nurture.buildNurtureEmailArgs(
    resultInput.to, nurture.NURTURE_STEPS[1], trackingId, 'stable-provider-key-n2', issuedAt,
  )
  assert.match(commercial.html, /123 Example &amp; Main, Example City, DE 00000<br>/)
  assert.match(commercial.html, /Advertisement from Fastrack EDU LLC\.<br>/)
  assert.match(commercial.text, /Advertisement from Fastrack EDU LLC\.\n123 Example & Main, Example City, DE 00000/)
  assert.doesNotMatch(commercial.html, /__POSTAL_ADDRESS__/)
}))

test('the diagnosed pre-fix clock shift changes every signed tracking field', async () => withEnv(async () => {
  const first = messageTrackingLinks(trackingId, 'results', issuedAt, process.env)
  const shifted = messageTrackingLinks(trackingId, 'results', issuedAt + 60, process.env)
  assert.notEqual(shifted.pixel, first.pixel)
  assert.notEqual(shifted.click('credit_map'), first.click('credit_map'))
  assert.throws(() => messageTrackingLinks(trackingId, 'results', undefined, process.env), /issuance time/)
}))

test('persisted issuance time gives engagement and checkout links one exact 90-day window', async () => withEnv(async () => {
  const args = mail.buildResultsEmailArgs(resultInput)
  const match = args.html.match(/https:\/\/www\.fastrack\.school\/api\/t\/c\?t=([^"&]+)/)
  assert.ok(match)
  const token = decodeURIComponent(match[1])
  const claims = verifyEngagementToken(token, secret, issuedAt)
  assert.equal(claims.trackingId, trackingId)
  assert.equal(claims.step, 'results')
  assert.equal(claims.expiresAt, issuedAt + ATTRIBUTION_TOKEN_TTL_SECONDS)
  assert.ok(verifyEngagementToken(token, secret, claims.expiresAt))
  assert.equal(verifyEngagementToken(token, secret, claims.expiresAt + 1), null)
  const originalNow = Date.now
  let checkout
  try {
    Date.now = () => issuedAt * 1000
    checkout = new URL(resolvedDestination('credit_map', claims.step, claims.trackingId, claims.expiresAt, secret))
  } finally { Date.now = originalNow }
  assert.equal(checkout.searchParams.get('utm_medium'), 'results')
  assert.ok(checkout.searchParams.get('checkout_ref'))
}))

test('distinct logical messages retain distinct provider requests', async () => withEnv(async () => {
  const first = await intercept(mail.buildResultsEmailArgs(resultInput))
  const second = await intercept(mail.buildResultsEmailArgs({
    ...resultInput,
    trackingId: '45c74862-5e98-4fb2-a559-c19ad4d2e9f0',
    trackingIssuedAt: issuedAt + 1,
    providerIdempotencyKey: 'stable-provider-key-results-2',
  }))
  assert.notDeepEqual(second, first)
  assert.notEqual(second.options.idempotencyKey, first.options.idempotencyKey)
  assert.equal(second.payload.to, first.payload.to)
  assert.equal(second.payload.subject, first.payload.subject)
  assert.equal(second.payload.headers['List-Unsubscribe'], first.payload.headers['List-Unsubscribe'])
}))

test('a retry after the intended window remains byte-stable but its original links are expired', async () => withEnv(async () => {
  const originalNow = Date.now
  try {
    Date.now = () => issuedAt * 1000
    const original = await intercept(mail.buildResultsEmailArgs(resultInput))
    Date.now = () => (issuedAt + ATTRIBUTION_TOKEN_TTL_SECONDS + 1) * 1000
    const lateRetry = await intercept(mail.buildResultsEmailArgs(resultInput))
    assert.deepEqual(lateRetry, original)
    const match = lateRetry.payload.html.match(/https:\/\/www\.fastrack\.school\/api\/t\/c\?t=([^"&]+)/)
    assert.ok(match)
    assert.equal(verifyEngagementToken(decodeURIComponent(match[1]), secret, issuedAt + ATTRIBUTION_TOKEN_TTL_SECONDS + 1), null)
  } finally { Date.now = originalNow }
}))
