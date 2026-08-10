import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { attributionSecret, verifyEngagementToken } from '@/lib/attribution-tokens.mjs'
import { resolvedDestination, SITE } from '@/lib/tracking-links.mjs'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  let claims
  try {
    claims = verifyEngagementToken(new URL(request.url).searchParams.get('t'), attributionSecret())
  } catch {
    return NextResponse.redirect(SITE, 302)
  }
  if (!claims || claims.destination === 'open') return NextResponse.redirect(SITE, 302)
  const nurtureStage = claims.step === 'results' ? null : Number(claims.step.slice(1))

  const rows = await sql`
    with message as (
      select message_row.id from email_messages message_row
      join email_message_identities identity on identity.email_message_id = message_row.id
      where identity.tracking_id = ${claims.trackingId}::uuid
        and ((${claims.step} = 'results' and message_row.kind = 'results' and message_row.nurture_stage is null)
          or (${nurtureStage} is not null and message_row.kind = 'nurture' and message_row.nurture_stage = ${nurtureStage}))
      limit 1
    ), inserted as (
      insert into email_engagement_events (email_message_id, step, event_type, destination_key)
      select id, ${claims.step}, 'click', ${claims.destination} from message
      returning email_message_id
    ) select email_message_id from inserted
  `.catch(() => null) as { email_message_id: number }[] | null
  const destination = resolvedDestination(
    claims.destination, claims.step, claims.trackingId, claims.expiresAt, attributionSecret(),
  )
  if (rows === null) return NextResponse.redirect(destination, 302)
  if (!rows.length) return NextResponse.redirect(SITE, 302)

  return NextResponse.redirect(destination, 302)
}
