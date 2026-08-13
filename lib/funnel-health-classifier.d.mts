export type HealthLevel = 'READY' | 'WARNING' | 'CRITICAL'
export const FUNNEL_HEALTH_THRESHOLDS: Readonly<{
  cronWarningHours: number; cronCriticalHours: number
  resultsDueWarningMinutes: number; resultsDueCriticalMinutes: number
  nurtureDueWarningHours: number; projectionBacklogCritical: number
  persistenceUncertainCritical: number; captureRejectionMinimumAttempts: number
  captureRejectionWarningRatio: number
}>
export function classifyFunnelHealth(input: {
  controlsReady: boolean; smsEnabled: boolean; smsConfigurationValid: boolean
  stripeSnapshotFresh: boolean; cronCompletedAt: string | null; cronFailed: boolean
  dueResultsOldestHours: number | null; dueNurtureOldestHours: number | null; expiredLeases: number
  projectionBacklog: number; unmatchedCallbacks24h: number
  persistenceUncertain24h: number; attempts24h: number; accepted24h: number
  deduplicated24h: number; rejected24h: number
  resultsTerminalFailures: number; nurtureTerminalFailures: number; retryableMessages: number
  providerComplaints7d: number; providerFailures7d: number
}, now?: Date): Readonly<{
  overall: HealthLevel; components: Record<string, HealthLevel>
  cron_age_hours: number | null; rejection_ratio_24h: number
}>
