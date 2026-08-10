import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { ingestResendWebhook } from '@/lib/resend-events.mjs'
import { persistResendEvent } from '@/lib/resend-event-ledger'
import { effectiveRolloutControls, rolloutControls } from '@/lib/rollout-controls.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Signature verification does not call the Resend API, but the SDK constructor
// still requires a key. The fallback is deliberately nonfunctional for network use.
const resend = new Resend(process.env.RESEND_API_KEY || 're_webhook_verification_only')

export async function POST(request: NextRequest) {
  const controls = effectiveRolloutControls(rolloutControls())
  const rawBody = await request.text()
  const response = await ingestResendWebhook({
    rawBody,
    headers: {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    },
    secret: process.env.RESEND_WEBHOOK_SECRET,
    ingestionEnabled: controls.resendWebhookIngest,
    projectionEnabled: controls.resendWebhookProject,
    verify: (options: Parameters<typeof resend.webhooks.verify>[0]) => resend.webhooks.verify(options),
    persist: persistResendEvent,
  })
  return NextResponse.json(response.body, { status: response.status })
}
