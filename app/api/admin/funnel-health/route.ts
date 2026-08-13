import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { funnelHealthReport } from '@/lib/funnel-health'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const startedAt = Date.now()
  const requestId = request.headers.get('x-vercel-id')
  if (!isAdmin()) {
    console.warn(JSON.stringify({ level: 'warn', message: 'unauthorized', route: '/api/admin/funnel-health', requestId, duration_ms: Date.now() - startedAt }))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  try {
    const report = await funnelHealthReport()
    console.log(JSON.stringify({ level: 'info', message: 'complete', route: '/api/admin/funnel-health', requestId, status: report.status, duration_ms: Date.now() - startedAt }))
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', message: 'failed', route: '/api/admin/funnel-health', requestId, error: error instanceof Error ? error.message : 'unknown', duration_ms: Date.now() - startedAt }))
    return NextResponse.json({ error: 'Health report unavailable' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
