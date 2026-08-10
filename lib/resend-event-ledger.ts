import { sql } from './db'

export type NormalizedResendEvent = {
  providerEventId: string
  providerMessageId: string
  eventType: 'sent' | 'delivered' | 'delivery_delayed' | 'bounced' | 'complained' | 'suppressed' | 'failed'
  providerCreatedAt: Date
  failureCategory: string | null
}

export async function persistResendEvent(event: NormalizedResendEvent, options: { project?: boolean } = {}) {
  const project = options.project === true
  const rows = (await sql`
    with matched_message as (
      select id, is_fixture from email_messages
      where provider = 'resend' and provider_message_id = ${event.providerMessageId}
      limit 1
    ), inserted as (
      insert into email_provider_events (
        provider_event_id, email_message_id, provider_message_id, event_type,
        provider_created_at, failure_category, outcome, is_fixture
      ) select ${event.providerEventId}, matched_message.id, ${event.providerMessageId},
        ${event.eventType}, ${event.providerCreatedAt}, ${event.failureCategory},
        case when matched_message.id is null then 'unmatched' else 'matched' end,
        coalesce(matched_message.is_fixture, false)
      from (select 1) seed left join matched_message on true
      on conflict (provider_event_id) do nothing
      returning email_message_id, outcome
    ), projected as (
      update email_messages message set
        provider_delivery_state = ${event.eventType},
        provider_state_at = ${event.providerCreatedAt},
        provider_failure_category = ${event.failureCategory},
        updated_at = now()
      from inserted
      where ${project} and message.id = inserted.email_message_id
        and (
          message.provider_delivery_state is null
          or case ${event.eventType}
            when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
            when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
            when 'complained' then 50 else 0 end
          > case message.provider_delivery_state
            when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
            when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
            when 'complained' then 50 else 0 end
          or (
            case ${event.eventType}
              when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
              when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
              when 'complained' then 50 else 0 end
            = case message.provider_delivery_state
              when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
              when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
              when 'complained' then 50 else 0 end
            and ${event.providerCreatedAt} > message.provider_state_at
          )
        )
      returning message.id
    )
    select inserted.outcome, (select count(*)::int from projected) as projected
    from inserted
  `) as { outcome: 'matched' | 'unmatched'; projected: number }[]

  if (!rows.length) return { duplicate: true as const }
  return { duplicate: false as const, outcome: rows[0].outcome, projected: rows[0].projected > 0 }
}

export async function projectResendEventBacklog(limit = 500) {
  const boundedLimit = Math.max(1, Math.min(1000, Math.trunc(limit)))
  const rows = (await sql`
    with best_events as materialized (
      select distinct on (event.email_message_id)
        event.email_message_id, event.event_type, event.provider_created_at, event.failure_category
      from email_provider_events event
      where event.email_message_id is not null
      order by event.email_message_id,
        case event.event_type
          when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
          when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
          when 'complained' then 50 else 0 end desc,
        event.provider_created_at desc, event.provider_event_id desc
    ), candidate_events as materialized (
      select best.* from best_events best
      join email_messages message on message.id = best.email_message_id
      where message.provider_delivery_state is null
        or case best.event_type
          when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
          when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
          when 'complained' then 50 else 0 end
        > case message.provider_delivery_state
          when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
          when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
          when 'complained' then 50 else 0 end
        or (case best.event_type
          when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
          when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
          when 'complained' then 50 else 0 end
          = case message.provider_delivery_state
            when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
            when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
            when 'complained' then 50 else 0 end
          and best.provider_created_at > message.provider_state_at)
      order by best.email_message_id
      limit ${boundedLimit}
    ), projected as (
      update email_messages message set
        provider_delivery_state = best.event_type,
        provider_state_at = best.provider_created_at,
        provider_failure_category = best.failure_category,
        updated_at = now()
      from candidate_events best
      where message.id = best.email_message_id and (
        message.provider_delivery_state is null
        or case best.event_type
          when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
          when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
          when 'complained' then 50 else 0 end
        > case message.provider_delivery_state
          when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
          when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
          when 'complained' then 50 else 0 end
        or (case best.event_type
          when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
          when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
          when 'complained' then 50 else 0 end
          = case message.provider_delivery_state
            when 'sent' then 10 when 'delivery_delayed' then 20 when 'delivered' then 30
            when 'failed' then 40 when 'bounced' then 40 when 'suppressed' then 40
            when 'complained' then 50 else 0 end
          and best.provider_created_at > message.provider_state_at)
      ) returning 1
    ) select
      (select count(*)::int from candidate_events) as considered,
      (select count(*)::int from projected) as projected
  `) as { considered: number; projected: number }[]
  return rows[0] ?? { considered: 0, projected: 0 }
}

export async function emailDeliveryOperationsReport() {
  const [events, states] = await Promise.all([
    sql`
      select event_type, outcome, count(*)::int as count
      from email_provider_events
      where is_fixture = false and received_at >= now() - interval '30 days'
      group by event_type, outcome order by event_type, outcome
    `,
    sql`
      select coalesce(provider_delivery_state, 'no_event') as state, count(*)::int as count
      from email_messages where is_fixture = false
      group by coalesce(provider_delivery_state, 'no_event') order by state
    `,
  ])
  return { window_days: 30, events, message_states: states }
}
