import { createHmac, timingSafeEqual } from 'node:crypto'

export const BUYER_START_TTL_SECONDS = 24 * 60 * 60
export const CREDIT_MAP_CHECKOUT_COOKIE = 'fastrack_credit_map_checkout'
export const CREDIT_MAP_BUYER_COOKIE = 'fastrack_credit_map_buyer'

const KEY = /^[A-Za-z0-9_-]{43}$/
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/
const TOKEN = /^v1\.cm\.([A-Za-z0-9_-]{43})\.(\d{10})\.([A-Za-z0-9_-]{43})$/
const STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '))

function hmac(value, secret) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('buyer start secret is not configured')
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(actual, expected) {
  if (!SIGNATURE.test(actual) || !SIGNATURE.test(expected)) return false
  const a = Buffer.from(actual, 'base64url')
  const b = Buffer.from(expected, 'base64url')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createBuyerStartToken(checkoutSessionId, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof checkoutSessionId !== 'string' || !/^cs_(?:live|test)_[A-Za-z0-9_]{12,240}$/.test(checkoutSessionId)) {
    throw new Error('invalid checkout session')
  }
  const key = hmac(`fastrack:credit-map:buyer-key:v1:${checkoutSessionId}`, secret)
  const expiresAt = nowSeconds + BUYER_START_TTL_SECONDS
  const unsigned = `v1.cm.${key}.${expiresAt}`
  return { token: `${unsigned}.${hmac(unsigned, secret)}`, key, expiresAt }
}

export function verifyBuyerStartToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const match = TOKEN.exec(String(token || ''))
  if (!match) return null
  const [, key, expiry, signature] = match
  const expiresAt = Number(expiry)
  if (!KEY.test(key) || !Number.isInteger(expiresAt) || expiresAt < nowSeconds || expiresAt > nowSeconds + BUYER_START_TTL_SECONDS) return null
  const unsigned = `v1.cm.${key}.${expiresAt}`
  return safeEqual(signature, hmac(unsigned, secret)) ? { key, expiresAt } : null
}

const clean = (value, max) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
const cleanMultiline = (value, max) => typeof value === 'string' ? value.trim().replace(/\r\n?/g, '\n').slice(0, max) : ''

export function parseCreditMapIntake(input, currentYear = new Date().getUTCFullYear()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const allowed = ['student_grade', 'current_school_program', 'graduation_year', 'state', 'dual_enrollment_provider', 'target_college', 'intended_major', 'current_dual_credit', 'planning_context']
  const keys = Object.keys(input)
  if (keys.some((key) => !allowed.includes(key)) || keys.some((key) => typeof input[key] !== 'string')) return null
  const studentGrade = clean(input.student_grade, 16)
  const currentSchoolProgram = clean(input.current_school_program, 240)
  const graduationYearText = clean(input.graduation_year, 4)
  const graduationYear = Number(graduationYearText)
  const state = clean(input.state, 2).toUpperCase()
  const dualEnrollmentProvider = clean(input.dual_enrollment_provider, 240)
  const targetCollege = clean(input.target_college, 240)
  const intendedMajor = clean(input.intended_major, 160)
  const currentDualCredit = cleanMultiline(input.current_dual_credit, 2000)
  const planningContext = cleanMultiline(input.planning_context, 2000)
  if (!['9', '10', '11', '12', 'graduated'].includes(studentGrade)) return null
  if (!Number.isInteger(currentYear) || currentYear < 2000 || currentYear > 2094 || !/^\d{4}$/.test(graduationYearText)) return null
  const plausibleGraduationYear = studentGrade === 'graduated'
    ? graduationYear >= currentYear - 10 && graduationYear <= currentYear
    : graduationYear >= currentYear && graduationYear <= currentYear + 6
  if (!plausibleGraduationYear || currentSchoolProgram.length < 2 || !STATES.has(state) || dualEnrollmentProvider.length < 2 || targetCollege.length < 2 || intendedMajor.length < 2 || !currentDualCredit) return null
  return { studentGrade, currentSchoolProgram, graduationYear, state, dualEnrollmentProvider, targetCollege, intendedMajor, currentDualCredit, planningContext: planningContext || null }
}
