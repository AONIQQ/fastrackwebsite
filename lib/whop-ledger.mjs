import { createHmac, timingSafeEqual } from 'node:crypto'

export const WHOP_WEBHOOK_EVENTS = Object.freeze([
  'payment_succeeded', 'payment_failed', 'refund_created', 'refund_updated', 'dispute_created', 'dispute_updated',
])
const WHOP_V1_PAYLOAD_EVENT = Object.freeze({
  'payment.succeeded': 'payment_succeeded', 'payment.failed': 'payment_failed',
  'refund.created': 'refund_created', 'refund.updated': 'refund_updated',
  'dispute.created': 'dispute_created', 'dispute.updated': 'dispute_updated',
})
export const WHOP_WEBHOOK_BODY_LIMIT = 128 * 1024

const IDENTIFIER = /^(?:msg|pay|rf|dspt|ch|plan|prod)_[A-Za-z0-9_-]{3,128}$/

/** Convert Whop decimal-dollar amounts without binary-float rounding surprises. */
export function cents(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const text = String(value).trim()
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(result) ? result : null
}

export function boundedMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  for (const key of ['checkout_ref', 'utm_source', 'utm_medium', 'utm_campaign']) {
    const item = value[key]
    if (typeof item === 'string' && item.length > 0 && item.length <= 256 && /^[A-Za-z0-9._~-]+$/.test(item)) out[key] = item
  }
  return out
}

export function disputeState(status) {
  const value = String(status || '').toLowerCase()
  if (/(^|_)(won|resolved_won|warning_closed)(_|$)/.test(value)) return 'won'
  if (/(^|_)(lost|resolved_lost)(_|$)/.test(value)) return 'lost'
  return 'open'
}

export function normalizeWhopEvent(event) {
  const eventType = event && typeof event.type === 'string' && Object.hasOwn(WHOP_V1_PAYLOAD_EVENT, event.type)
    ? WHOP_V1_PAYLOAD_EVENT[event.type] : null
  if (!eventType || event.api_version !== 'v1' || !IDENTIFIER.test(String(event.id || ''))) return null
  const envelopeAt = new Date(event.timestamp)
  if (!Number.isFinite(envelopeAt.getTime())) return null
  const data = event.data && typeof event.data === 'object' && !Array.isArray(event.data) ? event.data : null
  if (!data) return null
  const payment = eventType.startsWith('payment_') ? data : data.payment
  const paymentId = String(payment?.id || '')
  const objectId = String(data.id || '')
  if (!IDENTIFIER.test(paymentId) || !paymentId.startsWith('pay_') || !IDENTIFIER.test(objectId)) return null
  const created = new Date(data.provider_created_at || data.created_at || payment.created_at || event.timestamp)
  // Whop's refund_updated and dispute_updated v1 schemas do not include an
  // updated_at field. The signed envelope timestamp is therefore the only
  // monotonic lifecycle clock shared by all six supported event families.
  const lifecycle = new Date(event.timestamp)
  const paid = new Date(payment.paid_at || payment.updated_at || payment.created_at || event.timestamp)
  if (!Number.isFinite(created.getTime()) || !Number.isFinite(lifecycle.getTime()) || !Number.isFinite(paid.getTime())) return null
  const paymentAmountCents = cents(payment.total)
  const amountCents = eventType.startsWith('refund_') || eventType.startsWith('dispute_') ? cents(data.amount) : paymentAmountCents
  const currencyValue = data.currency ?? payment.currency
  return {
    eventId: event.id, eventType, objectId, paymentId,
    companyId: typeof event.company_id === 'string' ? event.company_id.slice(0, 160) : null,
    checkoutId: typeof payment.checkout_configuration_id === 'string' ? payment.checkout_configuration_id.slice(0, 160) : null,
    productId: typeof payment.product?.id === 'string' ? payment.product.id.slice(0, 160)
      : typeof data.product?.id === 'string' ? data.product.id.slice(0, 160) : null,
    planId: typeof payment.plan?.id === 'string' ? payment.plan.id.slice(0, 160)
      : typeof data.plan?.id === 'string' ? data.plan.id.slice(0, 160) : null,
    amountCents, paymentAmountCents,
    currency: typeof currencyValue === 'string' ? currencyValue.toLowerCase() : null,
    email: typeof payment.user?.email === 'string' ? payment.user.email.trim().toLowerCase().slice(0, 320) : null,
    metadata: boundedMetadata(payment.metadata),
    state: eventType.startsWith('refund_') ? String(data.status || 'unknown').toLowerCase().slice(0, 64)
      : eventType.startsWith('dispute_') ? disputeState(data.status)
        : eventType === 'payment_succeeded' ? 'paid' : 'failed',
    providerCreatedAt: created.toISOString(), paidAt: paid.toISOString(), lifecycleAt: lifecycle.toISOString(),
  }
}

function decodeSigningKey(secret) {
  if (typeof secret !== 'string' || !/^ws_[A-Fa-f0-9]{64}$/.test(secret)) return null
  // Whop's current TypeScript SDK expects btoa(WHOP_WEBHOOK_SECRET), so the
  // Standard Webhooks key is the complete dashboard token's UTF-8 bytes.
  return Buffer.from(secret, 'utf8')
}

export function verifyWhopSignature(rawBody, headers, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const id = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signatureHeader = headers.get('webhook-signature')
  const ts = Number(timestamp)
  const signingKey = decodeSigningKey(secret)
  if (!id || !Number.isInteger(ts) || Math.abs(nowSeconds - ts) > 300 || !signatureHeader || !signingKey) return false
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody)
  const expected = createHmac('sha256', signingKey).update(id).update('.').update(timestamp).update('.').update(body).digest()
  return signatureHeader.split(' ').some((entry) => {
    const [version, encoded] = entry.split(',', 2)
    if (version !== 'v1' || !encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return false
    const actual = Buffer.from(encoded, 'base64')
    return actual.length === expected.length && actual.toString('base64') === encoded && timingSafeEqual(actual, expected)
  })
}

/** Read and stop at 128 KiB instead of buffering an attacker-controlled body first. */
export async function readWhopBody(request, limit = WHOP_WEBHOOK_BODY_LIMIT) {
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) return { ok: false, status: 413 }
  if (!request.body) return { ok: true, body: Buffer.alloc(0) }
  const reader = request.body.getReader()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > limit) {
        await reader.cancel()
        return { ok: false, status: 413 }
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return { ok: true, body: Buffer.concat(chunks, length) }
}

export function sanitizeUtm(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return text && text.length <= 100 && /^[a-z0-9._~-]+$/.test(text) ? text : null
}
