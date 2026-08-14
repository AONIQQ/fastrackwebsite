import { NextResponse } from 'next/server'
import { funnelHealthReport } from '@/lib/funnel-health'
import { runFunnelHealthAlert } from '@/lib/funnel-health-alerts.mjs'
import { claimFunnelHealthAlert, completeFunnelHealthAlert, releaseFunnelHealthAlert } from '@/lib/funnel-health-alert-state'
import { sendViaResend } from '@/lib/mail'
import { verifyStripeWebhookRegistration } from '@/lib/stripe-registration.mjs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const OWNER_INBOX = 'info@fastrack.school'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: false, failure: 'provider_not_configured' }, { status: 503 })
  }

  const result = await runFunnelHealthAlert({
    report: async () => ({
      ...await funnelHealthReport(),
      stripe_live_registration_status: await verifyStripeWebhookRegistration(process.env.STRIPE_SECRET_KEY),
    }),
    claim: claimFunnelHealthAlert,
    complete: completeFunnelHealthAlert,
    release: releaseFunnelHealthAlert,
    send: async ({ subject, text, idempotencyKey }: { subject: string; text: string; idempotencyKey: string }) => {
      const receipt = await sendViaResend({
        to: OWNER_INBOX,
        replyTo: OWNER_INBOX,
        subject,
        text,
        idempotencyKey,
        requireIdempotentProvider: true,
      })
      if (!receipt.messageId) throw new Error('owner_alert_provider_receipt_missing')
      return receipt
    },
  })
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
