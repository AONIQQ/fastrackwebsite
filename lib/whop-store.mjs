import { sanitizeUtm } from './whop-ledger.mjs'

export const WHOP_PAYMENT_SQL = `
with incoming as (
  insert into payment_provider_events(
    provider,event_id,event_type,object_id,provider_payment_id,amount_cents,state,
    provider_created_at,lifecycle_at,outcome,applied_at,is_fixture
  ) values('whop',$1,$2,$3,$4,$5,'paid',$6::timestamptz,$7::timestamptz,'applied',now(),$8)
  on conflict(provider,event_id) do nothing returning event_id
), identity_candidate as (
  select m.id email_message_id,m.lead_id,m.is_fixture
  from email_messages m join email_message_identities i on i.email_message_id=m.id
  where i.tracking_id=$9::uuid
    and(($10='results' and m.kind='results' and m.nurture_stage is null)
      or($11::integer is not null and m.kind='nurture' and m.nurture_stage=$11))
  limit 1
), exact_attribution as (
  select c.* from identity_candidate c join leads l on l.id=c.lead_id
  where lower(trim(l.email))=$12
), fallback_candidates as (
  select l.id lead_id,l.is_fixture,count(*) over() candidate_count
  from leads l where $13::text is null and $12::text is not null and lower(trim(l.email))=$12
    and l.created_at<=$6::timestamptz order by l.created_at desc limit 2
), fallback as (
  select lead_id,is_fixture from fallback_candidates where candidate_count=1 limit 1
), attribution as (
  select email_message_id,lead_id,is_fixture,'attributed'::text outcome from exact_attribution
  union all
  select null,lead_id,is_fixture,'attributed' from fallback where not exists(select 1 from exact_attribution)
  limit 1
)
insert into sales(
  provider,provider_payment_id,provider_checkout_id,provider_product_id,amount_cents,
  client_reference_id,email_message_id,lead_id,touch_ref,attribution_outcome,attribution_method,
  payment_state,paid_at,refunded_cents,dispute_state,disputed_cents,is_fixture,
  utm_source,utm_medium,utm_campaign,raw,updated_at
)
select 'whop',$4,$14,$15,$5,$13,a.email_message_id,a.lead_id,
  case when a.email_message_id is not null then $10 else null end,
  coalesce(a.outcome,case
    when $13::text is not null and $9::uuid is null then 'invalid_token'
    when $13::text is not null and not exists(select 1 from identity_candidate) then 'invalid_identity'
    when $13::text is not null then 'forwarded_unattributed'
    else 'unattributed' end),
  case when a.email_message_id is not null then 'signed_exact'
    when a.lead_id is not null then 'email_fallback'
    when(select count(*) from fallback_candidates)>1 then 'ambiguous_email' else 'none' end,
  'paid',$19::timestamptz,0,null,0,($8 or coalesce(a.is_fixture,false)),
  $16,$17,$18,'{}'::jsonb,now()
from incoming left join attribution a on true
on conflict(provider,provider_payment_id) where provider_payment_id is not null do update set
  amount_cents=coalesce(sales.amount_cents,excluded.amount_cents),
  payment_state=case when coalesce(sales.refunded_cents,0)>0 then sales.payment_state else 'paid' end,
  paid_at=coalesce(sales.paid_at,excluded.paid_at),
  provider_checkout_id=coalesce(sales.provider_checkout_id,excluded.provider_checkout_id),
  provider_product_id=coalesce(sales.provider_product_id,excluded.provider_product_id),
  email_message_id=coalesce(sales.email_message_id,excluded.email_message_id),
  lead_id=coalesce(sales.lead_id,excluded.lead_id),
  touch_ref=coalesce(sales.touch_ref,excluded.touch_ref),
  attribution_outcome=case when sales.attribution_outcome='attributed' then sales.attribution_outcome
    else coalesce(excluded.attribution_outcome,sales.attribution_outcome) end,
  attribution_method=case when sales.attribution_method in('signed_exact','email_fallback') then sales.attribution_method
    else coalesce(excluded.attribution_method,sales.attribution_method) end,
  is_fixture=coalesce(sales.is_fixture,false) or coalesce(excluded.is_fixture,false),
  utm_source=coalesce(sales.utm_source,excluded.utm_source),
  utm_medium=coalesce(sales.utm_medium,excluded.utm_medium),
  utm_campaign=coalesce(sales.utm_campaign,excluded.utm_campaign),updated_at=now()`

