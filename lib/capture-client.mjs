import { captureResponseIsAcknowledged } from './capture.mjs'

export class CaptureRequestError extends Error {
  constructor(code) { super(code); this.name = 'CaptureRequestError'; this.code = code }
}

export async function postCapture(fetcher, payload, { timeoutMs = 10_000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let response
    try {
      response = await fetcher('/api/insertEmailDocument', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: controller.signal,
      })
    } catch { throw new CaptureRequestError('network') }
    if (!response.ok) throw new CaptureRequestError('non_2xx')
    let value
    try { value = await response.json() } catch { throw new CaptureRequestError('invalid_ack') }
    if (!captureResponseIsAcknowledged(value, payload.captureId)) throw new CaptureRequestError('invalid_ack')
    return value
  } finally { clearTimeout(timer) }
}

export async function completeCapture({ fetcher, payload, onAcknowledged, timeoutMs = 10_000 }) {
  const acknowledgement = await postCapture(fetcher, payload, { timeoutMs })
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
