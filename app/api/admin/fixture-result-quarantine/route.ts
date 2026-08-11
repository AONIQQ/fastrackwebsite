import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { isAllowedCaptureOrigin } from '@/lib/capture.mjs'
import { verifyScopedFixtureAuthorization } from '@/lib/fixture-authorization.mjs'
import {
  FIXTURE_RESULT_DISPATCH_BODY_LIMIT,
  FIXTURE_RESULT_QUARANTINE_SCOPE,
  fixtureResultQuarantineResponse,
  fixtureResultQuarantineRolloutReady,
  parseFixtureResultDispatchBody,
} from '@/lib/fixture-result-dispatch.mjs'
import { quarantineReservedFixtureResult } from '@/lib/message-ledger'
import { rolloutConfigurationStatus } from '@/lib/rollout-controls.mjs'

export const dynamic = 'force-dynamic'

const json = (body: ReturnType<typeof fixtureResultQuarantineResponse>, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const allowedOrigin = isAllowedCaptureOrigin(request.headers.get('origin'), request.url)
  const authorization = request.headers.get('x-fastrack-fixture-authorization')
  if (!allowedOrigin || !isAdmin()) return json(fixtureResultQuarantineResponse('blocked'), 401)

  const length = Number(request.headers.get('content-length') || 0)
  if (!Number.isFinite(length) || length < 0 || length > FIXTURE_RESULT_DISPATCH_BODY_LIMIT) {
    return json(fixtureResultQuarantineResponse('blocked'), 400)
  }

  let input
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > FIXTURE_RESULT_DISPATCH_BODY_LIMIT) {
      return json(fixtureResultQuarantineResponse('blocked'), 400)
    }
    input = parseFixtureResultDispatchBody(JSON.parse(raw))
  } catch {
    input = null
  }
  if (!input) return json(fixtureResultQuarantineResponse('blocked'), 400)
  if (!verifyScopedFixtureAuthorization(
    authorization, process.env.ADMIN_TOKEN, FIXTURE_RESULT_QUARANTINE_SCOPE, input.captureId,
  )) return json(fixtureResultQuarantineResponse('blocked'), 401)

  if (!fixtureResultQuarantineRolloutReady(rolloutConfigurationStatus())) {
    return json(fixtureResultQuarantineResponse('stopped'), 503)
  }

  try {
    const quarantined = await quarantineReservedFixtureResult(input.captureId)
    return json(fixtureResultQuarantineResponse(quarantined ? 'quarantined' : 'blocked'), quarantined ? 200 : 409)
  } catch {
    return json(fixtureResultQuarantineResponse('failed'), 502)
  }
}
