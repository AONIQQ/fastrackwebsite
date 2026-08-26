import { cookies } from 'next/headers'
import Link from 'next/link'
import { attributionSecret } from '@/lib/attribution-tokens.mjs'
import { CREDIT_MAP_BUYER_COOKIE, verifyBuyerStartToken } from '@/lib/credit-map-buyer-start.mjs'
import { sql } from '@/lib/db'
import { CreditMapIntakeForm } from './CreditMapIntakeForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Start your Credit Map | Fastrack', robots: { index: false, follow: false } }

export default async function CreditMapStartIntake() {
  let claims = null
  try { claims = verifyBuyerStartToken(cookies().get(CREDIT_MAP_BUYER_COOKIE)?.value, attributionSecret()) } catch {}
  const rows = claims ? await sql`
    select intake.status from credit_map_intakes intake join sales sale on sale.id = intake.sale_id
    where intake.buyer_token_key = ${claims.key} and intake.buyer_token_expires_at >= now()
      and sale.provider = 'stripe' and sale.paid_at is not null and sale.payment_state = 'paid'
      and coalesce(sale.is_fixture, false) = false and coalesce(sale.refunded_cents, 0) = 0
      and coalesce(sale.dispute_state, '') not in ('open', 'lost') limit 1
  ` as { status: string }[] : []
  const authorized = rows.length === 1
  return <main className="min-h-screen bg-slate-50 px-4 py-12 text-[#080b53]">
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="text-sm underline">Fastrack home</Link>
      <h1 className="mt-6 text-4xl font-bold">Start your Credit Map</h1>
      <p className="mt-4 text-slate-700">Share the minimum details needed to prepare your term-by-term plan. You will receive a spreadsheet and PDF within 7 business days. No call is required.</p>
      <div className="mt-8">{authorized && rows[0].status === 'awaiting_intake' ? <CreditMapIntakeForm /> : authorized ? <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-950"><h2 className="text-2xl font-bold">Your intake is saved</h2><p className="mt-3">We will use these details to prepare your spreadsheet and PDF. Delivery is within 7 business days, and no call is required.</p></div> : <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 text-amber-950"><h2 className="text-xl font-bold">We could not open this order yet</h2><p className="mt-2">Return to your Stripe confirmation and use its start link. If payment was just completed, wait a moment and try that link again.</p><p className="mt-2">If the problem continues, email info@fastrack.school from the address used at checkout.</p></div>}</div>
    </div>
  </main>
}
