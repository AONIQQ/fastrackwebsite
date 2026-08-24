const SLOW_CAPTURE_THRESHOLD_MS = 5_000

export function captureLatencyBucket(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) throw new TypeError('invalid capture duration')
  if (durationMs < SLOW_CAPTURE_THRESHOLD_MS) return 'under_5s'
  if (durationMs < 10_000) return '5_to_10s'
  if (durationMs < 20_000) return '10_to_20s'
  return '20s_or_more'
}

export function slowCaptureDiagnostic(durationMs, outcome) {
  if (!['acknowledged', 'failed'].includes(outcome)) throw new TypeError('invalid capture outcome')
  const latencyBucket = captureLatencyBucket(durationMs)
  if (latencyBucket === 'under_5s') return null
  return Object.freeze({
    event: 'capture_slow', version: 1, outcome, latency_bucket: latencyBucket,
  })
}
