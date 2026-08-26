import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createUniqueCheckoutToken, verifyCheckoutToken } from '../lib/attribution-tokens.mjs'
import { createBuyerStartToken, parseCreditMapIntake, verifyBuyerStartToken } from '../lib/credit-map-buyer-start.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (value) => readFileSync(path.join(root, value), 'utf8')
const secret = 'fixture-secret-long-enough-for-hmac'
const now = 1_800_000_000

test('unique checkout references preserve attribution claims but cannot collide across buyer clicks', () => {
  const claims = { trackingId: '10000000-0000-4000-8000-000000000001', step: 'n3', expiresAt: now + 3600 }
  const first = createUniqueCheckoutToken({ ...claims, nonce: '20000000-0000-4000-8000-000000000002' }, secret, now)
  const second = createUniqueCheckoutToken({ ...claims, nonce: '30000000-0000-4000-8000-000000000003' }, secret, now)
  assert.notEqual(first, second)
  assert.deepEqual(verifyCheckoutToken(first, secret, now), { ...claims, nonce: '20000000-0000-4000-8000-000000000002' })
  assert.equal(verifyCheckoutToken(first.replace('n3', 'n2'), secret, now), null)
})

test('buyer token is opaque, sale-specific, expiring, and signed', () => {
  const session = 'cs_live_1234567890abcdefghij'
  const made = createBuyerStartToken(session, secret, now)
  assert.doesNotMatch(made.token, /cs_live|1234567890abcdefghij/)
  assert.deepEqual(verifyBuyerStartToken(made.token, secret, now), { key: made.key, expiresAt: now + 86400 })
  assert.equal(verifyBuyerStartToken(made.token, secret, now + 86401), null)
  assert.equal(verifyBuyerStartToken(`${made.token.slice(0, -1)}x`, secret, now), null)
  assert.notEqual(createBuyerStartToken('cs_live_different1234567890', secret, now).key, made.key)
})

test('intake accepts only the minimum bounded fields and normalizes without inventing data', () => {
  assert.deepEqual(parseCreditMapIntake({
    student_grade: '11', current_school_program: 'Fastrack Homeschool', graduation_year: '2027', state: 'fl',
    dual_enrollment_provider: 'Tallahassee State College', target_college: ' Florida State University ', intended_major: 'Undecided',
    current_dual_credit: 'ENC 1101\r\nMAC 1105', planning_context: 'No Friday classes',
  }, 2026), {
    studentGrade: '11', currentSchoolProgram: 'Fastrack Homeschool', graduationYear: 2027, state: 'FL',
    dualEnrollmentProvider: 'Tallahassee State College', targetCollege: 'Florida State University', intendedMajor: 'Undecided',
    currentDualCredit: 'ENC 1101\nMAC 1105', planningContext: 'No Friday classes',
  })
  const base = { student_grade: '11', current_school_program: 'Home program', graduation_year: '2027', state: 'FL', dual_enrollment_provider: 'Not enrolled yet', target_college: 'FSU', intended_major: 'Undecided', current_dual_credit: 'None', planning_context: '' }
  assert.equal(parseCreditMapIntake({ ...base, student_grade: '8' }, 2026), null)
  assert.equal(parseCreditMapIntake({ ...base, extra: 'no' }, 2026), null)
  assert.equal(parseCreditMapIntake({ ...base, graduation_year: '2033' }, 2026), null)
  assert.ok(parseCreditMapIntake({ ...base, student_grade: 'graduated', graduation_year: '2020' }, 2026))
  assert.equal(parseCreditMapIntake({ ...base, student_grade: 'graduated', graduation_year: '2027' }, 2026), null)
})

test('buyer-start routes enforce clean redirect, paid sale gates, idempotency, and no sensitive logging', () => {
  const start = read('app/credit-map/start/route.ts')
  const intake = read('app/api/credit-map/intake/route.ts')
  const page = read('app/credit-map/start/intake/page.tsx')
  const webhook = read('app/api/webhooks/stripe/route.ts')
  assert.doesNotMatch(start, /searchParams\.get\(['"]session_id|checkout_session_id.*searchParams/)
  assert.match(start, /client_reference_id/)
  assert.match(start, /payment_state = 'paid'/)
  assert.match(start, /coalesce\(sale\.is_fixture, false\) = false/)
  assert.match(start, /refunded_cents, 0\) = 0/)
  assert.match(start, /not in \('open', 'lost'\)/)
  assert.match(intake, /candidate\.status = 'awaiting_intake'/)
  assert.match(intake, /already_submitted/)
  for (const field of ['current_school_program', 'graduation_year', 'dual_enrollment_provider']) assert.match(intake, new RegExp(field))
  assert.match(intake, /firstPartyRequestContextIsAllowed/)
  assert.match(page, /spreadsheet and PDF within 7 business days/)
  assert.match(page, /No call is required/)
  assert.match(webhook, /insert into credit_map_intakes/)
  for (const source of [start, intake]) assert.doesNotMatch(source, /console\.(?:log|error|warn)/)
})
