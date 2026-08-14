export const CANONICAL_PRODUCTION_HOSTS = Object.freeze([
  'fastrack.school',
  'www.fastrack.school',
])

export const CALCULATOR_ANALYTICS_EVENTS = Object.freeze([
  'Calculator Intent',
  'Calculator Modal Opened',
  'Capture Submission Attempted',
  'Lead Captured',
  'Capture Failed',
])

const eventNames = new Set(CALCULATOR_ANALYTICS_EVENTS)

export function isCanonicalProductionHost(hostname) {
  return CANONICAL_PRODUCTION_HOSTS.includes(hostname)
}

export function getAnalyticsSessionStorage(browserWindow) {
  try {
    return browserWindow?.sessionStorage
  } catch {
    return undefined
  }
}

export function emitCalculatorAnalyticsEvent({ hostname, event, emit, onceKey, storage }) {
  if (!isCanonicalProductionHost(hostname) || !eventNames.has(event) || typeof emit !== 'function') {
    return false
  }

  try {
    if (onceKey && storage?.getItem(onceKey) === '1') return false
    emit(event)
    if (onceKey) storage?.setItem(onceKey, '1')
    return true
  } catch {
    // Measurement must never interrupt or alter the calculator journey.
    return false
  }
}
