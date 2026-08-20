export const PAYMENT_TOTALS_SQL = `
select count(*) filter(where sales.paid_at is not null)::int count,
  coalesce(sum(case when sales.paid_at is not null and coalesce(sales.dispute_state,'') not in('open','lost')
    then greatest(coalesce(sales.amount_cents,0)-coalesce(sales.refunded_cents,0),0) else 0 end),0)::int cents
from sales left join leads on leads.id=sales.lead_id
where coalesce(sales.is_fixture,false)=false and not coalesce(leads.is_fixture,false)
  and not exists(select 1 from email_messages where email_messages.id=sales.email_message_id and email_messages.is_fixture)`

export const PAYMENT_BY_PROVIDER_SOURCE_SQL = `
with classified as (
  select coalesce(sales.provider,'stripe') provider,
    case when lower(coalesce(sales.utm_source,leads.utm_source,leads.utm->>'utm_source',
      case when leads.normalized_referrer is not null then 'referral' else 'direct' end,'direct'))
      in('direct','referral','google','bing','reddit','facebook','instagram','tiktok','forum','email','youtube')
    then lower(coalesce(sales.utm_source,leads.utm_source,leads.utm->>'utm_source',
      case when leads.normalized_referrer is not null then 'referral' else 'direct' end,'direct'))
    else 'other' end source,
    sales.amount_cents,sales.refunded_cents,sales.dispute_state
  from sales left join leads on leads.id=sales.lead_id
  where sales.paid_at is not null and coalesce(sales.is_fixture,false)=false
    and not coalesce(leads.is_fixture,false)
    and not exists(select 1 from email_messages where email_messages.id=sales.email_message_id and email_messages.is_fixture)
)
select provider,source,count(*)::int sales,
  coalesce(sum(case when coalesce(dispute_state,'') not in('open','lost')
    then greatest(coalesce(amount_cents,0)-coalesce(refunded_cents,0),0) else 0 end),0)::int net_cents
from classified group by provider,source order by provider,net_cents desc,source`

export const PROVIDER_PAYMENT_TOTALS_SQL = `
select count(*) filter(where sales.paid_at is not null)::int paid_sales,
  count(*) filter(where coalesce(sales.refunded_cents,0)>0)::int refunded_sales,
  count(*) filter(where sales.dispute_state='open')::int open_disputes,
  count(*) filter(where sales.dispute_state='lost')::int lost_disputes,
  coalesce(sum(case when sales.paid_at is not null then sales.amount_cents else 0 end),0)::int gross_cents,
  coalesce(sum(sales.refunded_cents),0)::int refunded_cents,
  coalesce(sum(case when sales.paid_at is not null and coalesce(sales.dispute_state,'') not in('open','lost')
    then greatest(coalesce(sales.amount_cents,0)-coalesce(sales.refunded_cents,0),0) else 0 end),0)::int net_cents
from sales left join leads on leads.id=sales.lead_id
where coalesce(sales.provider,'stripe')=$1 and coalesce(sales.is_fixture,false)=false
  and not coalesce(leads.is_fixture,false)
  and not exists(select 1 from email_messages where email_messages.id=sales.email_message_id and email_messages.is_fixture)`
