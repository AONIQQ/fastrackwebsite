export const NURTURE_AGES = Object.freeze({ 1: 2, 2: 5, 3: 8, 4: 12 })

export function logicalMessageKey(leadId, kind, stage = null) {
  if (!Number.isInteger(leadId) || leadId <= 0) throw new Error('invalid lead id')
  if (kind === 'results' && stage == null) return `lead:${leadId}:results`
  if (kind === 'nurture' && NURTURE_AGES[stage]) return `lead:${leadId}:nurture:${stage}`
  throw new Error('invalid logical message')
}

export function providerIdempotencyKey(leadId, kind, stage = null) {
  return kind === 'results' ? `ft-lead-${leadId}-results` : `ft-lead-${leadId}-n${stage}`
}

export function nextDueStage(currentStage, ageDays, resultsStatus) {
  if (!['accepted', 'terminal'].includes(resultsStatus)) return null
  const next = currentStage + 1
  return NURTURE_AGES[next] != null && ageDays >= NURTURE_AGES[next] ? next : null
}

export function claimable(status, nowMs, nextAttemptMs, claimExpiresMs, unsubscribed = false) {
  if (unsubscribed) return false
  if (!['pending', 'retryable', 'claimed'].includes(status) || nextAttemptMs > nowMs) return false
  return status !== 'claimed' || claimExpiresMs <= nowMs
}

export function retryDelayMs(attemptCount) {
  return Math.min(6 * 60 * 60_000, 5 * 60_000 * (2 ** Math.min(attemptCount, 6)))
}
