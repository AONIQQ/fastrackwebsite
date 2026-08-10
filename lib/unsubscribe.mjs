import { createHmac, timingSafeEqual } from 'node:crypto'

const normalize = (email) => String(email || '').trim().toLowerCase()

export function createUnsubscribeToken(email, secret) {
  const normalized = normalize(email)
  if (!normalized || !secret) throw new Error('unsubscribe token is not configured')
  const payload = Buffer.from(JSON.stringify({ v: 1, e: normalized })).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifyUnsubscribeToken(token, secret) {
  if (!token || !secret) return null
  const [payload, supplied, extra] = String(token).split('.')
  if (!payload || !supplied || extra) return null
  const expected = createHmac('sha256', secret).update(payload).digest()
  let actual
  try { actual = Buffer.from(supplied, 'base64url') } catch { return null }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    const email = normalize(parsed?.e)
    return parsed?.v === 1 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null
  } catch { return null }
}

export function unsubscribeHeaders(site, token) {
  return {
    'List-Unsubscribe': `<${site}/api/u?t=${encodeURIComponent(token)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}
