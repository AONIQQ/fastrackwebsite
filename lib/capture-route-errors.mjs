const FIXED_CAPTURE_ERRORS = Object.freeze({
  fixture_unauthorized: Object.freeze({ status: 401, error: 'Unauthorized', code: 'fixture_unauthorized', noStore: true }),
  capture_disabled: Object.freeze({ status: 503, error: 'Capture is temporarily unavailable', code: 'capture_disabled', noStore: false }),
  invalid_origin: Object.freeze({ status: 403, error: 'Request origin is not allowed', code: 'invalid_origin', noStore: false }),
  payload_too_large: Object.freeze({ status: 413, error: 'Request is too large', code: 'payload_too_large', noStore: false }),
  risk_identity_missing: Object.freeze({ status: 403, error: 'Request identity is unavailable', code: 'risk_identity_missing', noStore: false }),
  capture_mismatch: Object.freeze({ status: 409, error: 'Capture identity does not match this request', code: 'capture_mismatch', noStore: false }),
  invalid_college: Object.freeze({ status: 400, error: 'College does not match the selected state', code: 'invalid_college', noStore: false }),
  rate_limited: Object.freeze({ status: 429, error: 'Please wait before trying again', code: 'rate_limited', noStore: false }),
  risk_unavailable: Object.freeze({ status: 503, error: 'Capture is temporarily unavailable', code: 'risk_unavailable', noStore: false }),
})

function jsonResponse(body, status, noStore = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(noStore ? { 'Cache-Control': 'no-store' } : {}),
    },
  })
}

export function fixedCaptureErrorResponse(kind) {
  const definition = FIXED_CAPTURE_ERRORS[kind]
  if (!definition) throw new TypeError('invalid capture error response kind')
  return jsonResponse({ error: definition.error, code: definition.code }, definition.status, definition.noStore)
}

export function inputCaptureErrorResponse(error, code) {
  return jsonResponse({ error, code }, 400)
}
