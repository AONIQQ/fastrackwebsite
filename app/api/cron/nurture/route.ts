import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { NURTURE_STEPS, sendNurtureStep } from '@/lib/nurture'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Daily drip: each lead advances through NURTURE_STEPS based on age since
 * capture. Only leads captured after launch are nurtured; the historical list
 * was worked by hand. Caps sends per run to stay inside provider limits.
 */
const LAUNCH = '2026-08-06'
const MAX_SENDS_PER_RUN = 80

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const leads = (await sql`
    select id, email, created_at, nurture_stage
    from leads
    where created_at >= ${LAUNCH}
      and nurture_stage < ${NURTURE_STEPS.length}
    order by created_at
    limit 500
  `) as { id: number; email: string; created_at: string; nurture_stage: number }[]

  let sent = 0
  const failures: string[] = []

  for (const lead of leads) {
    if (sent >= MAX_SENDS_PER_RUN) break
    const ageDays = (Date.now() - new Date(lead.created_at).getTime()) / 86_400_000
    const next = NURTURE_STEPS.find((s) => s.stage === lead.nurture_stage + 1)
    if (!next || ageDays < next.afterDays) continue

    try {
      await sendNurtureStep(lead.email, next, lead.id)
      await sql`
        update leads set nurture_stage = ${next.stage}, nurture_last_at = now()
        where id = ${lead.id}
      `
      sent += 1
    } catch (err) {
      failures.push(`${lead.email}: ${(err as Error).message}`)
    }
  }

  return NextResponse.json({ considered: leads.length, sent, failures: failures.length })
}
