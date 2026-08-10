import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const FIXTURE_AUTHORIZATION_TTL_MS = 5 * 60 * 1000

const signature = (payload, secret) => createHmac('sha256', secret).update(payload).digest('base64url')

export function createFixtureAuthorization(secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 16) throw new TypeError('fixture authorization unavailable')
  const payload = `${now}.${randomBytes(16).toString('base64url')}`
  return `${payload}.${signature(payload, secret)}`
}

export function verifyFixtureAuthorization(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || typeof secret !== 'string' || secret.length < 16) return false
  const parts = token.split('.')
  if (parts.length !== 3 || !/^\d{13}$/.test(parts[0]) || !/^[A-Za-z0-9_-]{22}$/.test(parts[1])) return false
  const issuedAt = Number(parts[0])
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now + 30_000 || now - issuedAt > FIXTURE_AUTHORIZATION_TTL_MS) return false
  const payload = `${parts[0]}.${parts[1]}`
  const expected = Buffer.from(signature(payload, secret))
  const supplied = Buffer.from(parts[2])
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}
