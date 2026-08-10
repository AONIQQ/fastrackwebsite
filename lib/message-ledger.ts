import { randomUUID } from 'node:crypto'
import { sql } from './db'
import { sendResultsEmail } from './mail'
import { NURTURE_STEPS, sendNurtureStep } from './nurture'

type Message = {
  id: number
  lead_id: number
  kind: 'results' | 'nurture'
  nurture_stage: number | null
  provider_idempotency_key: string
  claim_token: string
  attempt_count: number
  email: string
  college: string | null
  residency: string | null
  snapshot: {
    annualCost?: number
    standard?: { totalCost?: number; recoupLabel?: string }
    fastrack?: { totalCost?: number; recoupLabel?: string }
    savings?: number
    earlyEarnings?: number | null
    totalAdvantage?: number | null
    yearsSaved?: number
  }
}

const failureCategory = (error: unknown) => {
  const text = String((error as Error)?.message || error).toLowerCase()
  if (text.includes('rate') || text.includes('429')) return 'provider_rate_limit'
  if (text.includes('timeout') || text.includes('network') || text.includes('fetch')) return 'provider_transient'
  if (text.includes('not configured')) return 'configuration'
  return 'provider_rejected'
}

export async function claimMessageByLead(leadId: number, kind: 'results' | 'nurture' = 'results') {
  const token = randomUUID()
  const rows = (await sql`
    with candidate as (
      select m.id from email_messages m join leads l on l.id = m.lead_id
      where m.lead_id = ${leadId} and m.kind = ${kind}
        and m.status in ('pending', 'retryable', 'claimed')
        and m.next_attempt_at <= now()
        and (m.status <> 'claimed' or m.claim_expires_at <= now())
        and l.unsubscribed_at is null
      order by m.id limit 1 for update of m skip locked
    ), claimed as (
      update email_messages m set
        status = 'claimed', claim_token = ${token}::uuid,
        claim_expires_at = now() + interval '10 minutes',
        attempt_count = attempt_count + 1, updated_at = now()
      from candidate where m.id = candidate.id
      returning m.*
    )
    select claimed.id, claimed.lead_id, claimed.kind, claimed.nurture_stage,
      claimed.provider_idempotency_key, claimed.claim_token, claimed.attempt_count,
      leads.email, leads.college, leads.residency, leads.snapshot
    from claimed join leads on leads.id = claimed.lead_id
  `) as Message[]
  return rows[0] ?? null
}

export async function claimNextMessage() {
  const token = randomUUID()
  const rows = (await sql`
    with candidate as (
      select m.id from email_messages m
      join leads l on l.id = m.lead_id
      where m.status in ('pending', 'retryable', 'claimed')
        and m.next_attempt_at <= now()
        and (m.status <> 'claimed' or m.claim_expires_at <= now())
        and l.unsubscribed_at is null
      order by case when m.kind = 'results' then 0 else 1 end, m.next_attempt_at, m.id
      limit 1 for update of m skip locked
    ), claimed as (
      update email_messages m set
        status = 'claimed', claim_token = ${token}::uuid,
        claim_expires_at = now() + interval '10 minutes',
        attempt_count = attempt_count + 1, updated_at = now()
      from candidate where m.id = candidate.id returning m.*
    )
    select claimed.id, claimed.lead_id, claimed.kind, claimed.nurture_stage,
      claimed.provider_idempotency_key, claimed.claim_token, claimed.attempt_count,
      leads.email, leads.college, leads.residency, leads.snapshot
    from claimed join leads on leads.id = claimed.lead_id
  `) as Message[]
  return rows[0] ?? null
}