export const WHOP_EVENT_SQL = `
insert into payment_provider_events(
  provider,event_id,event_type,object_id,provider_payment_id,amount_cents,state,
  provider_created_at,lifecycle_at,outcome,applied_at,is_fixture
) values('whop',$1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9,
  case when $9='ignored' then now() else null end,$10)
on conflict(provider,event_id) do nothing`

export const WHOP_RECONCILE_SQL = `
with refund_per_object as (
  select distinct on(object_id) object_id,amount_cents,state
  from payment_provider_events
  where provider='whop' and provider_payment_id=$1 and event_type like 'refund.%'
  order by object_id,lifecycle_at desc,
    case when event_type='refund.updated' then 1 else 0 end desc,event_id desc
), refunds as (
  select coalesce(sum(case when state in('succeeded','completed','paid','available') then amount_cents else 0 end),0)::int cents
  from refund_per_object
), dispute_per_object as (
  select distinct on(object_id) object_id,state,amount_cents,lifecycle_at
  from payment_provider_events
  where provider='whop' and provider_payment_id=$1 and event_type like 'dispute.%'
  order by object_id,lifecycle_at desc,
    case when event_type='dispute.updated' then 1 else 0 end desc,event_id desc
), dispute as (
  select case
      when count(*) filter(where state='lost')>0 then 'lost'
      when count(*) filter(where state='open')>0 then 'open'
      when count(*)>0 then 'won' else null end state,
    coalesce(sum(amount_cents),0)::int amount_cents
  from dispute_per_object
), projected as (
  update sales set
    refunded_cents=greatest(coalesce(refunded_cents,0),coalesce((select cents from refunds),0)),
    payment_state=case
      when coalesce((select cents from refunds),0)>=coalesce(amount_cents,0) and coalesce(amount_cents,0)>0 then 'refunded'
      when coalesce((select cents from refunds),0)>0 then 'partially_refunded' else payment_state end,
    dispute_state=coalesce((select state from dispute),dispute_state),
    disputed_cents=greatest(coalesce(disputed_cents,0),coalesce((select amount_cents from dispute),0)),updated_at=now()
  where provider='whop' and provider_payment_id=$1 returning provider_payment_id
)
update payment_provider_events set outcome='applied',applied_at=coalesce(applied_at,now())
where provider='whop' and provider_payment_id in(select provider_payment_id from projected)
  and event_type in('refund.created','refund.updated','dispute.created','dispute.updated')`

export async function persistWhopEvent(db, event, context) {
  const fixture = Boolean(context.runtimeProof)
  if (event.eventType === 'payment.succeeded') {
    const step = context.claims?.step ?? null
    const nurtureStage = step === 'results' || !step ? null : Number(step.slice(1))
    await db.query(WHOP_PAYMENT_SQL, [
      event.eventId,event.eventType,event.objectId,event.paymentId,event.paymentAmountCents,
      event.providerCreatedAt,event.lifecycleAt,fixture,context.claims?.trackingId ?? null,
      step,nurtureStage,event.email,context.reference || null,event.checkoutId,event.productId,
      sanitizeUtm(event.metadata.utm_source),sanitizeUtm(event.metadata.utm_medium),sanitizeUtm(event.metadata.utm_campaign),event.paidAt,
    ])
  } else {
    await db.query(WHOP_EVENT_SQL, [
      event.eventId,event.eventType,event.objectId,event.paymentId,event.amountCents,event.state,
      event.providerCreatedAt,event.lifecycleAt,event.eventType === 'payment.failed' ? 'ignored' : 'received',fixture,
    ])
  }
  await db.query(WHOP_RECONCILE_SQL, [event.paymentId])
}
