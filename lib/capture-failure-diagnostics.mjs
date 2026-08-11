const PHASES = new Set(['risk_claim', 'college_lookup', 'roi_compute', 'lead_insert'])

// Keep this list limited to PostgreSQL error classes that can describe the
// capture statements without reflecting database or visitor-controlled text.
const SQLSTATES = new Set(['23503', '23505', '23514', '40001', '40P01', '57014'])

// These names are copied exactly from the checked-in additive migrations.
const CONSTRAINTS = new Set([
  'capture_rate_windows_scope_check',
  'capture_rate_windows_digest_check',
  'capture_rate_windows_window_check',
  'capture_rate_windows_attempt_check',
  'capture_risk_decisions_hash_check',
  'capture_risk_decisions_policy_length',
  'capture_risk_decisions_decision_check',
  'capture_risk_decisions_reason_check',
  'capture_risk_decisions_acceptance_check',
  'capture_risk_decisions_sms_check',
  'capture_risk_decisions_validation_code_check',
  'leads_capture_risk_policy_length',
  'leads_sms_eligibility_check',
  'capture_reporting_bucket_hour_check',
  'capture_reporting_event_check',
  'capture_reporting_reason_check',
  'capture_reporting_attribution_check',
  'capture_reporting_traffic_check',
  'capture_reporting_count_check',
  'leads_capture_state_check',
  'leads_capture_residency_check',
  'leads_capture_hash_check',
  'leads_capture_attribution_validity_check',
  'leads_capture_attribution_bounds_check',
  'leads_capture_utm_shape_check',
  'leads_capture_consent_relationship_check',
  'leads_capture_lifecycle_check',
  'leads_result_display_relationship_check',
  'leads_nurture_stage_check',
  'leads_capture_college_fk',
  'leads_capture_risk_fk',
  'leads_capture_risk_decision_check',
  'leads_capture_risk_binding_fk',
  'leads_capture_complete_risk_binding_check',
  'email_messages_kind_check',
  'email_messages_stage_check',
  'email_messages_status_check',
  'email_messages_failure_length',
])

function safeOwnString(error, key) {
  if ((typeof error !== 'object' && typeof error !== 'function') || error === null) return null
  try {
    if (!Object.prototype.hasOwnProperty.call(error, key)) return null
    const value = error[key]
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

/**
 * Produce the entire loggable capture-failure value. No caller-provided value
 * is copied into the result; database fields survive only by exact membership.
 *
 * @param {'risk_claim'|'college_lookup'|'roi_compute'|'lead_insert'} phase
 * @param {unknown} error
 */
export function captureFailureDiagnostic(phase, error) {
  if (!PHASES.has(phase)) throw new TypeError('invalid capture failure phase')

  const code = safeOwnString(error, 'code')
  if (!code || !SQLSTATES.has(code)) {
    return Object.freeze({ event: 'capture_failure', version: 1, phase })
  }

  const constraint = safeOwnString(error, 'constraint')
  return constraint && CONSTRAINTS.has(constraint)
    ? Object.freeze({ event: 'capture_failure', version: 1, phase, sqlstate: code, constraint })
    : Object.freeze({ event: 'capture_failure', version: 1, phase, sqlstate: code })
}
