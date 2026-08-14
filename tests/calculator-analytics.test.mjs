import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  CALCULATOR_ANALYTICS_EVENTS,
  CANONICAL_PRODUCTION_HOSTS,
  emitCalculatorAnalyticsEvent,
  getAnalyticsSessionStorage,
  getClarityEventEmitter,
  getSessionStorageValue,
  isCanonicalProductionHost,
  removeSessionStorageValue,
  setSessionStorageValue,
} from '../lib/calculator-analytics.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('analytics allowlist accepts only the two exact canonical production hosts', () => {
  assert.deepEqual(CANONICAL_PRODUCTION_HOSTS, ['fastrack.school', 'www.fastrack.school'])
  assert.equal(isCanonicalProductionHost('fastrack.school'), true)
  assert.equal(isCanonicalProductionHost('www.fastrack.school'), true)

  for (const hostname of [
    'localhost',
    '127.0.0.1',
    'fastrackwebsite.vercel.app',
    'preview.fastrack.school',
    'www.fastrack.school.evil.example',
    'Fastrack.school',
    '',
  ]) assert.equal(isCanonicalProductionHost(hostname), false, hostname)
})

test('calculator events have a fixed privacy-safe vocabulary and no properties', () => {
  assert.deepEqual(CALCULATOR_ANALYTICS_EVENTS, [
    'Calculator Intent',
    'Calculator Modal Opened',
    'Capture Submission Attempted',
    'Lead Captured',
    'Capture Failed',
  ])

  const calls = []
  assert.equal(emitCalculatorAnalyticsEvent({
    hostname: 'fastrack.school',
    event: 'Calculator Intent',
    emitters: [{ key: 'vercel', emit: (...args) => calls.push(args) }],
  }), true)
  assert.deepEqual(calls, [['Calculator Intent']])
  assert.equal(emitCalculatorAnalyticsEvent({
    hostname: 'fastrack.school',
    event: 'Not Allowed',
    emitters: [{ key: 'vercel', emit: (...args) => calls.push(args) }],
  }), false)
  assert.deepEqual(calls, [['Calculator Intent']])
})

test('one canonical event is sent name-only to Vercel and the documented Clarity event API', () => {
  const vercelCalls = []
  const clarityCalls = []
  const clarityWindow = {
    clarity: (...args) => clarityCalls.push(args),
  }

  assert.equal(emitCalculatorAnalyticsEvent({
    hostname: 'www.fastrack.school',
    event: 'Capture Submission Attempted',
    emitters: [
      { key: 'vercel', emit: (...args) => vercelCalls.push(args) },
      { key: 'clarity', emit: getClarityEventEmitter(clarityWindow) },
    ],
  }), true)
  assert.deepEqual(vercelCalls, [['Capture Submission Attempted']])
  assert.deepEqual(clarityCalls, [['event', 'Capture Submission Attempted']])
})

test('each analytics surface is isolated when the other throws or is unavailable', () => {
  const vercelCalls = []
  const clarityCalls = []

  assert.equal(emitCalculatorAnalyticsEvent({
    hostname: 'fastrack.school',
    event: 'Capture Failed',
    emitters: [
      { key: 'vercel', emit: () => { throw new Error('Vercel unavailable') } },
      { key: 'clarity', emit: getClarityEventEmitter({ clarity: (...args) => clarityCalls.push(args) }) },
    ],
  }), true)
  assert.deepEqual(clarityCalls, [['event', 'Capture Failed']])

  assert.equal(emitCalculatorAnalyticsEvent({
    hostname: 'fastrack.school',
    event: 'Calculator Intent',
    emitters: [
      { key: 'vercel', emit: (...args) => vercelCalls.push(args) },
      { key: 'clarity', emit: getClarityEventEmitter(Object.create(null, {
        clarity: { get: () => { throw new Error('Clarity unavailable') } },
      })) },
    ],
  }), true)
  assert.deepEqual(vercelCalls, [['Calculator Intent']])
})

test('dedupe is independent per surface so a transient failure retries only that surface', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  const vercelCalls = []
  const clarityCalls = []
  let vercelAvailable = false
  const input = {
    hostname: 'fastrack.school',
    event: 'Calculator Intent',
    onceKey: 'intent',
    storage,
    emitters: [
      { key: 'vercel', emit: (...args) => {
        if (!vercelAvailable) throw new Error('Vercel unavailable')
        vercelCalls.push(args)
      } },
      { key: 'clarity', emit: getClarityEventEmitter({ clarity: (...args) => clarityCalls.push(args) }) },
    ],
  }

  assert.equal(emitCalculatorAnalyticsEvent(input), true)
  assert.equal(values.get('intent'), undefined)
  assert.equal(values.get('intent:clarity'), '1')
  assert.deepEqual(clarityCalls, [['event', 'Calculator Intent']])

  vercelAvailable = true
  assert.equal(emitCalculatorAnalyticsEvent(input), true)
  assert.deepEqual(vercelCalls, [['Calculator Intent']])
  assert.deepEqual(clarityCalls, [['event', 'Calculator Intent']])
  assert.equal(values.get('intent'), '1')
  assert.equal(emitCalculatorAnalyticsEvent(input), false)
})

