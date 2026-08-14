import { createHmac, timingSafeEqual } from 'node:crypto'
import { captureNetworkAddress } from './capture-abuse.mjs'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function firstPartySessionDigest(session, secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32 || !UUID_V4.test(String(session).toLowerCase())) {
    throw new Error('first-party funnel digest unavailable')
  }
  return createHmac('sha256', secret).update(`funnel-session:v1:${String(session).toLowerCase()}`).digest('hex')
}

function tokenSignature(payload, secret) {
  return createHmac('sha256', secret).update(`funnel-token:v1:${payload}`).digest('hex')
}

export function firstPartyNetworkDigest(headers, secret) {
  const network = captureNetworkAddress(headers)
  if (!network || typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('first-party funnel network unavailable')
  return createHmac('sha256', secret).update(`funnel-network:v1:${network}`).digest('hex')
}

export function issueFirstPartyFunnelToken({ session, qa, networkDigest, secret, now = Date.now() }) {
  const digest = firstPartySessionDigest(session, secret)
  if (!/^[0-9a-f]{64}$/.test(networkDigest)) throw new Error('first-party funnel network unavailable')
  const expires = Math.floor(now / 1000) + 60 * 60 * 2
  const payload = `${expires}.${digest}.${networkDigest}.${qa ? '1' : '0'}`
  return `${payload}.${tokenSignature(payload, secret)}`
}

export function verifyFirstPartyFunnelToken({ token, session, networkDigest, secret, now = Date.now() }) {
  if (typeof token !== 'string' || token.length !== 207) return null
  const parts = token.split('.')
  if (parts.length !== 5 || !/^\d{10}$/.test(parts[0]) || !/^[0-9a-f]{64}$/.test(parts[1]) || !/^[0-9a-f]{64}$/.test(parts[2]) || !/^[01]$/.test(parts[3]) || !/^[0-9a-f]{64}$/.test(parts[4])) return null
  const expires = Number(parts[0])
  if (expires < Math.floor(now / 1000) || expires > Math.floor(now / 1000) + 60 * 60 * 2) return null
  const digest = firstPartySessionDigest(session, secret)
  if (digest !== parts[1] || networkDigest !== parts[2]) return null
  const expected = Buffer.from(tokenSignature(`${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]}`, secret), 'hex')
  const supplied = Buffer.from(parts[4], 'hex')
  if (!timingSafeEqual(expected, supplied)) return null
  return { sessionDigest: digest, networkDigest, qa: parts[3] === '1' }
}
