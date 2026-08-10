import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { emailDeliveryOperationsReport } from '@/lib/resend-event-ledger'
import { assertAggregateReport } from '@/lib/resend-events.mjs'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const report = assertAggregateReport(await emailDeliveryOperationsReport())
  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } })
}
