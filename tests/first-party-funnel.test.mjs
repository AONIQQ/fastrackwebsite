import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  FIRST_PARTY_FUNNEL_EVENTS,
  firstPartyAttributionFromSearch,
  firstPartyRequestContextIsAllowed,
  normalizeFirstPartyAttribution,
  parseFirstPartyFunnelEventBody,
  parseFirstPartyFunnelSessionBody,
} from '../lib/first-party-funnel-contract.mjs'
import { firstPartyNetworkDigest, firstPartySessionDigest, issueFirstPartyFunnelToken, verifyFirstPartyFunnelToken } from '../lib/first-party-funnel-auth.mjs'
import { emitFirstPartyFunnelEvent } from '../lib/first-party-funnel-client.mjs'

const uuid = '123e4567-e89b-42d3-a456-426614174000'
const secret = 'a'.repeat(32)

function storage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

test('contract accepts only exact events, UUIDv4, and bounded approved attribution', () => {
  for (const event of FIRST_PARTY_FUNNEL_EVENTS) {
    const parsed = parseFirstPartyFunnelEventBody({ event, session: uuid, attribution: { source: 'reddit', medium: 'organic', campaign: 'agent-20260814', content: 'community-reply' } })
    assert.equal(parsed?.event, event)
    assert.equal(parsed?.trafficClass, 'business')
  }
  assert.equal(parseFirstPartyFunnelEventBody({ event: 'Other', session: uuid, attribution: {} }), null)
  assert.equal(parseFirstPartyFunnelEventBody({ event: 'Calculator Intent', session: uuid.replace('-4', '-1'), attribution: {} }), null)
  assert.equal(parseFirstPartyFunnelEventBody({ event: 'Calculator Intent', session: uuid, attribution: {}, arbitrary: 'no' }), null)
  assert.equal(normalizeFirstPartyAttribution({ source: 'reddit', medium: 'organic', campaign: 'anything' }), null)
  assert.equal(normalizeFirstPartyAttribution({ source: 'unknown', medium: 'organic', campaign: 'agent-20260814' }), null)
  assert.equal(normalizeFirstPartyAttribution({ source: 'reddit', medium: 'unknown', campaign: 'agent-20260814' }), null)
  assert.equal(normalizeFirstPartyAttribution({ source: 'reddit', medium: 'organic', campaign: 'agent-20260814', content: 'x'.repeat(49) }), null)
  assert.equal(normalizeFirstPartyAttribution({ source: 'direct', medium: 'organic', campaign: 'direct' }), null)
  assert.deepEqual(normalizeFirstPartyAttribution({}), { source: 'direct', medium: 'direct', campaign: 'direct', content: null })
  assert.equal(parseFirstPartyFunnelEventBody({ event: 'Calculator Intent', session: uuid, attribution: { source: 'reddit', medium: 'organic', campaign: 'qa-t230-live' } })?.trafficClass, 'qa')
})

test('session digest is deterministic, scoped, and never contains raw UUID', () => {
  const digest = firstPartySessionDigest(uuid, secret)
  assert.match(digest, /^[0-9a-f]{64}$/)
  assert.equal(digest, firstPartySessionDigest(uuid, secret))
  assert.notEqual(digest, firstPartySessionDigest('223e4567-e89b-42d3-a456-426614174000', secret))
  assert.equal(digest.includes(uuid), false)
  assert.throws(() => firstPartySessionDigest(uuid, 'short'))
})

test('search parser rejects unapproved attribution rather than storing it', () => {
  assert.deepEqual(firstPartyAttributionFromSearch('?utm_source=email&utm_medium=partner&utm_campaign=agent-20260814&utm_content=partner-form'), { source: 'email', medium: 'partner', campaign: 'agent-20260814', content: 'partner-form' })
  assert.equal(firstPartyAttributionFromSearch('?utm_source=attacker&utm_medium=organic&utm_campaign=agent-20260814'), null)
  assert.equal(firstPartyAttributionFromSearch('?utm_source=email&utm_medium=partner&utm_campaign=agent-20260814&utm_content=person-5551234567'), null)
})

