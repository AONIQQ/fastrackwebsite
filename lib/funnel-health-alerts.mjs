import { createHash } from 'node:crypto'

const COUNT_BUCKETS = Object.freeze([1, 2, 5, 10, 25, 50, 100])

const countBucket = (value) => {
  const count = Math.max(0, Number(value) || 0)
  return COUNT_BUCKETS.find((boundary) => count <= boundary) ?? '100+'
}

const ageBucket = (hours) => {
  if (hours == null || !Number.isFinite(Number(hours))) return 'unknown'
  if (Number(hours) < 0.25) return '<15m'
  if (Number(hours) < 2) return '15m-2h'
  if (Number(hours) < 24) return '2h-24h'
  if (Number(hours) < 168) return '1d-7d'
  return '7d+'
}

const issue = (code, level, count, details = {}) => Object.freeze({
  code,
  level,
  count: Math.max(0, Number(count) || 0),
  ...details,
})

export function actionableFunnelIssues(report) {
  const issues = []
  const rollout = report.rollout ?? {}
  const controls = Object.values(rollout.controls ?? {})
  const invalidControls = controls.filter((control) => control.configuration !== 'valid').length
  const ineffectiveControls = controls.filter((control) => control.configuration === 'valid' && !control.effective).length
  const dependencyWarnings = Array.isArray(rollout.dependency_warnings) ? rollout.dependency_warnings.length : 0

  if (invalidControls > 0) issues.push(issue('CONTROLS_INVALID', 'CRITICAL', invalidControls))
  if (dependencyWarnings > 0 || rollout.dependency_status === 'invalid') {
    issues.push(issue('DEPENDENCIES_INVALID', 'CRITICAL', Math.max(1, dependencyWarnings)))
  }
  if (ineffectiveControls > 0) issues.push(issue('CONTROLS_INEFFECTIVE', 'CRITICAL', ineffectiveControls))

  const persistenceUncertain = Number(report.capture?.persistence_uncertain_24h ?? 0)
  if (persistenceUncertain > 0) issues.push(issue('CAPTURE_PERSISTENCE_UNCERTAIN', 'CRITICAL', persistenceUncertain))

  const cron = report.nurture_cron ?? {}
  const latest = cron.latest ?? null
  const cronFailed = Boolean(latest && (latest.failure_category || Number(latest.failed) > 0))
  if (cronFailed) issues.push(issue('NURTURE_CRON_FAILED', 'CRITICAL', Math.max(1, Number(latest.failed) || 0)))
  const cronAge = cron.freshness_hours == null ? null : Number(cron.freshness_hours)
  const cronLevel = report.component_status?.cron
  if (!cronFailed && (cronLevel === 'WARNING' || cronLevel === 'CRITICAL')) {
    issues.push(issue('NURTURE_CRON_STALE', cronLevel, 1, { age_hours: cronAge }))
  }

  for (const [kind, warningHours] of [['results', 0.25], ['nurture', 26]]) {
    const message = report.messages?.[kind] ?? {}
    const due = Number(message.due ?? 0)
    const oldest = message.oldest_due_at ? Math.max(0, (Date.parse(report.generated_at) - Date.parse(message.oldest_due_at)) / 3_600_000) : null
    if (due > 0 && oldest != null && oldest >= warningHours) {
      const level = kind === 'results' && oldest >= 2 ? 'CRITICAL' : 'WARNING'
      issues.push(issue(kind === 'results' ? 'RESULTS_WORK_OLD' : 'NURTURE_WORK_OLD', level, due, { age_hours: oldest }))
    }
  }

  const expiredLeases = Number(report.leases?.expired ?? 0)
  if (expiredLeases > 0) issues.push(issue('MESSAGE_LEASE_EXPIRED', 'CRITICAL', expiredLeases))
  const projectionBacklog = Number(report.resend?.projection_pending ?? 0)
  if (projectionBacklog > 0) issues.push(issue('RESEND_PROJECTION_BACKLOG', 'CRITICAL', projectionBacklog))

  const resultsRetryable = Number(report.messages?.results?.retryable ?? 0)
  const nurtureRetryable = Number(report.messages?.nurture?.retryable ?? 0)
  const resultsTerminal = Number(report.messages?.results?.terminal_failed ?? 0)
  const nurtureTerminal = Number(report.messages?.nurture?.terminal_failed ?? 0)
  if (resultsRetryable + nurtureRetryable > 0) issues.push(issue('MESSAGE_RETRYABLE', 'WARNING', resultsRetryable + nurtureRetryable))
  if (resultsTerminal > 0) issues.push(issue('RESULTS_MESSAGE_TERMINAL', 'CRITICAL', resultsTerminal))
  if (nurtureTerminal > 0) issues.push(issue('NURTURE_MESSAGE_TERMINAL', 'WARNING', nurtureTerminal))

  const providerFailures = Number(report.resend?.failed_7d ?? 0) + Number(report.resend?.bounced_7d ?? 0)
  const providerComplaints = Number(report.resend?.complained_7d ?? 0)
  if (providerFailures > 0) issues.push(issue('ORDINARY_PROVIDER_FAILURE', 'WARNING', providerFailures))
  if (providerComplaints > 0) issues.push(issue('ORDINARY_PROVIDER_COMPLAINT', 'CRITICAL', providerComplaints))

  const liveStripeStatus = report.stripe_live_registration_status
  if (liveStripeStatus === 'INVALID') {
    issues.push(issue('STRIPE_REGISTRATION_INVALID', 'CRITICAL', 1, { status: 'INVALID' }))
  } else if (liveStripeStatus === 'UNVERIFIED' || report.component_status?.stripe_registration !== 'READY') {
    issues.push(issue('STRIPE_REGISTRATION_STALE', 'WARNING', 1, { status: 'UNVERIFIED_OR_STALE' }))
  }

  // Intentionally excluded: Whop PENDING_RUNTIME_PROOF, unmatched/unlinked
  // callbacks, SMS-off warnings, capture rejection ratios, fixtures, and imports.
  return Object.freeze(issues.sort((a, b) => a.code.localeCompare(b.code)))
}

