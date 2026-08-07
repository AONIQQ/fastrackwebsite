import { NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Records every completed checkout into the sales table so conversion can be
 * joined against leads (by email) and traffic source (client_reference_id).
 * Signature verification is Stripe's v1 scheme: HMAC-SHA256 of
 * "{timestamp}.{payload}" with the endpoint signing secret.
 */
function verify(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false
  const parts = Object.fromEntries(
    header.split(',').map((kv) => kv.split('=') as [string, string]),
  )
  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 })

  const payload = await request.text()
  if (!verify(payload, request.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 })
  }

  const event = JSON.parse(payload)
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object
    await sql`
      insert into sales (stripe_event_id, payment_intent, email, amount_cents, client_reference_id, raw)
      values (
        ${event.id},
        ${s.payment_intent ?? null},
        ${s.customer_details?.email?.toLowerCase() ?? null},
        ${s.amount_total ?? null},
        ${s.client_reference_id ?? null},
        ${JSON.stringify({ mode: s.mode, payment_status: s.payment_status })}::jsonb
      )
      on conflict (stripe_event_id) do nothing
    `
  }
  return NextResponse.json({ received: true })
}
