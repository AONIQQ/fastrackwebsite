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

export function getSessionStorageValue(storage, key) {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function setSessionStorageValue(storage, key, value) {
  try {
    storage?.setItem(key, value)
  } catch {
    // Storage is an optimization. The calculator must remain usable without it.
  }
}

export function removeSessionStorageValue(storage, key) {
  try {
    storage?.removeItem(key)
  } catch {
    // Storage is an optimization. The calculator must remain usable without it.
  }
}

export function getClarityEventEmitter(browserWindow, hostname) {
  if (!isCanonicalProductionHost(hostname)) return undefined

  try {
    let clarity = browserWindow?.clarity
    if (typeof clarity === 'undefined') {
      const queuedClarity = function () {
        queuedClarity.q = queuedClarity.q || []
        queuedClarity.q.push(arguments)
      }
      browserWindow.clarity = queuedClarity
      clarity = browserWindow.clarity
    }
    if (typeof clarity !== 'function') return undefined
    return (event) => clarity.call(browserWindow, 'event', event)
  } catch {
    return undefined
  }
}

export function emitCalculatorAnalyticsEvent({ hostname, event, emitters, onceKey, storage }) {
  if (!isCanonicalProductionHost(hostname) || !eventNames.has(event) || !Array.isArray(emitters)) {
    return false
  }

  let emitted = false
  for (const [index, emitter] of emitters.entries()) {
    const emit = emitter?.emit
    if (typeof emit !== 'function') continue
    const emitterOnceKey = onceKey
      ? index === 0 ? onceKey : `${onceKey}:${emitter.key}`
      : undefined
    if (emitterOnceKey && getSessionStorageValue(storage, emitterOnceKey) === '1') continue
    try {
      emit(event)
      emitted = true
      if (emitterOnceKey) setSessionStorageValue(storage, emitterOnceKey, '1')
    } catch {
      // One analytics surface must not block the other or the calculator.
    }
  }

  return emitted
}