test('nonproduction emits nothing and session events are deduplicated', () => {
  const calls = []
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  const input = {
    event: 'Calculator Modal Opened',
    emitters: [{ key: 'vercel', emit: (...args) => calls.push(args) }],
    onceKey: 'modal',
    storage,
  }

  assert.equal(emitCalculatorAnalyticsEvent({ ...input, hostname: 'project-git-branch.vercel.app' }), false)
  assert.equal(emitCalculatorAnalyticsEvent({ ...input, hostname: 'localhost' }), false)
  assert.equal(emitCalculatorAnalyticsEvent({ ...input, hostname: 'www.fastrack.school' }), true)
  assert.equal(emitCalculatorAnalyticsEvent({ ...input, hostname: 'www.fastrack.school' }), false)
  assert.deepEqual(calls, [['Calculator Modal Opened']])
})

test('storage-restricted browsers fail open before any calculator action', () => {
  const restrictedWindow = Object.create(null, {
    sessionStorage: { get: () => { throw new DOMException('blocked', 'SecurityError') } },
  })
  assert.equal(getAnalyticsSessionStorage(restrictedWindow), undefined)

  const calls = []
  assert.equal(emitCalculatorAnalyticsEvent({
    hostname: 'fastrack.school',
    event: 'Calculator Intent',
    emitters: [{ key: 'vercel', emit: (...args) => calls.push(args) }],
    onceKey: 'intent',
    storage: getAnalyticsSessionStorage(restrictedWindow),
  }), true)
  assert.deepEqual(calls, [['Calculator Intent']])

  const storage = {
    getItem: () => { throw new DOMException('blocked', 'SecurityError') },
    setItem: () => { throw new DOMException('blocked', 'SecurityError') },
  }
  assert.equal(emitCalculatorAnalyticsEvent({
    hostname: 'fastrack.school',
    event: 'Calculator Modal Opened',
    emitters: [{ key: 'vercel', emit: (...args) => calls.push(args) }],
    onceKey: 'modal',
    storage,
  }), true)
  assert.deepEqual(calls, [['Calculator Intent'], ['Calculator Modal Opened']])
  assert.equal(getSessionStorageValue(storage, 'session-capture-ack'), null)
  assert.doesNotThrow(() => setSessionStorageValue(storage, 'session-capture-ack', '1'))
  assert.doesNotThrow(() => removeSessionStorageValue(storage, 'session-email'))
})

test('calculator gates Clarity, Google scripts, and every custom event on exact host', async () => {
  const page = await read('../app/calculator/page.tsx')
  assert.match(page, /setIsProductionAnalyticsHost\(isCanonicalProductionHost\(window\.location\.hostname\)\)/)
  assert.match(page, /\{isProductionAnalyticsHost && \(\s*<>[\s\S]*id="microsoft-clarity"[\s\S]*googletagmanager\.com[\s\S]*id="google-analytics"/)
  assert.match(page, /emitters: \[\s*\{ key: 'vercel', emit: track \},\s*\{ key: 'clarity', emit: getClarityEventEmitter\(window\) \},/)
  const analyticsHelper = await read('../lib/calculator-analytics.mjs')
  assert.doesNotMatch(analyticsHelper, /email|phone|college|state|referrer|url|query|captureId|rawError|identity/i)
  assert.match(analyticsHelper, /emit\(event\)/)
  assert.match(analyticsHelper, /clarity\.call\(browserWindow, 'event', event\)/)
  assert.doesNotMatch(analyticsHelper, /clarity\.call\(browserWindow, 'event', event\s*,/)
})

test('capture payload, attribution, and acknowledgement semantics remain intact', async () => {
  const page = await read('../app/calculator/page.tsx')
  const handler = page.slice(page.indexOf('const handleEmailSubmit'), page.indexOf('\n  const navLinks'))

  assert.match(handler, /e\.preventDefault\(\)\s*if \(!college \|\| !residency\) return/)
  assert.match(handler, /payload: \{\s*captureId, email, phone: phoneNumber, smsConsent, state, residency,\s*collegeId: college\.id, referrer: attributionRef\.current\.referrer,\s*utm: attributionRef\.current\.utm, website,\s*\}/)
  assert.match(handler, /onAcknowledged:[\s\S]*setSessionStorageValue\(storage, 'session-capture-ack', '1'\)[\s\S]*trackCalculatorEvent\('Lead Captured'/)
  assert.match(handler, /setDisplayAcknowledgement\(captureId\)/)
  assert.match(handler, /trackCalculatorEvent\('Capture Failed'\)[\s\S]*setCaptureError\('We could not save your request\./)
  assert.doesNotMatch(handler, /trackCalculatorEvent\([^\n]+,\s*\{/) // no analytics properties
})
