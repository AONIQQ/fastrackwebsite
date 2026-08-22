import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { attributionSecret, verifyCheckoutToken } from '@/lib/attribution-tokens.mjs'
import { firstPartyRequestContextIsAllowed } from '@/lib/first-party-funnel-contract.mjs'
import { transactionClient, sql } from '@/lib/db'
import {
  findOrCreateWhopGuideCheckout,
  GUIDE_CHECKOUT_CLAIM_SQL,
  GUIDE_CHECKOUT_COMPLETE_SQL,
  GUIDE_CHECKOUT_RELEASE_SQL,
} from '@/lib/guide-checkout.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const MAX_BODY_BYTES = 512
const noStore = { 'Cache-Control': 'no-store, max-age=0' }

export async function POST(request: Request) {
  const startedAt = Date.now()
  const requestId = randomUUID()
  const done = (status: number, outcome: string) => console.log(JSON.stringify({ level: 'info', message: 'complete', route: '/api/checkout/guide', requestId, status, outcome, duration_ms: Date.now() - startedAt }))
  console.log(JSON.stringify({ level: 'info', message: 'start', route: '/api/checkout/guide', requestId }))
  if (!firstPartyRequestContextIsAllowed(request.headers)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore })
  const length = Number(request.headers.get('content-length') ?? 0)
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore })
  let text: string
  try { text = await request.text() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore }) }
  if (Buffer.byteLength(text) !== length || Buffer.byteLength(text) > MAX_BODY_BYTES) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore })
  let reference = ''
  try {
    const body = JSON.parse(text)
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.checkout_ref !== 'string') throw new Error('invalid')
    reference = body.checkout_ref
  } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore }) }
  let claims
  try { claims = verifyCheckoutToken(reference, attributionSecret()) } catch { claims = null }
  if (!claims || claims.step !== 'n2') return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore })

  const claimToken = randomUUID()
  try {
    const db = transactionClient()
    const result = await db.transaction((txn) => [
      txn`select pg_advisory_xact_lock(hashtextextended(${claims.trackingId}::text, 0))`,
      txn.query(GUIDE_CHECKOUT_CLAIM_SQL, [claims.trackingId, claimToken]),
    ], { isolationLevel: 'ReadCommitted' })
    const claim = (result[1] as { purchase_url: string | null; status: 'ready' | 'claimed' | 'pending' }[])[0]
    if (!claim) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore })
    if (claim.status === 'ready' && claim.purchase_url) { done(200, 'reused'); return NextResponse.json({ url: claim.purchase_url }, { headers: noStore }) }
    if (claim.status !== 'claimed') { done(409, 'pending'); return NextResponse.json({ error: 'Checkout is being prepared' }, { status: 409, headers: noStore }) }

    const checkout = await findOrCreateWhopGuideCheckout({
      apiKey: process.env.WHOP_API_KEY || '', companyId: process.env.WHOP_COMPANY_ID || '',
      planId: process.env.WHOP_PLAN_ID || '', reference,
    })
    const completed = await sql.query(GUIDE_CHECKOUT_COMPLETE_SQL, [claims.trackingId, claimToken, checkout.id, checkout.purchaseUrl]) as { purchase_url: string }[]
    if (!completed[0]?.purchase_url) throw new Error('guide checkout claim lost')
    done(200, 'created')
    return NextResponse.json({ url: completed[0].purchase_url }, { headers: noStore })
  } catch {
    await sql.query(GUIDE_CHECKOUT_RELEASE_SQL, [claims.trackingId, claimToken]).catch(() => null)
    console.error(JSON.stringify({ level: 'error', message: 'failed', route: '/api/checkout/guide', requestId, error: 'guide_checkout_failed', duration_ms: Date.now() - startedAt }))
    return NextResponse.json({ error: 'Checkout unavailable' }, { status: 503, headers: noStore })
  }
}
