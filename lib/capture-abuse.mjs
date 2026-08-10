import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

export const CAPTURE_RISK_POLICY_VERSION = 'capture-risk-v1'
export const CAPTURE_RISK_RETENTION_DAYS = 30
export const CAPTURE_RATE_POLICIES = Object.freeze({
  global: Object.freeze({ windowSeconds: 600, limit: 100 }),
  network: Object.freeze({ windowSeconds: 60, limit: 8 }),
  email: Object.freeze({ windowSeconds: 86_400, limit: 3 }),
  phone: Object.freeze({ windowSeconds: 86_400, limit: 3 }),
})

export class CaptureRiskConfigurationError extends Error {
  constructor() { super('Capture risk control is unavailable'); this.name = 'CaptureRiskConfigurationError' }
}

function digest(secret, scope, value) {
  return createHmac('sha256', secret).update(`${CAPTURE_RISK_POLICY_VERSION}\0${scope}\0${value}`).digest('hex')
}

export function captureNetworkAddress(headers) {
  const value = headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
  return value && isIP(value) ? value : null
}

export function buildCaptureRiskKeys({ secret, network, email, phone }) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new CaptureRiskConfigurationError()
  }
  if (!network || !isIP(network)) return null
  return {
    global: digest(secret, 'global', 'calculator'),
    network: digest(secret, 'network', network),
    email: digest(secret, 'email', email),
    phone: phone ? digest(secret, 'phone', phone) : null,
  }
}

export function smsDispatchEnabled(env = process.env) {
  return env.CAPTURE_SMS_ENABLED === '1'
}
