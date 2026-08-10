export const CAPTURE_ABUSE_CLEANUP_BATCH_SIZE = 15_000
export const CAPTURE_ABUSE_CLEANUP_MAX_BATCHES = 4
export const CAPTURE_ABUSE_MAX_NEW_DECISIONS_PER_DAY = 14_400
export const CAPTURE_ABUSE_MAX_NEW_WINDOWS_PER_DAY = 43_344

export function captureAbuseCleanupAuthorized(authorization, secret) {
  return Boolean(secret && authorization === `Bearer ${secret}`)
}

export function captureAbuseCleanupHasBacklog(result) {
  return Boolean(result && (result.remaining_windows > 0 || result.remaining_decisions > 0))
}
