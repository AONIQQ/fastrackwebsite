export type FixedCaptureErrorKind =
  | 'fixture_unauthorized'
  | 'capture_disabled'
  | 'invalid_origin'
  | 'payload_too_large'
  | 'risk_identity_missing'
  | 'capture_mismatch'
  | 'invalid_college'
  | 'rate_limited'
  | 'risk_unavailable'

export function fixedCaptureErrorResponse(kind: FixedCaptureErrorKind): Response
export function inputCaptureErrorResponse(error: string, code: string): Response
