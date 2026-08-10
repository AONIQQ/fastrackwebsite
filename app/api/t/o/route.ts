import { sql } from '@/lib/db'
import { attributionSecret, verifyEngagementToken } from '@/lib/attribution-tokens.mjs'

export const dynamic = 'force-dynamic'

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(request: Request) {
  try {
    const claims = verifyEngagementToken(new URL(request.url).searchParams.get('t'), attributionSecret())
    if (claims?.destination === 'open') {
      const nurtureStage = claims.step === 'results' ? null : Number(claims.step.slice(1))
      await sql`
        insert into email_engagement_events (email_message_id, step, event_type)
        select message_row.id, ${claims.step}, 'open' from email_messages message_row
        join email_message_identities identity on identity.email_message_id = message_row.id
        where identity.tracking_id = ${claims.trackingId}::uuid
          and ((${claims.step} = 'results' and message_row.kind = 'results' and message_row.nurture_stage is null)
            or (${nurtureStage} is not null and message_row.kind = 'nurture' and message_row.nurture_stage = ${nurtureStage}))
      `.catch(() => {})
    }
  } catch {
    // A tracking failure must never expose identity or break email rendering.
  }
  return new Response(PIXEL, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' },
  })
}
