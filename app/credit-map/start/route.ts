import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { attributionSecret, verifyCheckoutToken } from '@/lib/attribution-tokens.mjs'
import { createBuyerStartToken, CREDIT_MAP_BUYER_COOKIE, CREDIT_MAP_CHECKOUT_COOKIE } from '@/lib/credit-map-buyer-start.mjs'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const responseUrl = new URL('/credit-map/start/intake', request.url)
  const checkoutReference = cookies().get(CREDIT_MAP_CHECKOUT_COOKIE)?.value
  const unavailable = (status: 'unavailable' | 'pending') => {
    responseUrl.searchParams.set('status', status)
    const response = NextResponse.redirect(responseUrl, 303)
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }
  let claims = null
  try { claims = verifyCheckoutToken(checkoutReference || '', attributionSecret()) } catch {}
  if (!claims?.nonce) return unavailable('unavailable')
  try {
    const rows = await sql`
      select sale.id, sale.checkout_session_id
      from sales sale
      where sale.client_reference_id = ${checkoutReference || ''}
        and sale.provider = 'stripe'
        and sale.paid_at is not null
        and sale.payment_state = 'paid'
        and coalesce(sale.is_fixture, false) = false
        and coalesce(sale.refunded_cents, 0) = 0
        and coalesce(sale.dispute_state, '') not in ('open', 'lost')
      order by sale.paid_at desc, sale.id desc
      limit 2
    ` as { id: number; checkout_session_id: string }[]
    if (rows.length !== 1 || !rows[0].checkout_session_id) throw new Error('sale unavailable')
    const buyer = createBuyerStartToken(rows[0].checkout_session_id, attributionSecret())
    const updated = await sql`
      insert into credit_map_intakes (sale_id, buyer_token_key, buyer_token_expires_at)
      values (${rows[0].id}, ${buyer.key}, to_timestamp(${buyer.expiresAt}))
      on conflict (sale_id) do update set buyer_token_key = excluded.buyer_token_key,
        buyer_token_expires_at = excluded.buyer_token_expires_at, updated_at = now()
      returning id
    ` as { id: number }[]
    if (updated.length !== 1) throw new Error('intake unavailable')
    const response = NextResponse.redirect(responseUrl, 303)
    response.cookies.set(CREDIT_MAP_BUYER_COOKIE, buyer.token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 24 * 60 * 60,
    })
    response.cookies.set(CREDIT_MAP_CHECKOUT_COOKIE, '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0,
    })
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  } catch {
    return unavailable('pending')
  }
}