export function issueFingerprint(issues) {
  if (!issues.length) return null
  const stable = issues.map((item) => [
    item.code,
    item.level,
    countBucket(item.count),
    'age_hours' in item ? ageBucket(item.age_hours) : null,
    item.status ?? null,
  ])
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex')
}

const LABELS = Object.freeze({
  CONTROLS_INVALID: 'Invalid funnel controls',
  DEPENDENCIES_INVALID: 'Invalid control dependencies',
  CONTROLS_INEFFECTIVE: 'Ineffective funnel controls',
  CAPTURE_PERSISTENCE_UNCERTAIN: 'Capture persistence uncertain',
  NURTURE_CRON_FAILED: 'Nurture cron failed',
  NURTURE_CRON_STALE: 'Nurture cron stale',
  RESULTS_WORK_OLD: 'Old due results work',
  NURTURE_WORK_OLD: 'Old due nurture work',
  MESSAGE_LEASE_EXPIRED: 'Expired message lease',
  RESEND_PROJECTION_BACKLOG: 'Resend projection backlog',
  MESSAGE_RETRYABLE: 'Retryable ordinary message',
  RESULTS_MESSAGE_TERMINAL: 'Terminal results message',
  NURTURE_MESSAGE_TERMINAL: 'Terminal nurture message',
  ORDINARY_PROVIDER_FAILURE: 'Ordinary provider failure or bounce',
  ORDINARY_PROVIDER_COMPLAINT: 'Ordinary provider complaint',
  STRIPE_REGISTRATION_INVALID: 'Stripe registration invalid',
  STRIPE_REGISTRATION_STALE: 'Stripe registration stale or unverified',
})

export function buildOwnerAlert(kind, issues, generatedAt) {
  if (kind === 'recovery') {
    return Object.freeze({
      subject: '[Fastrack] Customer funnel recovered',
      text: `Customer funnel alert recovered.\nChecked: ${generatedAt}\nAction: No current actionable issue remains.`,
    })
  }
  const level = issues.some((item) => item.level === 'CRITICAL') ? 'CRITICAL' : 'WARNING'
  const lines = issues.map((item) => {
    const fields = [`count=${item.count}`, `status=${item.level}`]
    if ('age_hours' in item) fields.push(`age_hours=${item.age_hours == null ? 'unknown' : Number(item.age_hours).toFixed(1)}`)
    if (item.status) fields.push(`registration=${item.status}`)
    return `${LABELS[item.code]}: ${fields.join(', ')}`
  })
  return Object.freeze({
    subject: `[Fastrack] Customer funnel ${level}: ${issues.length} actionable issue${issues.length === 1 ? '' : 's'}`,
    text: [`Customer funnel action required.`, `Checked: ${generatedAt}`, ...lines, 'Action: Open the authenticated funnel health panel and restore the affected path.'].join('\n'),
  })
}

export function assertOwnerAlertPrivacy(message) {
  const serialized = JSON.stringify(message)
  if (/@|\b(?:email|phone|recipient|payload|provider_message_id|provider_event_id|tracking_id|claim_token|capture_id|lead_id|error)\b/i.test(serialized)) {
    throw new Error('owner_alert_contains_disallowed_detail')
  }
  return message
}

export async function runFunnelHealthAlert({ report, claim, send, complete, release }) {
  const health = await report()
  const issues = actionableFunnelIssues(health)
  const fingerprint = issueFingerprint(issues)
  const messages = {
    alert: assertOwnerAlertPrivacy(buildOwnerAlert('alert', issues, health.generated_at)),
    recovery: assertOwnerAlertPrivacy(buildOwnerAlert('recovery', [], health.generated_at)),
  }
  const claimed = await claim(fingerprint, messages)
  if (!claimed) return Object.freeze({ ok: true, sent: false, actionable: issues.length })

  const message = assertOwnerAlertPrivacy(claimed.message)
  try {
    await send({ ...message, idempotencyKey: claimed.idempotencyKey })
  } catch {
    await release(claimed.token)
    return Object.freeze({ ok: false, sent: false, actionable: issues.length, failure: 'provider_rejected' })
  }
  await complete(claimed.token)
  return Object.freeze({ ok: true, sent: true, kind: claimed.kind, actionable: issues.length })
}
