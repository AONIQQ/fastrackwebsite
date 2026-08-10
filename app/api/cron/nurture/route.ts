import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { claimNextMessage, dispatchClaimedMessage, enqueueDueNurture, messageBacklog } from '@/lib/message-ledger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_MESSAGES_PER_RUN = 80

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runKey = randomUUID()
  const run = (await sql`
    insert into nurture_runs (run_key) values (${runKey}::uuid) returning id
  `) as { id: number }[]
  let considered = 0
  let claimed = 0
  let accepted = 0
  let retried = 0
  let failed = 0
  let failureCategory: string | null = null

  try {
    await enqueueDueNurture()
    while (claimed < MAX_MESSAGES_PER_RUN) {
      const message = await claimNextMessage()
      if (!message) break
      considered += 1
      claimed += 1
      if (message.attempt_count > 1) retried += 1
      try {
        await dispatchClaimedMessage(message)
        accepted += 1
      } catch {
        failed += 1
      }
    }
  } catch {
    failureCategory = 'invocation_failure'
  }

  let backlog = 0
  try { backlog = await messageBacklog() } catch { failureCategory = failureCategory || 'backlog_count_failure' }
  await sql`
    update nurture_runs set completed_at = now(), considered = ${considered}, claimed = ${claimed},
      accepted = ${accepted}, retried = ${retried}, failed = ${failed}, backlog = ${backlog},
      failure_category = ${failureCategory}
    where id = ${run[0].id}
  `
  return NextResponse.json(
    { considered, claimed, accepted, retried, failed, backlog },
    { status: failureCategory ? 500 : 200 },
  )
}
