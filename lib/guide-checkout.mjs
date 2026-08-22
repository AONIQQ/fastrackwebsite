export const GUIDE_CHECKOUT_CLAIM_SQL = `
with eligible as (
  select i.tracking_id
  from email_message_identities i
  join email_messages m on m.id=i.email_message_id
  join leads l on l.id=m.lead_id
  where i.tracking_id=$1::uuid and m.kind='nurture' and m.nurture_stage=2
    and not coalesce(m.is_fixture,false) and not coalesce(l.is_fixture,false)
    and l.unsubscribed_at is null
), claimed as (
  insert into guide_checkout_sessions(tracking_id,step,claim_token,lease_expires_at)
  select tracking_id,'n2',$2::uuid,now()+interval '2 minutes' from eligible
  on conflict(tracking_id,step) do update set claim_token=$2::uuid,
    lease_expires_at=now()+interval '2 minutes',updated_at=now()
  where guide_checkout_sessions.purchase_url is null
    and (guide_checkout_sessions.lease_expires_at is null or guide_checkout_sessions.lease_expires_at<now())
  returning purchase_url,claim_token
)
select purchase_url,
  case when purchase_url is not null then 'ready'
    when claim_token=$2::uuid then 'claimed' else 'pending' end status
from claimed
union all
select purchase_url,case when purchase_url is not null then 'ready' else 'pending' end status
from guide_checkout_sessions where tracking_id=$1::uuid and step='n2'
  and not exists(select 1 from claimed)
limit 1`

export const GUIDE_CHECKOUT_COMPLETE_SQL = `
update guide_checkout_sessions set provider_checkout_id=$3::text,purchase_url=$4::text,
  claim_token=null,lease_expires_at=null,updated_at=now()
where tracking_id=$1::uuid and step='n2' and claim_token=$2::uuid
returning purchase_url`

export const GUIDE_CHECKOUT_RELEASE_SQL = `
update guide_checkout_sessions set claim_token=null,lease_expires_at=null,updated_at=now()
where tracking_id=$1::uuid and step='n2' and claim_token=$2::uuid and purchase_url is null`

const CHECKOUT_ID = /^ch_[A-Za-z0-9_-]{3,128}$/

export function whopCheckoutConfiguration(value, expectedPlanId, expectedReference) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = typeof value.id === 'string' && CHECKOUT_ID.test(value.id) ? value.id : null
  const purchaseUrl = typeof value.purchase_url === 'string' ? value.purchase_url : ''
  let parsed
  try { parsed = new URL(purchaseUrl) } catch { return null }
  const planId = typeof value.plan?.id === 'string' ? value.plan.id : typeof value.plan_id === 'string' ? value.plan_id : null
  const reference = typeof value.metadata?.checkout_ref === 'string' ? value.metadata.checkout_ref : null
  if (!id || parsed.protocol !== 'https:' || parsed.hostname !== 'whop.com' || !parsed.pathname.startsWith('/checkout/')) return null
  if (planId !== expectedPlanId || reference !== expectedReference) return null
  return { id, purchaseUrl: parsed.toString() }
}

export function whopCheckoutListMatch(value, expectedPlanId, expectedReference) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.data)) return null
  for (const candidate of value.data) {
    const matched = whopCheckoutConfiguration(candidate, expectedPlanId, expectedReference)
    if (matched) return matched
  }
  return null
}

export async function findOrCreateWhopGuideCheckout({ apiKey, companyId, planId, reference, fetchImpl = fetch }) {
  if (![apiKey, companyId, planId, reference].every((value) => typeof value === 'string' && value.length > 0)) throw new Error('guide checkout configuration unavailable')
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  const list = new URL('https://api.whop.com/api/v1/checkout_configurations')
  list.searchParams.set('company_id', companyId)
  list.searchParams.set('plan_id', planId)
  list.searchParams.set('first', '50')
  list.searchParams.set('direction', 'desc')
  const listed = await fetchImpl(list, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (listed.ok) {
    const recovered = whopCheckoutListMatch(await listed.json(), planId, reference)
    if (recovered) return recovered
  }
  const created = await fetchImpl('https://api.whop.com/api/v1/checkout_configurations', {
    method: 'POST', headers, cache: 'no-store', signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      plan_id: planId,
      metadata: { checkout_ref: reference, utm_source: 'email', utm_medium: 'nurture', utm_campaign: 'n2' },
      redirect_url: 'https://www.fastrack.school/guide?checkout=complete',
    }),
  })
  if (!created.ok) throw new Error('guide checkout provider rejected request')
  const result = whopCheckoutConfiguration(await created.json(), planId, reference)
  if (!result) throw new Error('guide checkout provider returned invalid response')
  return result
}
