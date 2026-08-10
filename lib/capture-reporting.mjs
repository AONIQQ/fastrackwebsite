export const CAPTURE_REPORT_EVENT_TYPES = new Set([
  'attempt',
  'accepted',
  'deduplicated',
  'rejected',
  'persistence_unconfirmed',
  'result_displayed',
])

export const CAPTURE_REPORT_REASON_CODES = new Set([
  'none',
  'stable_replay',
  'invalid_json',
  'invalid_body',
  'honeypot',
  'invalid_capture_id',
  'invalid_email',
  'invalid_state',
  'invalid_residency',
  'invalid_college',
  'invalid_phone',
  'invalid_consent',
  'invalid_attribution',
  'invalid_referrer',
  'payload_too_large',
  'risk_identity_missing',
  'capture_mismatch',
  'global_limit',
  'network_limit',
  'email_limit',
  'phone_limit',
  'database_or_response_unconfirmed',
])

export const CAPTURE_ATTRIBUTION_VALIDITY = new Set([
  'direct',
  'external_referrer',
  'valid_utm',
  'valid_click_id',
  'invalid',
  'unknown',
])

export const CAPTURE_TRAFFIC_CLASSES = new Set(['genuine', 'fixture', 'unknown'])

export function attributionValidity(attribution) {
  if (attribution?.gclid || attribution?.fbclid) return 'valid_click_id'
  if (['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].some((key) => attribution?.[key])) {
    return 'valid_utm'
  }
  if (attribution?.normalized_referrer) return 'external_referrer'
  return 'direct'
}

export function boundedCaptureReportEvent(input) {
  const eventType = CAPTURE_REPORT_EVENT_TYPES.has(input?.eventType) ? input.eventType : null
  const reasonCode = CAPTURE_REPORT_REASON_CODES.has(input?.reasonCode) ? input.reasonCode : null
  const attribution = CAPTURE_ATTRIBUTION_VALIDITY.has(input?.attributionValidity)
    ? input.attributionValidity
    : null
  const trafficClass = CAPTURE_TRAFFIC_CLASSES.has(input?.trafficClass) ? input.trafficClass : null
  if (!eventType || !reasonCode || !attribution || !trafficClass) {
    throw new TypeError('invalid capture reporting classification')
  }
  return { eventType, reasonCode, attributionValidity: attribution, trafficClass }
}

export function reportingReasonForInputError(code) {
  return CAPTURE_REPORT_REASON_CODES.has(code) ? code : 'invalid_body'
}