test('server token binds session and QA mode with exact expiry and fetch metadata', () => {
  const now = 1_786_720_000_000
  const networkDigest = 'c'.repeat(64)
  const token = issueFirstPartyFunnelToken({ session: uuid, qa: true, networkDigest, secret, now })
  assert.equal(token.includes(uuid), false)
  assert.deepEqual(verifyFirstPartyFunnelToken({ token, session: uuid, networkDigest, secret, now }), { sessionDigest: firstPartySessionDigest(uuid, secret), networkDigest, qa: true })
  assert.equal(verifyFirstPartyFunnelToken({ token, session: '223e4567-e89b-42d3-a456-426614174000', networkDigest, secret, now }), null)
  assert.equal(verifyFirstPartyFunnelToken({ token, session: uuid, networkDigest: 'd'.repeat(64), secret, now }), null)
  assert.equal(verifyFirstPartyFunnelToken({ token: `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`, session: uuid, networkDigest, secret, now }), null)
  assert.equal(verifyFirstPartyFunnelToken({ token, session: uuid, networkDigest, secret, now: now + 2 * 60 * 60 * 1000 + 1000 }), null)
  assert.deepEqual(parseFirstPartyFunnelSessionBody({ session: uuid, qa: true }), { session: uuid, qa: true })
  assert.equal(parseFirstPartyFunnelSessionBody({ session: uuid, qa: false, extra: 1 }), null)
  const allowed = new Headers({ origin: 'https://www.fastrack.school', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' })
  assert.equal(firstPartyRequestContextIsAllowed(allowed), true)
  for (const [key, value] of [['origin', 'https://evil.example'], ['sec-fetch-site', 'cross-site'], ['sec-fetch-mode', 'no-cors'], ['sec-fetch-dest', 'document']]) {
    const hostile = new Headers(allowed)
    hostile.set(key, value)
    assert.equal(firstPartyRequestContextIsAllowed(hostile), false)
  }
  const edge = new Headers({ 'x-vercel-forwarded-for': '203.0.113.8' })
  assert.match(firstPartyNetworkDigest(edge, secret), /^[0-9a-f]{64}$/)
  assert.throws(() => firstPartyNetworkDigest(new Headers({ 'x-forwarded-for': '203.0.113.8' }), secret))
})

test('client sends same-origin fixed payload once after success and retries after failure', async () => {
  const store = storage()
  const calls = []
  const okFetch = async (...args) => { calls.push(args); return args[0].endsWith('funnel-session') ? { ok: true, json: async () => ({ token: 'signed-token' }) } : { ok: true } }
  const input = { hostname: 'www.fastrack.school', search: '?utm_source=reddit&utm_medium=organic&utm_campaign=agent-20260814', event: 'Calculator Intent', storage: store, fetcher: okFetch, browserCrypto: { randomUUID: () => uuid } }
  emitFirstPartyFunnelEvent(input)
  emitFirstPartyFunnelEvent(input)
  await new Promise((resolve) => setImmediate(resolve))
  emitFirstPartyFunnelEvent(input)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.length, 2)
  assert.equal(calls[0][0], '/api/analytics/funnel-session')
  assert.deepEqual(JSON.parse(calls[0][1].body), { session: uuid, qa: false })
  assert.equal(calls[1][0], '/api/analytics/funnel-event')
  assert.deepEqual(JSON.parse(calls[1][1].body), { event: 'Calculator Intent', session: uuid, attribution: { source: 'reddit', medium: 'organic', campaign: 'agent-20260814', content: null } })
  assert.equal(calls[1][1].headers['x-fastrack-funnel-token'], 'signed-token')

  const retryStore = storage()
  let attempts = 0
  const retry = { ...input, event: 'Capture Failed', storage: retryStore, fetcher: async (url) => url.endsWith('funnel-session') ? { ok: true, json: async () => ({ token: 'signed-token' }) } : ({ ok: ++attempts > 1 }) }
  emitFirstPartyFunnelEvent(retry)
  await new Promise((resolve) => setImmediate(resolve))
  emitFirstPartyFunnelEvent(retry)
  await new Promise((resolve) => setImmediate(resolve))
  emitFirstPartyFunnelEvent(retry)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(attempts, 2)
})

test('client is canonical-only and fail-open under storage, UUID, and network failures', async () => {
  let calls = 0
  const throwingStorage = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
  assert.doesNotThrow(() => emitFirstPartyFunnelEvent({ hostname: 'preview.vercel.app', search: '', event: 'Calculator Intent', storage: throwingStorage, fetcher: async () => { calls += 1 }, browserCrypto: { randomUUID: () => uuid } }))
  assert.doesNotThrow(() => emitFirstPartyFunnelEvent({ hostname: 'www.fastrack.school', search: '', event: 'Calculator Intent', storage: throwingStorage, fetcher: async () => { calls += 1; throw new Error('offline') }, browserCrypto: {} }))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 0)
})

