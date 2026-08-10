import { NextResponse } from 'next/server'
import { cleanupCaptureRateWindows, cleanupCaptureRiskDecisions } from '@/lib/db'
import {
  CAPTURE_ABUSE_CLEANUP_MAX_BATCHES,
  captureAbuseCleanupAuthorized,
  captureAbuseCleanupHasBacklog,
} from '@/lib/capture-abuse-cleanup.mjs'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  if (!captureAbuseCleanupAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let batches = 0
  let deletedWindows = 0
  let deletedUnreferencedDecisions = 0
  let remainingWindows = 0
  let remainingUnreferencedDecisions: number | null = null
  let retainedReferencedDecisions: number | null = null

  try {
    while (batches < CAPTURE_ABUSE_CLEANUP_MAX_BATCHES) {
      // These deliberately execute as separate database statements. A decision
      // cleanup failure cannot roll back already-committed rate-window cleanup.
      const windows = await cleanupCaptureRateWindows()
      remainingWindows = windows.remaining_windows
      deletedWindows += windows.deleted_windows

      const decisions = await cleanupCaptureRiskDecisions()
      batches += 1
      deletedUnreferencedDecisions += decisions.deleted_unreferenced_decisions
      remainingUnreferencedDecisions = decisions.remaining_unreferenced_decisions
      retainedReferencedDecisions = decisions.retained_referenced_decisions
      if (!captureAbuseCleanupHasBacklog({
        remaining_windows: remainingWindows,
        remaining_unreferenced_decisions: remainingUnreferencedDecisions ?? 0,
      })) break
    }
  } catch {
    console.error('[capture abuse cleanup failure]')
    return NextResponse.json({
      ok: false, batches, deleted_windows: deletedWindows,
      deleted_unreferenced_decisions: deletedUnreferencedDecisions,
      remaining_windows: remainingWindows,
      remaining_unreferenced_decisions: remainingUnreferencedDecisions,
      retained_referenced_decisions: retainedReferencedDecisions,
      backlog_remaining: null, cleanup_failed: true,
    }, { status: 500 })
  }

  const backlogRemaining = remainingWindows > 0 || (remainingUnreferencedDecisions ?? 0) > 0
  return NextResponse.json({
    ok: !backlogRemaining, batches, deleted_windows: deletedWindows,
    deleted_unreferenced_decisions: deletedUnreferencedDecisions,
    remaining_windows: remainingWindows,
    remaining_unreferenced_decisions: remainingUnreferencedDecisions,
    retained_referenced_decisions: retainedReferencedDecisions,
    backlog_remaining: backlogRemaining,
  }, { status: backlogRemaining ? 503 : 200 })
}
