import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  CALCULATOR_ANALYTICS_EVENTS,
  CANONICAL_PRODUCTION_HOSTS,
  emitCalculatorAnalyticsEvent,
  getAnalyticsSessionStorage,
  isCanonicalProductionHost,
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
    emit: (...args) => calls.push(args),
  }), true)
  assert.deepEqual(calls, [['Calculator Intent']])
  assert.equal(emitCalculatorAnalyticsEvent({
    hostname: 'fastrack.school',
    event: 'Not Allowed',
    emit: (...args) => calls.push(args),
  }), false)
  assert.deepEqual(calls, [['Calculator Intent']])
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
    emit: (...args) => calls.push(args),
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
    emit: (...args) => calls.push(args),
    onceKey: 'intent',
    storage: getAnalyticsSessionStorage(restrictedWindow),
  }), true)
  assert.deepEqual(calls, [['Calculator Intent']])
})

test('calculator gates Clarity, Google scripts, and every custom event on exact host', async () => {
  const page = await read('../app/calculator/page.tsx')
  assert.match(page, /setIsProductionAnalyticsHost\(isCanonicalProductionHost\(window\.location\.hostname\)\)/)
  assert.match(page, /\{isProductionAnalyticsHost && \(\s*<>[\s\S]*id="microsoft-clarity"[\s\S]*googletagmanager\.com[\s\S]*id="google-analytics"/)
  assert.match(page, /emitCalculatorAnalyticsEvent\(\{\s*hostname: window\.location\.hostname,\s*event,\s*emit: track,/)
  const analyticsHelper = await read('../lib/calculator-analytics.mjs')
  assert.doesNotMatch(analyticsHelper, /email|phone|college|state|referrer|url|query|captureId|rawError|identity/i)
  assert.match(analyticsHelper, /emit\(event\)/)
  assert.doesNotMatch(analyticsHelper, /emit\(event\s*,/)
})

test('capture payload, attribution, and acknowledgement semantics remain intact', async () => {
  const page = await read('../app/calculator/page.tsx')
  const handler = page.slice(page.indexOf('const handleEmailSubmit'), page.indexOf('\n  const navLinks'))

  assert.match(handler, /e\.preventDefault\(\)\s*if \(!college \|\| !residency\) return/)
  assert.match(handler, /payload: \{\s*captureId, email, phone: phoneNumber, smsConsent, state, residency,\s*collegeId: college\.id, referrer: attributionRef\.current\.referrer,\s*utm: attributionRef\.current\.utm, website,\s*\}/)
  assert.match(handler, /onAcknowledged:[\s\S]*sessionStorage\.setItem\('session-capture-ack', '1'\)[\s\S]*trackCalculatorEvent\('Lead Captured'/)
  assert.match(handler, /setDisplayAcknowledgement\(captureId\)/)
  assert.match(handler, /trackCalculatorEvent\('Capture Failed'\)[\s\S]*setCaptureError\('We could not save your request\./)
  assert.doesNotMatch(handler, /trackCalculatorEvent\([^\n]+,\s*\{/) // no analytics properties
})
