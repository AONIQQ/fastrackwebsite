import { randomUUID } from 'node:crypto'
import { sql } from './db'

export type FunnelAlertClaim = {
  token: string
  kind: 'alert' | 'recovery'
  idempotencyKey: string
  message: { subject: string; text: string }
}

const SCOPE = 'owner'
const LOCK_KEY = 'fastrack:funnel-health-owner-alert'

export async function claimFunnelHealthAlert(fingerprint: string | null, messages: {
  alert: { subject: string; text: string }
  recovery: { subject: string; text: string }
}): Promise<FunnelAlertClaim | null> {
  const token = randomUUID()
  const database = sql
  if (typeof database.transaction !== 'function') throw new Error('funnel alert transaction unavailable')
  const [, , claimed] = await database.transaction((txn) => [
    txn`select pg_advisory_xact_lock(hashtext(${LOCK_KEY}))`,
    txn`insert into funnel_health_alert_state (scope) values (${SCOPE}) on conflict (scope) do nothing`,
    txn`
      with current_state as (
        select *,
          case
            when pending_kind is not null then pending_kind
            when ${fingerprint}::text is null and alerted_fingerprint is null then null
            when ${fingerprint}::text is null then 'recovery'
            when alerted_fingerprint = ${fingerprint}::text then null
            else 'alert'
          end as desired_kind,
          case
            when pending_kind is not null then pending_fingerprint
            when ${fingerprint}::text is null and alerted_fingerprint is not null then alerted_fingerprint
            else ${fingerprint}::text
          end as desired_fingerprint
          ,case
            when pending_kind is not null then pending_message
            when ${fingerprint}::text is null and alerted_fingerprint is not null then ${JSON.stringify(messages.recovery)}::jsonb
            when ${fingerprint}::text is not null and alerted_fingerprint is distinct from ${fingerprint}::text then ${JSON.stringify(messages.alert)}::jsonb
            else null
          end as desired_message
        from funnel_health_alert_state where scope = ${SCOPE}
        for update
      ), prepared as (
        update funnel_health_alert_state state set
          pending_kind = current_state.desired_kind,
          pending_fingerprint = current_state.desired_fingerprint,
          pending_message = current_state.desired_message,
          transition_sequence = case
            when current_state.desired_kind is null then state.transition_sequence
            when state.pending_kind is not distinct from current_state.desired_kind
              and state.pending_fingerprint is not distinct from current_state.desired_fingerprint
              then state.transition_sequence
            else state.transition_sequence + 1
          end,
          claim_token = null,
          claim_expires_at = null,
          updated_at = now()
        from current_state
        where state.scope = current_state.scope
          and (state.claim_expires_at is null or state.claim_expires_at <= now())
        returning state.*
      ), leased as (
        update funnel_health_alert_state state set
          claim_token = ${token}::uuid,
          claim_expires_at = now() + interval '10 minutes',
          updated_at = now()
        from prepared
        where state.scope = prepared.scope and prepared.pending_kind is not null
        returning state.claim_token::text as token, state.pending_kind as kind,
          'funnel-health-' || state.transition_sequence::text || '-' || state.pending_kind || '-' || left(state.pending_fingerprint, 16) as idempotency_key,
          state.pending_message->>'subject' as subject, state.pending_message->>'text' as text
      )
      select token, kind, idempotency_key, subject, text from leased
    `,
  ]) as unknown as [unknown, unknown, Array<{ token: string; kind: 'alert' | 'recovery'; idempotency_key: string; subject: string; text: string }>]
  const row = claimed[0]
  return row ? { token: row.token, kind: row.kind, idempotencyKey: row.idempotency_key, message: { subject: row.subject, text: row.text } } : null
}

export async function completeFunnelHealthAlert(token: string) {
  const rows = await sql`
    update funnel_health_alert_state set
      alerted_fingerprint = case when pending_kind = 'alert' then pending_fingerprint else null end,
      pending_kind = null,
      pending_fingerprint = null,
      pending_message = null,
      claim_token = null,
      claim_expires_at = null,
      last_sent_at = now(),
      updated_at = now()
    where scope = ${SCOPE} and claim_token = ${token}::uuid and claim_expires_at > now()
    returning scope
  ` as { scope: string }[]
  if (rows.length !== 1) throw new Error('funnel_alert_claim_not_completed')
}

export async function releaseFunnelHealthAlert(token: string) {
  await sql`
    update funnel_health_alert_state set claim_token = null, claim_expires_at = null, updated_at = now()
    where scope = ${SCOPE} and claim_token = ${token}::uuid
  `
}
