import { firstPartyAttributionFromSearch, FIRST_PARTY_FUNNEL_EVENTS } from './first-party-funnel-contract.mjs'
import { getSessionStorageValue, isCanonicalProductionHost, setSessionStorageValue } from './calculator-analytics.mjs'

const eventSet = new Set(FIRST_PARTY_FUNNEL_EVENTS)
const SESSION_KEY = 'fastrack:first-party-funnel-session:v1'
const ONCE_PREFIX = 'fastrack:first-party-funnel-event:v1:'
const pending = new Map()
const tokens = new Map()
const memorySessions = new WeakMap()
let memorySession

function sessionId(storage, randomUUID) {
  const existing = getSessionStorageValue(storage, SESSION_KEY)
  if (existing) return existing
  if (storage && typeof storage === 'object' && memorySessions.has(storage)) return memorySessions.get(storage)
  if (!storage && memorySession) return memorySession
  try {
    const created = randomUUID()
    if (typeof created !== 'string') return null
    setSessionStorageValue(storage, SESSION_KEY, created)
    if (storage && typeof storage === 'object') memorySessions.set(storage, created)
    else memorySession = created
    return created
  } catch {
    return null
  }
}

export function emitFirstPartyFunnelEvent({ hostname, search, event, storage, fetcher, browserCrypto }) {
  if (!isCanonicalProductionHost(hostname) || !eventSet.has(event) || typeof fetcher !== 'function') return
  const attribution = firstPartyAttributionFromSearch(search)
  if (!attribution) return
  const session = sessionId(storage, () => browserCrypto?.randomUUID?.())
  if (!session) return
  const onceKey = `${ONCE_PREFIX}${event}`
  if (getSessionStorageValue(storage, onceKey) === '1') return
  const pendingKey = `${session}:${event}`
  if (pending.has(pendingKey)) return

  const request = (async () => {
    let token = tokens.get(session)
    if (!token) {
      const sessionResponse = await fetcher('/api/analytics/funnel-session', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session, qa: new URLSearchParams(search).get('fixture') === '1' }),
        keepalive: true,
      })
      if (!sessionResponse?.ok) return
      const sessionBody = await sessionResponse.json()
      if (typeof sessionBody?.token !== 'string') return
      token = sessionBody.token
      tokens.set(session, token)
    }
    const response = await fetcher('/api/analytics/funnel-event', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-fastrack-funnel-token': token },
      body: JSON.stringify({ event, session, attribution }),
      keepalive: true,
    })
    if (response?.ok) setSessionStorageValue(storage, onceKey, '1')
  })().catch(() => {
    // First-party measurement must never affect calculator behavior.
  }).finally(() => pending.delete(pendingKey))
  pending.set(pendingKey, request)
}
