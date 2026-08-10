import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { rolloutOperationsReport } from '@/lib/rollout-status'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await rolloutOperationsReport(), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
