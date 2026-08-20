import { createHmac, timingSafeEqual } from 'node:crypto'

export const ATTRIBUTION_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60
export const MESSAGE_STEPS = Object.freeze(['results', 'n1', 'n2', 'n3', 'n4'])
export const CLICK_DESTINATIONS = Object.freeze(['home', 'calculator', 'guide', 'credit_map', 'checkout'])

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/

function sign(unsigned, secret) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('attribution signing secret is not configured')
  return createHmac('sha256', secret).update(unsigned).digest('base64url')
}

function safeSignatureEqual(actual, expected) {
  if (!SIGNATURE.test(actual)) return false
  const a = Buffer.from(actual, 'base64url')
  const b = Buffer.from(expected, 'base64url')
  return a.length === b.length && timingSafeEqual(a, b)
}

function validateClaims({ trackingId, step, expiresAt }, nowSeconds) {
  return UUID_V4.test(trackingId) && MESSAGE_STEPS.includes(step) && Number.isInteger(expiresAt) &&
    expiresAt >= nowSeconds && expiresAt <= nowSeconds + ATTRIBUTION_TOKEN_TTL_SECONDS
}

export function attributionSecret(env = process.env) {
  const secret = env.ATTRIBUTION_SIGNING_SECRET || env.UNSUBSCRIBE_SECRET || env.CRON_SECRET
  if (!secret || secret.length < 16) throw new Error('attribution signing secret is not configured')
  return secret
}

export function createEngagementToken({ trackingId, step, destination, expiresAt }, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!validateClaims({ trackingId, step, expiresAt }, nowSeconds) ||
      !['open', ...CLICK_DESTINATIONS].includes(destination)) throw new Error('invalid engagement token claims')
  const unsigned = `v1.e.${trackingId}.${step}.${expiresAt}.${destination}`
  return `${unsigned}.${sign(unsigned, secret)}`
}

export function verifyEngagementToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = String(token || '').split('.')
  if (parts.length !== 7 || parts[0] !== 'v1' || parts[1] !== 'e') return null
  const [, , trackingId, step, expiry, destination, signature] = parts
  const expiresAt = Number(expiry)
  if (!validateClaims({ trackingId, step, expiresAt }, nowSeconds) ||
      !['open', ...CLICK_DESTINATIONS].includes(destination)) return null
  const unsigned = parts.slice(0, 6).join('.')
  return safeSignatureEqual(signature, sign(unsigned, secret))
    ? { trackingId, step, expiresAt, destination }
    : null
}

export function createCheckoutToken({ trackingId, step, expiresAt }, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!validateClaims({ trackingId, step, expiresAt }, nowSeconds)) throw new Error('invalid checkout token claims')
  const unsigned = `v1.x.${trackingId}.${step}.${expiresAt}`
  return `${unsigned}.${sign(unsigned, secret)}`
}

export function verifyCheckoutToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = String(token || '').split('.')
  if (parts.length !== 6 || parts[0] !== 'v1' || parts[1] !== 'x') return null
  const [, , trackingId, step, expiry, signature] = parts
  const expiresAt = Number(expiry)
  if (!validateClaims({ trackingId, step, expiresAt }, nowSeconds)) return null
  const unsigned = parts.slice(0, 5).join('.')
  return safeSignatureEqual(signature, sign(unsigned, secret)) ? { trackingId, step, expiresAt } : null
}

export function messageStep(kind, nurtureStage) {
  if (kind === 'results' && nurtureStage == null) return 'results'
  if (kind === 'nurture' && Number.isInteger(nurtureStage) && nurtureStage >= 1 && nurtureStage <= 4) return `n${nurtureStage}`
  throw new Error('invalid logical message step')
}

export function checkoutAttributionOutcome({ referencePresent, tokenValid, identityExists, emailMatches }) {
  if (!referencePresent) return 'unattributed'
  if (!tokenValid) return 'invalid_token'
  if (!identityExists) return 'invalid_identity'
  return emailMatches ? 'attributed' : 'forwarded_unattributed'
}
