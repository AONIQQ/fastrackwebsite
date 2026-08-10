import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { isAllowedCaptureOrigin } from '@/lib/capture.mjs'
import { createFixtureAuthorization } from '@/lib/fixture-authorization.mjs'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!isAllowedCaptureOrigin(request.headers.get('origin'), request.url) || !isAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  try {
    return NextResponse.json({ authorization: createFixtureAuthorization(process.env.ADMIN_TOKEN) }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'Fixture authorization unavailable' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
