import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { claimNextMessage, dispatchClaimedMessage, enqueueDueNurture, enqueueShadowResults, messageBacklog } from '@/lib/message-ledger'
import { projectResendEventBacklog } from '@/lib/resend-event-ledger'
import { nurtureCronPreflight } from '@/lib/rollout-controls.mjs'
import { isAuthorizedCronRequest, runNurtureCron } from '@/lib/nurture-cron-runner.mjs'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_MESSAGES_PER_RUN = 80

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!isAuthorizedCronRequest(process.env.CRON_SECRET, auth)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runNurtureCron({
    preflight: nurtureCronPreflight(),
    maxMessages: MAX_MESSAGES_PER_RUN,
    dependencies: {
      createRun: async () => {
        const runKey = randomUUID()
        const run = (await sql`
          insert into nurture_runs (run_key) values (${runKey}::uuid) returning id
        `) as { id: number }[]
        return run[0].id
      },
      projectResendEvents: projectResendEventBacklog,
      enqueueShadowResults,
      enqueueDueNurture,
      claimNextMessage,
      dispatchClaimedMessage,
      messageBacklog,
      completeRun: async (runId: number, metrics: Record<string, number>, failureCategory: string | null) => {
        await sql`
          update nurture_runs set completed_at = now(), considered = ${metrics.considered}, claimed = ${metrics.claimed},
            accepted = ${metrics.accepted}, retried = ${metrics.retried}, failed = ${metrics.failed}, backlog = ${metrics.backlog},
            failure_category = ${failureCategory}
          where id = ${runId}
        `
      },
    },
  })
  return NextResponse.json(result.body, { status: result.status })
}
