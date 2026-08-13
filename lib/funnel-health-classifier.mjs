export const FUNNEL_HEALTH_THRESHOLDS = Object.freeze({
  cronWarningHours: 25,
  cronCriticalHours: 36,
  resultsDueWarningMinutes: 15,
  resultsDueCriticalMinutes: 120,
  nurtureDueWarningHours: 26,
  projectionBacklogCritical: 1,
  persistenceUncertainCritical: 1,
  captureRejectionMinimumAttempts: 5,
  captureRejectionWarningRatio: 0.5,
})

const maxLevel = (levels) => levels.includes('CRITICAL') ? 'CRITICAL' : levels.includes('WARNING') ? 'WARNING' : 'READY'

const ageHours = (value, now) => value
  ? Math.max(0, (now.getTime() - new Date(value).getTime()) / 3_600_000)
  : null

export function classifyFunnelHealth(input, now = new Date()) {
  const components = {
    controls: input.controlsReady ? 'READY' : 'CRITICAL',
    sms: !input.smsConfigurationValid ? 'CRITICAL' : input.smsEnabled ? 'WARNING' : 'READY',
    cron: 'READY',
    queues: 'READY',
    leases: input.expiredLeases > 0 ? 'CRITICAL' : 'READY',
    resend_projection: input.projectionBacklog >= FUNNEL_HEALTH_THRESHOLDS.projectionBacklogCritical ? 'CRITICAL' : 'READY',
    resend_callbacks: input.unmatchedCallbacks24h > 0 ? 'WARNING' : 'READY',
    capture: 'READY',
    provider_delivery: input.providerComplaints7d > 0
      ? 'CRITICAL'
      : input.providerFailures7d > 0 ? 'WARNING' : 'READY',
    message_failures: input.resultsTerminalFailures > 0
      ? 'CRITICAL'
      : input.nurtureTerminalFailures > 0 || input.retryableMessages > 0 ? 'WARNING' : 'READY',
    whop_instrumentation: input.whopReady ? 'READY' : 'WARNING',
    stripe_registration: input.stripeSnapshotFresh ? 'READY' : 'WARNING',
  }

  const cronAge = ageHours(input.cronCompletedAt, now)
  components.cron = input.cronFailed || cronAge === null || cronAge >= FUNNEL_HEALTH_THRESHOLDS.cronCriticalHours
    ? 'CRITICAL'
    : cronAge >= FUNNEL_HEALTH_THRESHOLDS.cronWarningHours ? 'WARNING' : 'READY'

  if (input.dueResultsOldestHours !== null) {
    const minutes = input.dueResultsOldestHours * 60
    components.queues = minutes >= FUNNEL_HEALTH_THRESHOLDS.resultsDueCriticalMinutes
      ? 'CRITICAL'
      : minutes >= FUNNEL_HEALTH_THRESHOLDS.resultsDueWarningMinutes ? 'WARNING' : components.queues
  }
  if (input.dueNurtureOldestHours !== null && input.dueNurtureOldestHours >= FUNNEL_HEALTH_THRESHOLDS.nurtureDueWarningHours) {
    components.queues = maxLevel([components.queues, 'WARNING'])
  }

  const captureOutcomes = input.accepted24h + input.deduplicated24h + input.rejected24h + input.persistenceUncertain24h
  const rejectionRatio = captureOutcomes > 0 ? input.rejected24h / captureOutcomes : 0
  components.capture = input.persistenceUncertain24h >= FUNNEL_HEALTH_THRESHOLDS.persistenceUncertainCritical
    ? 'CRITICAL'
    : input.attempts24h >= FUNNEL_HEALTH_THRESHOLDS.captureRejectionMinimumAttempts
      && rejectionRatio >= FUNNEL_HEALTH_THRESHOLDS.captureRejectionWarningRatio ? 'WARNING' : 'READY'

  return Object.freeze({ overall: maxLevel(Object.values(components)), components, cron_age_hours: cronAge, rejection_ratio_24h: rejectionRatio })
}
