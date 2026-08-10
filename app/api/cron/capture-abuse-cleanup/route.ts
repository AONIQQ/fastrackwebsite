import { NextResponse } from 'next/server'
import { cleanupCaptureAbuseState } from '@/lib/db'
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
  let deletedDecisions = 0
  let remainingWindows = 0
  let remainingDecisions = 0

  try {
    while (batches < CAPTURE_ABUSE_CLEANUP_MAX_BATCHES) {
      const result = await cleanupCaptureAbuseState()
      batches += 1
      deletedWindows += result.deleted_windows
      deletedDecisions += result.deleted_decisions
      remainingWindows = result.remaining_windows
      remainingDecisions = result.remaining_decisions
      if (!captureAbuseCleanupHasBacklog(result)) break
    }
  } catch {
    console.error('[capture abuse cleanup failure]')
    return NextResponse.json({
      ok: false, batches, deleted_windows: deletedWindows,
      deleted_decisions: deletedDecisions, remaining_windows: remainingWindows,
      remaining_decisions: remainingDecisions, backlog_remaining: true,
    }, { status: 500 })
  }

  const backlogRemaining = remainingWindows > 0 || remainingDecisions > 0
  return NextResponse.json({
    ok: !backlogRemaining, batches, deleted_windows: deletedWindows,
    deleted_decisions: deletedDecisions, remaining_windows: remainingWindows,
    remaining_decisions: remainingDecisions, backlog_remaining: backlogRemaining,
  }, { status: backlogRemaining ? 503 : 200 })
}
