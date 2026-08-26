export type CaptureFailurePhase = 'risk_claim' | 'college_lookup' | 'roi_compute' | 'lead_insert'
export type CaptureFailureSqlstate = '23503' | '23505' | '23514' | '40001' | '40P01' | '57014'
export type CaptureFailureConstraint =
  | 'capture_rate_windows_scope_check'
  | 'capture_rate_windows_digest_check'
  | 'capture_rate_windows_window_check'
  | 'capture_rate_windows_attempt_check'
  | 'capture_risk_decisions_hash_check'
  | 'capture_risk_decisions_policy_length'
  | 'capture_risk_decisions_decision_check'
  | 'capture_risk_decisions_reason_check'
  | 'capture_risk_decisions_acceptance_check'
  | 'capture_risk_decisions_sms_check'
  | 'capture_risk_decisions_validation_code_check'
  | 'leads_capture_risk_policy_length'
  | 'leads_sms_eligibility_check'
  | 'capture_reporting_bucket_hour_check'
  | 'capture_reporting_event_check'
  | 'capture_reporting_reason_check'
  | 'capture_reporting_attribution_check'
  | 'capture_reporting_traffic_check'
  | 'capture_reporting_count_check'
  | 'leads_capture_state_check'
  | 'leads_capture_residency_check'
  | 'leads_capture_hash_check'
  | 'leads_capture_attribution_validity_check'
  | 'leads_capture_attribution_bounds_check'
  | 'leads_capture_utm_shape_check'
  | 'leads_capture_consent_relationship_check'
  | 'leads_capture_lifecycle_check'
  | 'leads_result_display_relationship_check'
  | 'leads_nurture_stage_check'
  | 'leads_capture_college_fk'
  | 'leads_capture_risk_fk'
  | 'leads_capture_risk_decision_check'
  | 'leads_capture_risk_binding_fk'
  | 'leads_capture_complete_risk_binding_check'
  | 'email_messages_kind_check'
  | 'email_messages_stage_check'
  | 'email_messages_status_check'
  | 'email_messages_failure_length'

export type CaptureFailureDiagnostic = Readonly<
  | { event: 'capture_failure'; version: 1; phase: CaptureFailurePhase }
  | { event: 'capture_failure'; version: 1; phase: CaptureFailurePhase; sqlstate: CaptureFailureSqlstate }
  | {
      event: 'capture_failure'
      version: 1
      phase: CaptureFailurePhase
      sqlstate: CaptureFailureSqlstate
      constraint: CaptureFailureConstraint
    }
>

export function captureFailureDiagnostic(phase: CaptureFailurePhase, error: unknown): CaptureFailureDiagnostic
export function captureFailureLogDiagnostic(
  phase: CaptureFailurePhase | null,
  error: unknown,
): CaptureFailureDiagnostic | null

export type CaptureFailureResponse = Readonly<
  | {
      body: Readonly<{ error: 'Failed to capture results'; code: 'capture_failed' }>
      diagnostic: null
      noStore: false
    }
  | {
      body: Readonly<{
        error: 'Failed to capture results'
        code: 'capture_failed'
        diagnostic: CaptureFailureDiagnostic
      }>
      diagnostic: CaptureFailureDiagnostic
      noStore: true
    }
>

export function captureFailureResponse(
  fixtureAuthorized: boolean,
  phase: CaptureFailurePhase | null,
  error: unknown,
): CaptureFailureResponse

export function captureFailureHttpResponse(failure: CaptureFailureResponse): Response
