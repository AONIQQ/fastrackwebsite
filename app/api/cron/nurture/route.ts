import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { claimNextMessage, dispatchClaimedMessage, enqueueDueNurture, enqueueShadowResults, messageBacklog } from '@/lib/message-ledger'
import { projectResendEventBacklog } from '@/lib/resend-event-ledger'
import { effectiveRolloutControls, rolloutControls, rolloutDependencyWarnings } from '@/lib/rollout-controls.mjs'

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
  let deliveryEventsConsidered = 0
  let deliveryStatesProjected = 0
  let resultsEnqueued = 0
  let dependencyWarnings: readonly string[] = []

  try {
    const configuredControls = rolloutControls()
    const controls = effectiveRolloutControls(configuredControls)
    dependencyWarnings = rolloutDependencyWarnings(configuredControls)
    if (dependencyWarnings.length) {
      failureCategory = 'rollout_dependency_invalid'
    } else {
      if (controls.resendWebhookProject) {
        const projection = await projectResendEventBacklog()
        deliveryEventsConsidered = projection.considered
        deliveryStatesProjected = projection.projected
      }
      resultsEnqueued = await enqueueShadowResults()
      await enqueueDueNurture()
      for (const kind of ['results', 'nurture'] as const) {
        while (claimed < MAX_MESSAGES_PER_RUN) {
          const message = await claimNextMessage(kind)
          if (!message) break
          considered += 1
          claimed += 1
          if (message.claim_origin !== 'pending') retried += 1
          try {
            const outcome = await dispatchClaimedMessage(message)
            if (outcome === 'accepted') accepted += 1
          } catch {
            failed += 1
          }
        }
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
    {
      considered, claimed, accepted, retried, failed, backlog,
      configuration_status: dependencyWarnings.length ? 'invalid_dependencies' : 'valid',
      dependency_warnings: dependencyWarnings,
      results_enqueued: resultsEnqueued,
      delivery_events_considered: deliveryEventsConsidered,
      delivery_states_projected: deliveryStatesProjected,
    },
    { status: failureCategory ? 500 : 200 },
  )
}
