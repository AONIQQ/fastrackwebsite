import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Andrew stopped recurring acquisition work on October 7, 2026.
// Retain a side-effect-free response for any stale scheduled invocation.
export async function GET() {
  return NextResponse.json(
    { ok: false, disabled: true },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}
