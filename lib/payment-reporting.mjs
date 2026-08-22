export const PAYMENT_TOTALS_SQL = `
select count(*) filter(where sales.paid_at is not null)::int count,
  coalesce(sum(case when sales.paid_at is not null and coalesce(sales.dispute_state,'') not in('open','lost')
    then greatest(coalesce(sales.amount_cents,0)-coalesce(sales.refunded_cents,0),0) else 0 end),0)::int cents
from sales left join leads on leads.id=sales.lead_id
where coalesce(sales.is_fixture,false)=false and not coalesce(leads.is_fixture,false)
  and not exists(select 1 from email_messages where email_messages.id=sales.email_message_id and email_messages.is_fixture)`

export const PAYMENT_BY_PROVIDER_SOURCE_SQL = `
with raw as (
  select coalesce(sales.provider,'stripe') provider,
    lower(coalesce(sales.utm_source,leads.utm_source,leads.utm->>'utm_source',
      case when leads.normalized_referrer is not null then 'referral' else 'direct' end,'direct')) raw_source,
    lower(coalesce(sales.utm_medium,leads.utm_medium,leads.utm->>'utm_medium','direct')) raw_medium,
    lower(coalesce(sales.utm_campaign,leads.utm_campaign,leads.utm->>'utm_campaign','direct')) raw_campaign,
    lower(coalesce(leads.utm_content,leads.utm->>'utm_content')) raw_content,
    sales.amount_cents,sales.refunded_cents,sales.dispute_state
  from sales left join leads on leads.id=sales.lead_id
  where sales.paid_at is not null and coalesce(sales.is_fixture,false)=false
    and not coalesce(leads.is_fixture,false)
    and not exists(select 1 from email_messages where email_messages.id=sales.email_message_id and email_messages.is_fixture)
), classified as (
  select provider,
    case when raw_source in('direct','referral','google','bing','reddit','facebook','instagram','tiktok','forum','email','youtube','podcast') then raw_source else 'other' end source,
    case when raw_medium in('direct','organic','partner','nurture','email','cpc','referral') then raw_medium else 'other' end medium,
    case when raw_campaign ~ '^(agent-[0-9]{8}|creator-[0-9]{8}|validation|direct)$' then raw_campaign else 'other' end campaign,
    case when raw_content in('partner-email','partner-form','community-reply','seo-page','homepage','calculator')
      or raw_content ~ '^partner-p[0-9]{4}$'
      or (raw_content ~ '^alexis-v[0-9]{3}$'
        and raw_source in('instagram','tiktok','facebook','youtube')
        and raw_medium='organic' and raw_campaign ~ '^creator-[0-9]{8}$')
      then raw_content else null end content,
    amount_cents,refunded_cents,dispute_state
  from raw
)
select provider,source,medium,campaign,content,count(*)::int sales,
  coalesce(sum(case when coalesce(dispute_state,'') not in('open','lost')
    then greatest(coalesce(amount_cents,0)-coalesce(refunded_cents,0),0) else 0 end),0)::int net_cents
from classified group by provider,source,medium,campaign,content
order by provider,net_cents desc,source,medium,campaign,content nulls first`

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
