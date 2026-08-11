export const FIXTURE_RESULT_DISPATCH_BODY_LIMIT = 512
export const FIXTURE_RESULT_DISPATCH_SCOPE = 'fixture_result_dispatch'
export const FIXTURE_RESULT_DISPATCH_CONTROL = 'FIXTURE_RESULT_DISPATCH_ENABLED'

export const RESEND_RESERVED_TEST_RECIPIENTS = Object.freeze([
  'bounced@resend.dev',
  'complained@resend.dev',
  'delivered@resend.dev',
  'suppressed@resend.dev',
])

const CAPTURE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseFixtureResultDispatchBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== 'captureId') return null
  if (typeof value.captureId !== 'string' || !CAPTURE_ID.test(value.captureId)) return null
  return Object.freeze({ captureId: value.captureId.toLowerCase() })
}

export function isResendReservedTestRecipient(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return RESEND_RESERVED_TEST_RECIPIENTS.includes(normalized)
}

export function fixtureResultDispatchEnabled(env = process.env) {
  return env[FIXTURE_RESULT_DISPATCH_CONTROL] === '1'
}

export function fixtureResultDispatchRolloutReady(snapshot, env = process.env) {
  return fixtureResultDispatchEnabled(env)
    && snapshot?.configurationStatus === 'valid'
    && snapshot.configured.shadowLedger === true
    && snapshot.configured.resultsEnqueue === false
    && snapshot.configured.resultsDispatch === false
    && snapshot.configured.resultsRetry === false
    && snapshot.configured.nurtureEnqueue === false
    && snapshot.configured.nurtureClaim === false
    && snapshot.configured.nurtureDispatch === false
    && snapshot.configured.captureAcknowledgement === false
}

export function fixtureResultDispatchResponse(status) {
  if (status === 'accepted') return Object.freeze({ ok: true, status: 'fixture_result_accepted' })
  if (status === 'stopped') return Object.freeze({ ok: false, status: 'fixture_result_stopped' })
  if (status === 'failed') return Object.freeze({ ok: false, status: 'fixture_result_failed' })
  return Object.freeze({ ok: false, status: 'fixture_result_blocked' })
}