export async function dispatchClaimedMessage(message: Message) {
  try {
    const receipt = message.kind === 'results'
      ? await sendResultsEmail({
          to: message.email,
          collegeName: message.college || 'your selected college',
          residency: message.residency || 'in-state',
          annualCost: Number(message.snapshot?.annualCost || 0),
          standardTotal: Number(message.snapshot?.standard?.totalCost || 0),
          standardRecoup: String(message.snapshot?.standard?.recoupLabel || ''),
          fastrackTotal: Number(message.snapshot?.fastrack?.totalCost || 0),
          fastrackRecoup: String(message.snapshot?.fastrack?.recoupLabel || ''),
          savings: Number(message.snapshot?.savings || 0),
          earlyEarnings: message.snapshot?.earlyEarnings == null ? null : Number(message.snapshot.earlyEarnings),
          totalAdvantage: message.snapshot?.totalAdvantage == null ? null : Number(message.snapshot.totalAdvantage),
          yearsSaved: Number(message.snapshot?.yearsSaved || 2),
          leadId: message.lead_id,
          providerIdempotencyKey: message.provider_idempotency_key,
        })
      : await sendNurtureStep(
          message.email,
          NURTURE_STEPS.find((step) => step.stage === message.nurture_stage)!,
          message.lead_id,
          message.provider_idempotency_key,
        )

    const updated = (await sql`
      with accepted as (
        update email_messages set status = 'accepted', provider = ${receipt.provider},
          provider_message_id = ${receipt.messageId}, accepted_at = coalesce(accepted_at, now()),
          claim_token = null, claim_expires_at = null, failure_category = null, updated_at = now()
        where id = ${message.id} and claim_token = ${message.claim_token}::uuid and status = 'claimed'
        returning lead_id
      ), projected as (
        update leads set
          results_email_sent_at = case when ${message.kind} = 'results' then coalesce(results_email_sent_at, now()) else results_email_sent_at end,
          nurture_stage = case when ${message.kind} = 'nurture' then greatest(nurture_stage, ${message.nurture_stage}) else nurture_stage end,
          nurture_last_at = case when ${message.kind} = 'nurture' then now() else nurture_last_at end
        where id in (select lead_id from accepted)
        returning id
      ) select id from projected
    `) as { id: number }[]
    if (!updated.length) throw new Error('message claim was lost before acceptance')
    return 'accepted' as const
  } catch (error) {
    await sql`
      update email_messages set status = 'retryable', claim_token = null, claim_expires_at = null,
        next_attempt_at = now() + least(interval '6 hours', interval '5 minutes' * power(2, least(attempt_count, 6))),
        failure_category = ${failureCategory(error)}, updated_at = now()
      where id = ${message.id} and claim_token = ${message.claim_token}::uuid and status = 'claimed'
    `
    throw error
  }
}

export async function processResultMessage(leadId: number) {
  const message = await claimMessageByLead(leadId)
  return message ? dispatchClaimedMessage(message) : null
}

export async function enqueueDueNurture() {
  const rows = (await sql`
    with eligible as (
      select l.id as lead_id, l.nurture_stage + 1 as stage, l.is_fixture
      from leads l
      where l.created_at >= '2026-08-06'
        and l.nurture_stage < 4 and l.unsubscribed_at is null
        and exists (
          select 1 from email_messages r
          where r.lead_id = l.id and r.kind = 'results' and r.status in ('accepted', 'terminal')
        )
        and extract(epoch from (now() - l.created_at)) / 86400 >=
          case l.nurture_stage + 1 when 1 then 2 when 2 then 5 when 3 then 8 when 4 then 12 end
    ), inserted as (
      insert into email_messages (
        lead_id, kind, nurture_stage, logical_key, provider_idempotency_key, is_fixture
      ) select lead_id, 'nurture', stage, 'lead:' || lead_id || ':nurture:' || stage,
        'ft-lead-' || lead_id || '-n' || stage, coalesce(is_fixture, false)
      from eligible on conflict (logical_key) do nothing returning id
    ) select count(*)::int as inserted from inserted
  `) as { inserted: number }[]
  return rows[0]?.inserted ?? 0
}

export async function messageBacklog() {
  const rows = (await sql`
    select count(*)::int as count from email_messages m join leads l on l.id = m.lead_id
    where m.status in ('pending', 'retryable', 'claimed') and l.unsubscribed_at is null
  `) as { count: number }[]
  return rows[0]?.count ?? 0
}
