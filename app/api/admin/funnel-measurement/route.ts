import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { firstPartyFunnelReport } from '@/lib/first-party-funnel'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  if (!isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  try {
    return NextResponse.json(await firstPartyFunnelReport(), { headers })
  } catch {
    return NextResponse.json({ error: 'Funnel measurement unavailable' }, { status: 500, headers })
  }
}
