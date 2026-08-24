const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'])
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
const ATTR_LIMITS = { utm_source: 64, utm_medium: 64, utm_campaign: 128, utm_content: 128, utm_term: 128, gclid: 256, fbclid: 256 }
export { ATTR_LIMITS }
export const CAPTURE_BODY_LIMIT = 12_000
export const SMS_CONSENT_VERSION = 'calculator-sms-v1'

export class CaptureInputError extends Error {
  constructor(code, message) { super(message); this.name = 'CaptureInputError'; this.code = code }
}

function scalar(value, limit, field) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new CaptureInputError('invalid_attribution', `${field} must be text`)
  const clean = value.trim()
  if (!clean) return null
  if (clean.length > limit) throw new CaptureInputError('invalid_attribution', `${field} is too long`)
  return clean
}

export function normalizeAttribution(raw, referrer, requestUrl) {
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) {
    throw new CaptureInputError('invalid_attribution', 'Attribution must be an object')
  }
  const source = raw ?? {}
  for (const key of Object.keys(source)) {
    if (![...UTM_KEYS, 'gclid', 'fbclid'].includes(key)) throw new CaptureInputError('invalid_attribution', 'Unknown attribution field')
  }
  const attribution = {}
  for (const key of [...UTM_KEYS, 'gclid', 'fbclid']) attribution[key] = scalar(source[key], ATTR_LIMITS[key], key)

  let normalizedReferrer = null
  const candidate = scalar(referrer, 512, 'referrer')
  if (candidate) {
    try {
      const parsed = new URL(candidate)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('scheme')
      if (parsed.origin !== new URL(requestUrl).origin) normalizedReferrer = parsed.toString()
    } catch { throw new CaptureInputError('invalid_referrer', 'Referrer is invalid') }
  }
  return { ...attribution, normalized_referrer: normalizedReferrer }
}

export function normalizePhone(value) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.length > 40) throw new CaptureInputError('invalid_phone', 'Phone number is invalid')
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  throw new CaptureInputError('invalid_phone', 'Phone number is invalid')
}

export function validateCaptureInput(body, requestUrl) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CaptureInputError('invalid_body', 'Invalid request')
  if (body.website) throw new CaptureInputError('honeypot', 'Invalid request')
  if (typeof body.captureId !== 'string' || !UUID_V4.test(body.captureId)) throw new CaptureInputError('invalid_capture_id', 'Invalid capture identity')
  if (typeof body.email !== 'string' || body.email.length > 254 || !EMAIL.test(body.email.trim())) throw new CaptureInputError('invalid_email', 'A valid email is required')
  const state = typeof body.state === 'string' ? body.state.toUpperCase() : ''
  if (!STATES.has(state)) throw new CaptureInputError('invalid_state', 'A valid state is required')
  if (body.residency !== 'inState' && body.residency !== 'outOfState') throw new CaptureInputError('invalid_residency', 'A valid residency is required')
  if (!Number.isSafeInteger(body.collegeId) || body.collegeId <= 0) throw new CaptureInputError('invalid_college', 'A valid college is required')
  const phone = normalizePhone(body.phone)
  if (body.smsConsent !== true && body.smsConsent !== false) throw new CaptureInputError('invalid_consent', 'Consent choice is required')
  if (body.smsConsent && !phone) throw new CaptureInputError('invalid_consent', 'A valid phone is required for text consent')
  const attribution = normalizeAttribution(body.utm, body.referrer, requestUrl)
  return {
    captureId: body.captureId.toLowerCase(), email: body.email.trim().toLowerCase(), state,
    residency: body.residency, collegeId: body.collegeId, phone,
    smsConsent: body.smsConsent, attribution, isFixture: false,
  }
}

export function isAllowedCaptureOrigin(origin, requestUrl) {
  if (!origin) return false
  try { return new URL(origin).origin === new URL(requestUrl).origin } catch { return false }
}

export function captureResponseIsAcknowledged(value, captureId) {
  const durableId = value && (
    (Number.isSafeInteger(value.id) && value.id > 0)
    || (typeof value.id === 'string' && /^[1-9]\d{0,18}$/.test(value.id))
  )
  return Boolean(durableId && value.ok === true && value.capture_id === captureId && value.roi && typeof value.roi === 'object')
}

export function captureFingerprintInput(input) {
  return JSON.stringify({
    email: input.email, state: input.state, residency: input.residency,
    collegeId: input.collegeId, phone: input.phone, smsConsent: input.smsConsent,
    attribution: Object.fromEntries([...UTM_KEYS, 'gclid', 'fbclid', 'normalized_referrer'].map((key) => [key, input.attribution[key] ?? null])),
  })
}
