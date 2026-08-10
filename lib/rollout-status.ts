import { sql } from './db'
import { publicRolloutStatus } from './rollout-controls.mjs'

export function assertRolloutOperationsReport(report: unknown) {
  const serialized = JSON.stringify(report)
  if (/@|email|phone|recipient|subject|body|payload|provider_message_id|provider_event_id|tracking_id|claim_token/i.test(serialized)) {
    throw new Error('rollout_report_contains_disallowed_detail')
  }
  return report
}

export async function rolloutOperationsReport() {
  const [rawQueues, rawLeases, rawShadow, rawDelivery] = await Promise.all([
    sql`
      select kind, status, coalesce(rollout_dispatch_eligible, true) as dispatch_eligible,
        count(*)::int as count
      from email_messages
      group by kind, status, coalesce(rollout_dispatch_eligible, true)
      order by kind, status, dispatch_eligible
    `,
    sql`
      select kind,
        case when claim_expires_at <= now() then 'expired' else 'active' end as lease_state,
        count(*)::int as count
      from email_messages
      where status = 'claimed'
      group by kind, lease_state order by kind, lease_state
    `,
    sql`
      select
        count(*) filter (where message.id is not null)::int as recorded,
        count(*) filter (where message.id is null)::int as missing,
        count(*) filter (where lead_row.is_fixture and message.id is null)::int as fixture_missing,
        count(*) filter (where lead_row.is_fixture and message.id is not null
          and not coalesce(message.rollout_dispatch_eligible, true))::int as fixture_ineligible,
        count(*) filter (where lead_row.is_fixture and message.id is not null
          and coalesce(message.rollout_dispatch_eligible, true))::int as fixture_eligible,
        count(*) filter (where not lead_row.is_fixture and message.id is null)::int as genuine_missing,
        count(*) filter (where not lead_row.is_fixture and message.id is not null
          and not coalesce(message.rollout_dispatch_eligible, true))::int as genuine_ineligible,
        count(*) filter (where not lead_row.is_fixture and message.id is not null
          and coalesce(message.rollout_dispatch_eligible, true))::int as genuine_eligible,
        count(*)::int as total
      from leads lead_row
      left join email_messages message on message.lead_id = lead_row.id and message.kind = 'results'
      where lead_row.capture_id is not null and lead_row.created_at >= now() - interval '30 days'
    `,
    sql`
      with ranked as (
        select event.email_message_id, event.event_type, event.provider_created_at,
          case event.event_type
            when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
            when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
            when 'complained' then 50 else 0 end as event_rank
        from email_provider_events event
        where event.email_message_id is not null
      )
      select
        (select count(*)::int from email_provider_events) as stored,
        (select count(*)::int from email_provider_events where email_message_id is null) as unmatched,
        count(*) filter (where message.id is not null and (
          message.provider_delivery_state is null
          or ranked.event_rank > case message.provider_delivery_state
            when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
            when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
            when 'complained' then 50 else 0 end
          or (ranked.event_rank = case message.provider_delivery_state
            when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
            when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
            when 'complained' then 50 else 0 end
            and ranked.provider_created_at > message.provider_state_at)
        ))::int as projection_pending
      from ranked left join email_messages message on message.id = ranked.email_message_id
    `,
  ])
  const queues = rawQueues as { kind: string; status: string; dispatch_eligible: boolean; count: number }[]
  const leases = rawLeases as { kind: string; lease_state: 'active' | 'expired'; count: number }[]
  const shadow = rawShadow as {
    recorded: number; missing: number; total: number
    fixture_missing: number; fixture_ineligible: number; fixture_eligible: number
    genuine_missing: number; genuine_ineligible: number; genuine_eligible: number
  }[]
  const delivery = rawDelivery as { stored: number; unmatched: number; projection_pending: number }[]
  return assertRolloutOperationsReport({
    ...publicRolloutStatus(),
    shadow_ledger_30d: shadow[0] ?? { recorded: 0, missing: 0, total: 0 },
    queues,
    leases,
    delivery_projection: delivery[0] ?? { stored: 0, unmatched: 0, projection_pending: 0 },
  })
}
