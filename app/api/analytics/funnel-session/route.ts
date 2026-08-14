import { NextResponse } from 'next/server'
import { firstPartyRequestContextIsAllowed, parseFirstPartyFunnelSessionBody } from '@/lib/first-party-funnel-contract.mjs'
import { firstPartyNetworkDigest, issueFirstPartyFunnelToken } from '@/lib/first-party-funnel-auth.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const MAX_BODY_BYTES = 128
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
  const parsed = parseFirstPartyFunnelSessionBody(body)
  if (!parsed) return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore })
  try {
    const secret = process.env.CAPTURE_ABUSE_SECRET
    const networkDigest = firstPartyNetworkDigest(request.headers, secret)
    return NextResponse.json({ token: issueFirstPartyFunnelToken({ ...parsed, networkDigest, secret }) }, { headers: noStore })
  } catch {
    return NextResponse.json({ error: 'Unavailable' }, { status: 503, headers: noStore })
  }
}
