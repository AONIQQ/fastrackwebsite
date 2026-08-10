import { sql } from './db'

export type NormalizedResendEvent = {
  providerEventId: string
  providerMessageId: string
  eventType: 'sent' | 'delivered' | 'delivery_delayed' | 'bounced' | 'complained' | 'suppressed' | 'failed'
  providerCreatedAt: Date
  failureCategory: string | null
}

export async function persistResendEvent(event: NormalizedResendEvent) {
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
      where message.id = inserted.email_message_id
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
