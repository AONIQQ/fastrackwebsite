export const RESEND_EVENT_TYPES = Object.freeze([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.suppressed',
  'email.failed',
])

const STATE_RANK = Object.freeze({
  sent: 10,
  delivery_delayed: 20,
  delivered: 30,
  failed: 40,
  bounced: 40,
  suppressed: 40,
  complained: 50,
})

const MAX_PROVIDER_ID_LENGTH = 255
const MAX_EVENT_AGE_SECONDS = 300

export function validateSignedHeaders(headers, nowSeconds = Math.floor(Date.now() / 1000)) {
  const id = headers.id
  const timestamp = headers.timestamp
  const signature = headers.signature
  if (!id || !timestamp || !signature) throw new Error('missing_signature_headers')
  if (id.length > MAX_PROVIDER_ID_LENGTH) throw new Error('invalid_event_id')
  if (!/^\d+$/.test(timestamp)) throw new Error('invalid_signature_timestamp')
  const seconds = Number(timestamp)
  if (!Number.isSafeInteger(seconds) || Math.abs(nowSeconds - seconds) > MAX_EVENT_AGE_SECONDS) {
    throw new Error('stale_signature_timestamp')
  }
  return { id, timestamp, signature }
}

function boundedProviderId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PROVIDER_ID_LENGTH
    ? value
    : null
}

function validDate(value) {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function failureCategory(state) {
  if (state === 'delivery_delayed') return 'delivery_delayed'
  if (state === 'bounced') return 'permanent_bounce'
  if (state === 'complained') return 'recipient_complaint'
  if (state === 'suppressed') return 'provider_suppression'
  if (state === 'failed') return 'provider_failure'
  return null
}

export function normalizeResendEvent(payload, providerEventId) {
  if (!payload || typeof payload !== 'object') throw new Error('invalid_payload')
  if (!RESEND_EVENT_TYPES.includes(payload.type)) throw new Error('unsupported_event_type')
  const state = payload.type.slice('email.'.length)
  const providerMessageId = boundedProviderId(payload.data?.email_id)
  const providerCreatedAt = validDate(payload.created_at)
  if (!providerMessageId || !providerCreatedAt) throw new Error('invalid_event_payload')
  return {
    providerEventId,
    providerMessageId,
    eventType: state,
    providerCreatedAt,
    failureCategory: failureCategory(state),
  }
}

export function providerStateRank(state) {
  return STATE_RANK[state] ?? 0
}

export function shouldAdvanceProviderState(current, incoming) {
  if (!current?.state || !current?.at) return true
  const currentRank = providerStateRank(current.state)
  const incomingRank = providerStateRank(incoming.state)
  if (incomingRank < currentRank) return false
  if (incomingRank > currentRank) return true
  return new Date(incoming.at).getTime() > new Date(current.at).getTime()
}

export function assertAggregateReport(report) {
  const serialized = JSON.stringify(report)
  if (/@|subject|recipient|provider_message_id|provider_event_id|email_message_id/i.test(serialized)) {
    throw new Error('report_contains_disallowed_detail')
  }
  return report
}

export async function ingestResendWebhook({ rawBody, headers, secret, verify, persist, nowSeconds = undefined }) {
  if (!secret) return { status: 503, body: { error: 'Webhook unavailable' } }
  let signedHeaders
  let verified
  try {
    signedHeaders = validateSignedHeaders(headers, nowSeconds)
    verified = verify({ payload: rawBody, headers: signedHeaders, webhookSecret: secret })
  } catch {
    return { status: 400, body: { error: 'Invalid webhook' } }
  }
  let event
  try {
    event = normalizeResendEvent(verified, signedHeaders.id)
  } catch {
    return { status: 422, body: { error: 'Unsupported webhook' } }
  }
  const result = await persist(event)
  // Reject the duplicate from processing, but acknowledge it so Resend's
  // at-least-once retry loop does not keep redelivering an already-stored event.
  if (result.duplicate) return { status: 200, body: { ok: true, duplicate: true } }
  return { status: 200, body: { ok: true, outcome: result.outcome } }
}
