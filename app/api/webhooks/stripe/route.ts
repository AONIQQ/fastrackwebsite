import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { sql } from '@/lib/db'
import { checkoutPaymentState, disputeState, parseLeadTouch } from '@/lib/stripe-ledger.mjs'

export const dynamic = 'force-dynamic'

type StripeObject = {
  id?: string
  payment_intent?: string
  client_reference_id?: string
  customer_details?: { email?: string }
  amount_total?: number
  amount_refunded?: number
  amount?: number
  payment_status?: string
  mode?: string
  refunded?: boolean
  status?: string
}

type StripeEvent = { id: string; type: string; created: number; data?: { object?: StripeObject } }

function verify(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false
  const values = header.split(',').map((part) => part.split('=', 2))
  const timestamp = values.find(([key]) => key === 't')?.[1]
  const signatures = values.filter(([key]) => key === 'v1').map(([, value]) => value)
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest()
  return signatures.some((value) => {
    const actual = Buffer.from(value, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
}

async function reconcilePaymentIntent(paymentIntent: string) {
  await sql`
    with refund_per_charge as (
      select distinct on (object_id) object_id, amount_cents
      from stripe_events
      where payment_intent = ${paymentIntent} and event_type = 'charge.refunded' and object_id is not null
      order by object_id, provider_created_at desc, event_id desc
    ), refund as (
      select coalesce(sum(amount_cents), 0)::int as cents from refund_per_charge
    ), dispute_per_object as (
      select distinct on (object_id) object_id, state, amount_cents, provider_created_at
      from stripe_events
      where payment_intent = ${paymentIntent} and event_type like 'charge.dispute.%' and object_id is not null
      order by object_id,
        case when event_type = 'charge.dispute.closed' then 1 else 0 end desc,
        provider_created_at desc, event_id desc
    ), dispute as (
      select state, amount_cents from dispute_per_object
      order by provider_created_at desc, object_id desc limit 1
    ), projected as (
      update sales set
      refunded_cents = greatest(coalesce(refunded_cents, 0), coalesce((select cents from refund), 0)),
      payment_state = case
        when coalesce((select cents from refund), 0) >= coalesce(amount_cents, 0) and coalesce(amount_cents, 0) > 0 then 'refunded'
        when coalesce((select cents from refund), 0) > 0 then 'partially_refunded'
        else payment_state end,
      dispute_state = coalesce((select state from dispute), dispute_state),
      disputed_cents = greatest(coalesce(disputed_cents, 0), coalesce((select amount_cents from dispute), 0)),
      updated_at = now()
      where payment_intent = ${paymentIntent}
      returning payment_intent
    )
    update stripe_events set outcome = 'applied', applied_at = coalesce(applied_at, now())
    where payment_intent in (select payment_intent from projected)
      and event_type in ('charge.refunded', 'charge.dispute.created', 'charge.dispute.closed')
  `
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 })
  const payload = await request.text()
  if (!verify(payload, request.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 })
  }

  let event: StripeEvent
  try { event = JSON.parse(payload) as StripeEvent } catch { return NextResponse.json({ error: 'invalid payload' }, { status: 400 }) }
  if (!event.id || !event.type || !Number.isInteger(event.created) || event.created <= 0 || event.created > Date.now() / 1000 + 300) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }
  const object = event?.data?.object || {}
  const paymentIntent = typeof object.payment_intent === 'string' && object.payment_intent ? object.payment_intent : null
  const relatedOutcome = paymentIntent ? 'received' : 'unmatched'

  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed'].includes(event.type)) {
    const reference = parseLeadTouch(object.client_reference_id)
    const state = checkoutPaymentState(event.type, object)
    await sql`
      with incoming as (
        insert into stripe_events (event_id, event_type, object_id, payment_intent, amount_cents, state, provider_created_at, outcome, applied_at)
        values (${event.id}, ${event.type}, ${object.id ?? null}, ${paymentIntent},
          ${object.amount_total ?? null}, ${state}, to_timestamp(${event.created}), 'applied', now())
        on conflict (event_id) do nothing returning event_id
      )
      insert into sales (
        stripe_event_id, checkout_session_id, payment_intent, email, amount_cents,
        client_reference_id, lead_id, touch_ref, payment_state, paid_at,
        refunded_cents, dispute_state, disputed_cents, raw, updated_at
      ) select ${event.id}, ${object.id ?? null}, ${paymentIntent},
        ${object.customer_details?.email?.toLowerCase() ?? null}, ${object.amount_total ?? null},
        ${object.client_reference_id ?? null}, ${reference.leadId}, ${reference.touchRef}, ${state},
        case when ${state} = 'paid' then now() else null end, 0, null, 0,
        ${JSON.stringify({ mode: object.mode, payment_status: object.payment_status })}::jsonb, now()
      from incoming
      on conflict (checkout_session_id) where checkout_session_id is not null do update set
        payment_intent = coalesce(excluded.payment_intent, sales.payment_intent),
        email = coalesce(excluded.email, sales.email), amount_cents = coalesce(excluded.amount_cents, sales.amount_cents),
        client_reference_id = coalesce(excluded.client_reference_id, sales.client_reference_id),
        lead_id = coalesce(excluded.lead_id, sales.lead_id), touch_ref = coalesce(excluded.touch_ref, sales.touch_ref),
        payment_state = case when sales.paid_at is not null then sales.payment_state else excluded.payment_state end,
        paid_at = case when excluded.payment_state = 'paid' then coalesce(sales.paid_at, now()) else sales.paid_at end,
        raw = excluded.raw, updated_at = now()
    `
    if (paymentIntent) await reconcilePaymentIntent(paymentIntent)
  } else if (event.type === 'charge.refunded') {
    await sql`
      with incoming as (
        insert into stripe_events (event_id, event_type, object_id, payment_intent, amount_cents, state, provider_created_at, outcome)
        values (${event.id}, ${event.type}, ${object.id ?? null}, ${paymentIntent},
          ${object.amount_refunded ?? 0}, case when ${object.refunded === true} then 'refunded' else 'partially_refunded' end,
          to_timestamp(${event.created}),
          ${relatedOutcome})
        on conflict (event_id) do nothing returning event_id
      )
      select count(*)::int from incoming
    `
    if (paymentIntent) await reconcilePaymentIntent(paymentIntent)
  } else if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') {
    const state = disputeState(event.type, object)
    await sql`
      with incoming as (
        insert into stripe_events (event_id, event_type, object_id, payment_intent, amount_cents, state, provider_created_at, outcome)
        values (${event.id}, ${event.type}, ${object.id ?? null}, ${paymentIntent}, ${object.amount ?? 0}, ${state},
          to_timestamp(${event.created}),
          ${relatedOutcome})
        on conflict (event_id) do nothing returning event_id
      )
      select count(*)::int from incoming
    `
    if (paymentIntent) await reconcilePaymentIntent(paymentIntent)
  } else {
    await sql`
      insert into stripe_events (event_id, event_type, object_id, provider_created_at, outcome)
      values (${event.id}, ${event.type}, ${object.id ?? null}, to_timestamp(${event.created}), 'ignored') on conflict (event_id) do nothing
    `
  }
  return NextResponse.json({ received: true })
}
