import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { attributionSecret, ATTRIBUTION_TOKEN_TTL_SECONDS, createUniqueCheckoutToken, verifyCheckoutToken } from '@/lib/attribution-tokens.mjs'
import { CREDIT_MAP_CHECKOUT_COOKIE } from '@/lib/credit-map-buyer-start.mjs'
import { firstPartyRequestContextIsAllowed } from '@/lib/first-party-funnel-contract.mjs'
import { withCheckoutReference } from '@/lib/checkout-url.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const noStore = { 'Cache-Control': 'no-store, max-age=0' }

export async function POST(request: Request) {
  if (!firstPartyRequestContextIsAllowed(request.headers)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore })
  const checkoutUrl = process.env.NEXT_PUBLIC_CREDIT_MAP_CHECKOUT_URL
  if (!checkoutUrl) return NextResponse.json({ error: 'Checkout unavailable' }, { status: 503, headers: noStore })
  try {
    const parsed = new URL(checkoutUrl)
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'buy.stripe.com') throw new Error('host')
  } catch { return NextResponse.json({ error: 'Checkout unavailable' }, { status: 503, headers: noStore }) }
  let supplied: unknown = null
  try {
    const text = await request.text()
    if (Buffer.byteLength(text) > 2048) throw new Error('large')
    const body = JSON.parse(text)
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'checkout_ref')) throw new Error('shape')
    supplied = body.checkout_ref
  } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore }) }
  const secret = attributionSecret()
  const existing = typeof supplied === 'string' ? verifyCheckoutToken(supplied, secret) : null
  const now = Math.floor(Date.now() / 1000)
  const reference = createUniqueCheckoutToken({
    trackingId: existing?.trackingId ?? randomUUID(),
    step: existing?.step ?? 'results',
    expiresAt: now + ATTRIBUTION_TOKEN_TTL_SECONDS,
    nonce: randomUUID(),
  }, secret, now)
  const response = NextResponse.json({ url: withCheckoutReference(checkoutUrl, reference) }, { headers: noStore })
  response.cookies.set(CREDIT_MAP_CHECKOUT_COOKIE, reference, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 2,
  })
  return response
}