test('unavailable sessionStorage uses one in-memory UUID across stages', async () => {
  let uuidCalls = 0
  const bodies = []
  const fetcher = async (url, init) => {
    bodies.push([url, JSON.parse(init.body)])
    return url.endsWith('funnel-session') ? { ok: true, json: async () => ({ token: 'memory-token' }) } : { ok: true }
  }
  for (const event of ['Calculator Intent', 'Calculator Modal Opened']) {
    emitFirstPartyFunnelEvent({ hostname: 'www.fastrack.school', search: '', event, storage: undefined, fetcher, browserCrypto: { randomUUID: () => { uuidCalls += 1; return uuid } } })
    await new Promise((resolve) => setImmediate(resolve))
  }
  assert.equal(uuidCalls, 1)
  assert.equal(new Set(bodies.map(([, body]) => body.session)).size, 1)
})

test('route, migration, report, and calculator preserve privacy and durable ACK boundary', async () => {
  const [route, sessionRoute, migration, server, client, page, adminRoute, panel] = await Promise.all([
    readFile(new URL('../app/api/analytics/funnel-event/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/analytics/funnel-session/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../db/migrations/0015_first_party_funnel_events.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/first-party-funnel.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/first-party-funnel-client.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../app/calculator/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/funnel-measurement/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/leads/FunnelMeasurementPanel.tsx', import.meta.url), 'utf8'),
  ])
  assert.match(route, /MAX_BODY_BYTES = 768/)
  assert.match(`${route}\n${sessionRoute}`, /firstPartyRequestContextIsAllowed/)
  assert.match(route, /CAPTURE_ABUSE_SECRET/)
  assert.doesNotMatch(`${migration}\n${server}`, /\b(phone|ip_address|user_agent|referrer|college|lead_id|capture_id|customer_id|raw_session|email_address)\b/i)
  assert.match(migration, /unique \(session_digest, event_name\)/)
  assert.match(migration, /session_count between 1 and 500/)
  assert.match(server, /session_count < 10/)
  assert.match(server, /pg_advisory_xact_lock/)
  assert.match(server, /database\.transaction\(\(txn\) => \[[\s\S]*fastrack:first-party-funnel-admission[\s\S]*with known_session[\s\S]*capacity_ok[\s\S]*isolationLevel: 'ReadCommitted'/)
  assert.doesNotMatch(`${panel}\n${adminRoute}`, /network_digest|key_digest|networkDigest/)
  assert.match(migration, /utm_content is null or utm_content in/)
  assert.match(migration, /traffic_class in \('business','qa'\)/)
  assert.match(server, /captured_per_intent/)
  assert.match(adminRoute, /isAdmin\(\)/)
  assert.match(adminRoute, /no-store/)
  assert.match(panel, /QA is labeled and excluded from business conclusions/)
  assert.match(client, /\/api\/analytics\/funnel-session/)
  assert.match(client, /\/api\/analytics\/funnel-event/)
  assert.match(page, /onAcknowledged:[\s\S]*trackCalculatorEvent\('Lead Captured'/)
  assert.doesNotMatch(page, /emitFirstPartyFunnelEvent\([\s\S]{0,100}(email|phone|college|captureId)/)
})
