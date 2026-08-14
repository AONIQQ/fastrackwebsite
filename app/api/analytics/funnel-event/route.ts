import { NextResponse } from 'next/server'
import { firstPartyRequestContextIsAllowed, parseFirstPartyFunnelEventBody } from '@/lib/first-party-funnel-contract.mjs'
import { firstPartyNetworkDigest, verifyFirstPartyFunnelToken } from '@/lib/first-party-funnel-auth.mjs'
import { recordFirstPartyFunnelEvent } from '@/lib/first-party-funnel'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const MAX_BODY_BYTES = 768
const noStore = { 'Cache-Control': 'no-store, max-age=0' }

export async function POST(request: Request) {
  if (!firstPartyRequestContextIsAllowed(request.headers)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore })
  const length = Number(request.headers.get('content-length') ?? 0)
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore })
  let text: string
  try { text = await request.text() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore }) }
  if (Buffer.byteLength(text) !== length || Buffer.byteLength(text) > MAX_BODY_BYTES) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore })
  let body: unknown
  try { body = JSON.parse(text) } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore }) }
  const parsed = parseFirstPartyFunnelEventBody(body)
  if (!parsed) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore })
  try {
    const secret = process.env.CAPTURE_ABUSE_SECRET
    const networkDigest = firstPartyNetworkDigest(request.headers, secret)
    const verified = verifyFirstPartyFunnelToken({ token: request.headers.get('x-fastrack-funnel-token'), session: parsed.session, networkDigest, secret })
    if (!verified) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore })
    const trafficClass = verified.qa ? 'qa' : parsed.trafficClass as 'business' | 'qa'
    const result = await recordFirstPartyFunnelEvent({ sessionDigest: verified.sessionDigest, networkDigest: verified.networkDigest, event: parsed.event, ...parsed.attribution, trafficClass })
    if (!result.accepted) return NextResponse.json({ error: 'Capacity reached' }, { status: 429, headers: noStore })
    return new NextResponse(null, { status: 204, headers: noStore })
  } catch {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503, headers: noStore })
  }
}
