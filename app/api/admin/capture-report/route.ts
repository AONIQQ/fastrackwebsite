import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { captureOperationsReport } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await captureOperationsReport(30), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
