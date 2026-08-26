import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { randomUUID } from 'node:crypto'
import { attributionSecret } from '@/lib/attribution-tokens.mjs'
import { CREDIT_MAP_BUYER_COOKIE, parseCreditMapIntake, verifyBuyerStartToken } from '@/lib/credit-map-buyer-start.mjs'
import { firstPartyRequestContextIsAllowed } from '@/lib/first-party-funnel-contract.mjs'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const noStore = { 'Cache-Control': 'no-store, max-age=0' }

export async function POST(request: Request) {
  if (!firstPartyRequestContextIsAllowed(request.headers)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore })
  let claims = null
  try { claims = verifyBuyerStartToken(cookies().get(CREDIT_MAP_BUYER_COOKIE)?.value, attributionSecret()) } catch {}
  if (!claims) return NextResponse.json({ error: 'Start link expired' }, { status: 401, headers: noStore })
  let body: unknown
  try {
    const text = await request.text()
    if (Buffer.byteLength(text) > 7000) throw new Error('large')
    body = JSON.parse(text)
  } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: noStore }) }
  const intake = parseCreditMapIntake(body)
  if (!intake) return NextResponse.json({ error: 'Please complete the required fields' }, { status: 400, headers: noStore })
  const rows = await sql`
    with candidate as (
      select intake.id, intake.status
      from credit_map_intakes intake join sales sale on sale.id = intake.sale_id
      where intake.buyer_token_key = ${claims.key}
        and intake.buyer_token_expires_at >= now()
        and sale.provider = 'stripe' and sale.paid_at is not null and sale.payment_state = 'paid'
        and coalesce(sale.is_fixture, false) = false and coalesce(sale.refunded_cents, 0) = 0
        and coalesce(sale.dispute_state, '') not in ('open', 'lost')
      for update of intake
    ), saved as (
      update credit_map_intakes intake set
        student_grade = ${intake.studentGrade}, current_school_program = ${intake.currentSchoolProgram},
        graduation_year = ${intake.graduationYear}, state = ${intake.state},
        dual_enrollment_provider = ${intake.dualEnrollmentProvider}, target_college = ${intake.targetCollege},
        intended_major = ${intake.intendedMajor}, current_dual_credit = ${intake.currentDualCredit},
        planning_context = ${intake.planningContext}, status = 'submitted', submitted_at = now(), updated_at = now()
      from candidate where intake.id = candidate.id and intake.status = 'awaiting_intake'
        and candidate.status = 'awaiting_intake'
      returning intake.id
    ), owner_notification as (
      insert into credit_map_owner_notifications (intake_id, provider_idempotency_key)
      select candidate.id, ${randomUUID()}::uuid from candidate
      where candidate.status in ('awaiting_intake', 'submitted', 'in_progress', 'delivered')
        and (exists(select 1 from saved) or candidate.status in ('submitted', 'in_progress', 'delivered'))
      on conflict (intake_id) do nothing
      returning intake_id
    )
    select case when exists(select 1 from saved) then 'submitted'
      when exists(select 1 from candidate where status <> 'awaiting_intake') then 'already_submitted'
      else 'invalid' end as outcome,
      (select count(*)::int from owner_notification) as owner_notification_created
  ` as { outcome: 'submitted' | 'already_submitted' | 'invalid'; owner_notification_created: number }[]
  if (rows[0]?.outcome === 'invalid') return NextResponse.json({ error: 'Start link expired' }, { status: 401, headers: noStore })
  if (!rows[0]) return NextResponse.json({ error: 'Unable to save intake' }, { status: 503, headers: noStore })
  const response = NextResponse.json({ status: 'submitted', duplicate: rows[0].outcome === 'already_submitted' }, { headers: noStore })
  response.cookies.set(CREDIT_MAP_BUYER_COOKIE, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0,
  })
  return response
}
