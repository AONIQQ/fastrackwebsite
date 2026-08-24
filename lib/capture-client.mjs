import { captureResponseIsAcknowledged } from './capture.mjs'

export class CaptureRequestError extends Error {
  constructor(code) { super(code); this.name = 'CaptureRequestError'; this.code = code }
}

const RECONCILABLE_CAPTURE_ERRORS = new Set(['network', 'server', 'invalid_ack'])

async function postCaptureAttempt(fetcher, payload, { timeoutMs, endpoint, headers }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response
    try {
      response = await fetcher(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payload), signal: controller.signal,
      })
    } catch { throw new CaptureRequestError('network') }
    if (!response.ok) {
      throw new CaptureRequestError(Number.isInteger(response.status) && response.status >= 500 ? 'server' : 'non_2xx')
    }
    let value
    try { value = await response.json() } catch { throw new CaptureRequestError('invalid_ack') }
    if (!captureResponseIsAcknowledged(value, payload.captureId)) throw new CaptureRequestError('invalid_ack')
    return value
  } finally { clearTimeout(timer) }
}

export async function postCapture(fetcher, payload, {
  timeoutMs = 20_000,
  endpoint = '/api/insertEmailDocument',
  headers = {},
  reconciliationAttempts = 1,
} = {}) {
  let lastError
  for (let attempt = 0; attempt <= reconciliationAttempts; attempt += 1) {
    try {
      return await postCaptureAttempt(fetcher, payload, { timeoutMs, endpoint, headers })
    } catch (error) {
      lastError = error
      if (!(error instanceof CaptureRequestError)
        || !RECONCILABLE_CAPTURE_ERRORS.has(error.code)
        || attempt === reconciliationAttempts) throw error
    }
  }
  throw lastError
}

export function captureRequestFailureMessage(error) {
  return error instanceof CaptureRequestError && RECONCILABLE_CAPTURE_ERRORS.has(error.code)
    ? 'We could not confirm the response. Your request may already be saved, so check your email or try again.'
    : 'We could not process your request. Your information is still here. Please try again.'
}

export async function completeCapture({
  fetcher, payload, onAcknowledged, timeoutMs = 20_000,
  endpoint = '/api/insertEmailDocument', headers = {}, reconciliationAttempts = 1,
}) {
  const acknowledgement = await postCapture(fetcher, payload, {
    timeoutMs, endpoint, headers, reconciliationAttempts,
  })
  onAcknowledged({ roi: acknowledgement.roi, acknowledgement })
  return { roi: acknowledgement.roi, acknowledgement }
}

export async function acknowledgeResultDisplay(fetcher, captureId, { timeoutMs = 4_000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response
    try {
      response = await fetcher('/api/capture/result-displayed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captureId }), signal: controller.signal,
      })
    } catch { throw new CaptureRequestError('display_ack_failed') }
    if (!response.ok) throw new CaptureRequestError('display_ack_failed')
    let value
    try { value = await response.json() } catch { throw new CaptureRequestError('display_ack_failed') }
    if (!value || value.ok !== true) throw new CaptureRequestError('display_ack_failed')
    return value
  } finally { clearTimeout(timer) }
}
