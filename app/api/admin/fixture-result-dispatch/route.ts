import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin'
import { isAllowedCaptureOrigin } from '@/lib/capture.mjs'
import { verifyScopedFixtureAuthorization } from '@/lib/fixture-authorization.mjs'
import {
  FIXTURE_RESULT_DISPATCH_SCOPE,
  FIXTURE_RESULT_DISPATCH_BODY_LIMIT,
  fixtureResultDispatchRolloutReady,
  fixtureResultDispatchResponse,
  parseFixtureResultDispatchBody,
} from '@/lib/fixture-result-dispatch.mjs'
import { claimReservedFixtureResult, dispatchClaimedMessage } from '@/lib/message-ledger'
import { rolloutConfigurationStatus } from '@/lib/rollout-controls.mjs'

export const dynamic = 'force-dynamic'

const json = (body: ReturnType<typeof fixtureResultDispatchResponse>, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const allowedOrigin = isAllowedCaptureOrigin(request.headers.get('origin'), request.url)
  const authorization = request.headers.get('x-fastrack-fixture-authorization')
  if (!allowedOrigin || !isAdmin()) return json(fixtureResultDispatchResponse('blocked'), 401)

  const length = Number(request.headers.get('content-length') || 0)
  if (!Number.isFinite(length) || length < 0 || length > FIXTURE_RESULT_DISPATCH_BODY_LIMIT) {
    return json(fixtureResultDispatchResponse('blocked'), 400)
  }

  let input
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > FIXTURE_RESULT_DISPATCH_BODY_LIMIT) {
      return json(fixtureResultDispatchResponse('blocked'), 400)
    }
    input = parseFixtureResultDispatchBody(JSON.parse(raw))
  } catch {
    input = null
  }
  if (!input) return json(fixtureResultDispatchResponse('blocked'), 400)
  if (!verifyScopedFixtureAuthorization(
    authorization, process.env.ADMIN_TOKEN, FIXTURE_RESULT_DISPATCH_SCOPE, input.captureId,
  )) return json(fixtureResultDispatchResponse('blocked'), 401)

  const rollout = rolloutConfigurationStatus()
  if (!fixtureResultDispatchRolloutReady(rollout)) {
    return json(fixtureResultDispatchResponse('stopped'), 503)
  }

  try {
    const message = await claimReservedFixtureResult(input.captureId)
    if (!message) return json(fixtureResultDispatchResponse('blocked'), 409)
    const outcome = await dispatchClaimedMessage(message, { authorizedFixtureDispatch: true })
    return json(fixtureResultDispatchResponse(outcome), outcome === 'accepted' ? 200 : 503)
  } catch {
    return json(fixtureResultDispatchResponse('failed'), 502)
  }
}
