import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { isAllowedCaptureOrigin } from '@/lib/capture.mjs'
import { createScopedFixtureAuthorization } from '@/lib/fixture-authorization.mjs'
import {
  FIXTURE_RESULT_DISPATCH_BODY_LIMIT,
  FIXTURE_RESULT_DISPATCH_SCOPE,
  fixtureResultDispatchResponse,
  parseFixtureResultDispatchBody,
} from '@/lib/fixture-result-dispatch.mjs'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!isAllowedCaptureOrigin(request.headers.get('origin'), request.url) || !isAdmin()) {
    return NextResponse.json(fixtureResultDispatchResponse('blocked'), { status: 401, headers })
  }
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > FIXTURE_RESULT_DISPATCH_BODY_LIMIT) throw new Error('invalid body')
    const input = parseFixtureResultDispatchBody(JSON.parse(raw))
    if (!input) throw new Error('invalid body')
    const authorization = createScopedFixtureAuthorization(
      process.env.ADMIN_TOKEN, FIXTURE_RESULT_DISPATCH_SCOPE, input.captureId,
    )
    return NextResponse.json({ authorization }, { headers })
  } catch {
    return NextResponse.json(fixtureResultDispatchResponse('blocked'), { status: 400, headers })
  }
}
