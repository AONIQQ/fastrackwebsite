import { sql } from './db'
import { publicRolloutStatus } from './rollout-controls.mjs'
import { classifyFunnelHealth, FUNNEL_HEALTH_THRESHOLDS } from './funnel-health-classifier.mjs'
import { PROVIDER_PAYMENT_TOTALS_SQL } from './payment-reporting.mjs'

export type { HealthLevel } from './funnel-health-classifier.mjs'

export const STRIPE_WEBHOOK_CONTRACT = Object.freeze({
  registration_status: 'VERIFIED_SNAPSHOT' as const,
  last_verified_at: '2026-08-13T17:00:00.000Z',
  required_event_types: Object.freeze([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'charge.refunded',
    'charge.dispute.created',
    'charge.dispute.closed',
  ]),
})

export const WHOP_WEBHOOK_CONTRACT = Object.freeze({
  registration_status: 'PENDING_RUNTIME_PROOF' as const,
  last_verified_at: null,
  required_event_types: Object.freeze([
    'payment.succeeded', 'payment.failed', 'refund.created', 'refund.updated', 'dispute.created', 'dispute.updated',
  ]),
})

type QueueRow = {
  kind: 'results' | 'nurture'
  status: string
  dispatch_eligible: boolean
  eligibility: 'due' | 'scheduled' | 'leased' | 'terminal'
  age_bucket: '<15m' | '15m-2h' | '2h-24h' | '1d-7d' | '7d+'
  count: number
}

export type FunnelHealthReport = Awaited<ReturnType<typeof funnelHealthReport>>

const ageHours = (value: string | null, now: Date) => value
  ? Math.max(0, (now.getTime() - new Date(value).getTime()) / 3_600_000)
  : null

export function assertFunnelHealthReport<T>(report: T): T {
  const serialized = JSON.stringify(report)
  if (/@|"(?:email|phone|recipient|subject|body|payload|provider_message_id|provider_event_id|tracking_id|claim_token|capture_id|lead_id)"\s*:/i.test(serialized)) {
    throw new Error('funnel_health_contains_disallowed_detail')
  }
  return report
}

