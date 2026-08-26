import { randomUUID } from 'node:crypto'
import { sql } from './db'

export type CreditMapOwnerAlertClaim = {
  token: string
  idempotencyKey: string
  message: { subject: string; text: string }
}

const LOCK_KEY = 'fastrack:credit-map-owner-alert'

export async function claimCreditMapOwnerAlert(message: { subject: string; text: string }): Promise<CreditMapOwnerAlertClaim | null> {
  const token = randomUUID()
  if (typeof sql.transaction !== 'function') throw new Error('credit map owner alert transaction unavailable')
  const [, claimed] = await sql.transaction((txn) => [
    txn`select pg_advisory_xact_lock(hashtext(${LOCK_KEY}))`,
    txn`
      with candidate as (
        select notification.intake_id
        from credit_map_owner_notifications notification
        join credit_map_intakes intake on intake.id = notification.intake_id
        join sales sale on sale.id = intake.sale_id
        where notification.sent_at is null
          and (notification.status = 'pending'
            or (notification.status = 'claimed' and notification.claim_expires_at <= now()))
          and intake.status in ('submitted', 'in_progress', 'delivered')
          and intake.submitted_at is not null
          and sale.provider = 'stripe' and sale.paid_at is not null
          and sale.payment_state = 'paid'
          and coalesce(sale.is_fixture, false) = false
          and coalesce(sale.refunded_cents, 0) = 0
          and coalesce(sale.dispute_state, '') not in ('open', 'lost')
        order by notification.created_at, notification.intake_id
        limit 1
        for update of notification
      )
      update credit_map_owner_notifications notification set
        status = 'claimed',
        message_subject = coalesce(notification.message_subject, ${message.subject}),
        message_text = coalesce(notification.message_text, ${message.text}),
        claim_token = ${token}::uuid,
        claim_expires_at = now() + interval '10 minutes',
        attempt_count = notification.attempt_count + 1,
        last_attempt_at = now(),
        updated_at = now()
      from candidate
      where notification.intake_id = candidate.intake_id
      returning notification.claim_token::text as token,
        notification.provider_idempotency_key::text as idempotency_key,
        notification.message_subject as subject, notification.message_text as text
    `,
  ]) as unknown as [unknown, Array<{ token: string; idempotency_key: string; subject: string; text: string }>]
  const row = claimed[0]
  return row ? {
    token: row.token,
    idempotencyKey: row.idempotency_key,
    message: { subject: row.subject, text: row.text },
  } : null
}

export async function completeCreditMapOwnerAlert(token: string, providerMessageId: string) {
  const rows = await sql`
    update credit_map_owner_notifications set
      status = 'sent', provider_message_id = ${providerMessageId}, sent_at = now(),
      claim_token = null, claim_expires_at = null, updated_at = now()
    where claim_token = ${token}::uuid and status = 'claimed' and claim_expires_at > now()
    returning intake_id
  ` as { intake_id: number }[]
  if (rows.length !== 1) throw new Error('credit_map_owner_alert_claim_not_completed')
}

export async function releaseCreditMapOwnerAlert(token: string) {
  await sql`
    update credit_map_owner_notifications set
      status = 'pending', claim_token = null, claim_expires_at = null, updated_at = now()
    where claim_token = ${token}::uuid and status = 'claimed'
  `
}