export async function funnelHealthReport(now = new Date()) {
  const rollout = publicRolloutStatus()
  const [queueRows, leaseRows, runRows, deliveryRows, captureRows, messageRows, salesRows, whopSalesRows, whopRows] = await Promise.all([
    sql`
      select kind, status, coalesce(rollout_dispatch_eligible, true) as dispatch_eligible,
        case
          when status = 'claimed' then 'leased'
          when status in ('accepted', 'terminal') then 'terminal'
          when next_attempt_at <= now() then 'due'
          else 'scheduled'
        end as eligibility,
        case
          when now() - coalesce(next_attempt_at, created_at) < interval '15 minutes' then '<15m'
          when now() - coalesce(next_attempt_at, created_at) < interval '2 hours' then '15m-2h'
          when now() - coalesce(next_attempt_at, created_at) < interval '24 hours' then '2h-24h'
          when now() - coalesce(next_attempt_at, created_at) < interval '7 days' then '1d-7d'
          else '7d+'
        end as age_bucket,
        count(*)::int as count
      from email_messages
      where is_fixture = false
      group by kind, status, coalesce(rollout_dispatch_eligible, true), eligibility, age_bucket
      order by kind, status, dispatch_eligible, eligibility, age_bucket
    `,
    sql`
      select
        count(*) filter (where claim_expires_at > now())::int as active,
        count(*) filter (where claim_expires_at <= now())::int as expired
      from email_messages where is_fixture = false and status = 'claimed'
    `,
    sql`
      select
        (select row_to_json(run) from (
          select started_at, completed_at, failure_category, considered, claimed, accepted, retried, failed, backlog
          from nurture_runs order by started_at desc limit 1
        ) run) as latest,
        (select row_to_json(run) from (
          select started_at, completed_at, failure_category, considered, claimed, accepted, retried, failed, backlog
          from nurture_runs where completed_at is not null and failure_category is null and failed = 0
          order by started_at desc limit 1
        ) run) as latest_successful,
        (select row_to_json(run) from (
          select started_at, completed_at, failure_category, considered, claimed, accepted, retried, failed, backlog
          from nurture_runs where failure_category is not null or failed > 0
          order by started_at desc limit 1
        ) run) as latest_failed
    `,
    sql`
      with ranked as (
        select event.email_message_id, event.event_type, event.provider_created_at,
          case event.event_type when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
            when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
            when 'complained' then 50 else 0 end as event_rank
        from email_provider_events event where event.email_message_id is not null
      )
      select
        (select count(*)::int from email_provider_events) as stored,
        (select count(*)::int from email_provider_events where email_message_id is null) as unmatched,
        (select count(*)::int from email_provider_events where email_message_id is null
          and received_at >= now() - interval '24 hours') as unmatched_24h,
        (select count(*)::int from email_provider_events where email_message_id is not null and is_fixture = false
          and received_at >= now() - interval '7 days' and event_type = 'failed') as failed_7d,
        (select count(*)::int from email_provider_events where email_message_id is not null and is_fixture = false
          and received_at >= now() - interval '7 days' and event_type = 'bounced') as bounced_7d,
        (select count(*)::int from email_provider_events where email_message_id is not null and is_fixture = false
          and received_at >= now() - interval '7 days' and event_type = 'complained') as complained_7d,
        count(*) filter (where message.id is not null and (
          message.provider_delivery_state is null or ranked.event_rank > case message.provider_delivery_state
            when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
            when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
            when 'complained' then 50 else 0 end
          or (ranked.event_rank = case message.provider_delivery_state
            when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
            when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
            when 'complained' then 50 else 0 end and ranked.provider_created_at > message.provider_state_at)
        ))::int as projection_pending
      from ranked left join email_messages message on message.id = ranked.email_message_id
    `,
    sql`
      select event_type, reason_code, sum(event_count)::int as count
      from capture_reporting_buckets
      where bucket_start >= date_trunc('hour', now() - interval '24 hours')
      group by event_type, reason_code order by event_type, reason_code
    `,
    sql`
      select kind,
        count(*) filter (where status = 'retryable')::int as retryable,
        count(*) filter (where status = 'terminal' and failure_category is not null)::int as terminal_failed,
        count(*) filter (where status in ('pending','retryable') and coalesce(rollout_dispatch_eligible,true)
          and next_attempt_at <= now())::int as due,
        min(next_attempt_at) filter (where status in ('pending','retryable')
          and coalesce(rollout_dispatch_eligible,true) and next_attempt_at <= now()) as oldest_due_at
      from email_messages where is_fixture = false group by kind order by kind
    `,
    sql.query(PROVIDER_PAYMENT_TOTALS_SQL, ['stripe']),
    sql.query(PROVIDER_PAYMENT_TOTALS_SQL, ['whop']),
    sql`
      select count(*)::int as stored,
        count(*) filter (where outcome='unmatched')::int as unmatched,
        count(*) filter (where received_at>=now()-interval '24 hours')::int as received_24h,
        count(*) filter (where outcome='received')::int as projection_pending
      from payment_provider_events where provider='whop' and is_fixture=false
    `,
  ])

  const queues = queueRows as QueueRow[]
  const leases = (leaseRows as { active: number; expired: number }[])[0] ?? { active: 0, expired: 0 }
  const runSummary = (runRows as Array<{
    latest: Record<string, number | string | null> | null
    latest_successful: Record<string, number | string | null> | null
    latest_failed: Record<string, number | string | null> | null
  }>)[0] ?? { latest: null, latest_successful: null, latest_failed: null }
  const delivery = (deliveryRows as Array<Record<string, number>>)[0] ?? {
    stored: 0, unmatched: 0, unmatched_24h: 0, failed_7d: 0, bounced_7d: 0, complained_7d: 0, projection_pending: 0,
  }
  const capture = captureRows as { event_type: string; reason_code: string; count: number }[]
  const messages = messageRows as { kind: 'results' | 'nurture'; retryable: number; terminal_failed: number; due: number; oldest_due_at: string | null }[]
  const sales = (salesRows as Array<Record<string, number>>)[0] ?? {
    paid_sales: 0, refunded_sales: 0, open_disputes: 0, lost_disputes: 0, gross_cents: 0, refunded_cents: 0, net_cents: 0,
  }
  const whopSales = (whopSalesRows as Array<Record<string, number>>)[0] ?? {
    paid_sales: 0, refunded_sales: 0, open_disputes: 0, lost_disputes: 0, gross_cents: 0, refunded_cents: 0, net_cents: 0,
  }
  const whopLedger = (whopRows as Array<Record<string, number>>)[0] ?? { stored: 0, unmatched: 0, received_24h: 0, projection_pending: 0 }
  const message = Object.fromEntries(messages.map((row) => [row.kind, row])) as Partial<Record<'results' | 'nurture', typeof messages[number]>>
  const captureCount = (event: string) => capture.filter((row) => row.event_type === event).reduce((sum, row) => sum + row.count, 0)
  const latestRun = runSummary.latest
  const latestSuccessfulRun = runSummary.latest_successful
  const controlsReady = rollout.configuration_status === 'valid'
    && rollout.dependency_status === 'valid'
    && Object.values(rollout.controls).every((control) => control.enabled && control.effective && control.configuration === 'valid')
  const classification = classifyFunnelHealth({
    controlsReady,
    smsEnabled: process.env.CAPTURE_SMS_ENABLED === '1',
    smsConfigurationValid: ['0', '1'].includes(process.env.CAPTURE_SMS_ENABLED ?? ''),
    stripeSnapshotFresh: ageHours(STRIPE_WEBHOOK_CONTRACT.last_verified_at, now)! < 24 * 30,
    whopReady: String(WHOP_WEBHOOK_CONTRACT.registration_status) === 'VERIFIED_SNAPSHOT'
      && process.env.WHOP_RUNTIME_PROOF_MODE !== '1'
      && Number(whopLedger.projection_pending) === 0 && Number(whopLedger.unmatched) === 0,
    cronCompletedAt: typeof latestSuccessfulRun?.completed_at === 'string' ? latestSuccessfulRun.completed_at : null,
    cronFailed: Boolean(latestRun && (latestRun.failure_category || Number(latestRun.failed) > 0)),
    dueResultsOldestHours: ageHours(message.results?.oldest_due_at ?? null, now),
    dueNurtureOldestHours: ageHours(message.nurture?.oldest_due_at ?? null, now),
    expiredLeases: leases.expired,
    projectionBacklog: delivery.projection_pending,
    unmatchedCallbacks24h: delivery.unmatched_24h,
    persistenceUncertain24h: captureCount('persistence_unconfirmed'),
    attempts24h: captureCount('attempt'),
    accepted24h: captureCount('accepted'),
    deduplicated24h: captureCount('deduplicated'),
    rejected24h: captureCount('rejected'),
    resultsTerminalFailures: message.results?.terminal_failed ?? 0,
    nurtureTerminalFailures: message.nurture?.terminal_failed ?? 0,
    retryableMessages: (message.results?.retryable ?? 0) + (message.nurture?.retryable ?? 0),
    providerComplaints7d: delivery.complained_7d,
    providerFailures7d: delivery.failed_7d + delivery.bounced_7d,
  }, now)

  return assertFunnelHealthReport({
    generated_at: now.toISOString(),
    status: classification.overall,
    component_status: classification.components,
    thresholds: FUNNEL_HEALTH_THRESHOLDS,
    capture: {
      acknowledgement_effective: rollout.controls.captureAcknowledgement.effective,
      events_24h: capture,
      attempts_24h: captureCount('attempt'),
      accepted_24h: captureCount('accepted'),
      rejected_24h: captureCount('rejected'),
      persistence_uncertain_24h: captureCount('persistence_unconfirmed'),
      rejection_ratio_24h: classification.rejection_ratio_24h,
    },
    rollout,
    sms: { enabled: process.env.CAPTURE_SMS_ENABLED === '1', configuration: ['0', '1'].includes(process.env.CAPTURE_SMS_ENABLED ?? '') ? 'valid' : 'invalid' },
    nurture_cron: {
      schedule_utc: '0 15 * * *', freshness_hours: classification.cron_age_hours,
      latest: latestRun, latest_successful: runSummary.latest_successful, latest_failed: runSummary.latest_failed,
    },
    queues,
    leases,
    messages: {
      results: message.results ?? { retryable: 0, terminal_failed: 0, due: 0, oldest_due_at: null },
      nurture: message.nurture ?? { retryable: 0, terminal_failed: 0, due: 0, oldest_due_at: null },
    },
    resend: delivery,
    stripe: { webhook: STRIPE_WEBHOOK_CONTRACT, ledger: sales },
    whop: { webhook: { ...WHOP_WEBHOOK_CONTRACT, runtime_proof_mode: process.env.WHOP_RUNTIME_PROOF_MODE === '1' }, ledger: { ...whopLedger, ...whopSales },
      status: classification.components.whop_instrumentation === 'READY' ? 'INSTRUMENTED' : 'WARNING' },
  })
}
