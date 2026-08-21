import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { classifyFunnelHealth } from '../lib/funnel-health-classifier.mjs'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('funnel health classifications are deterministic and bounded', async () => {
  const source = await read('../lib/funnel-health-classifier.mjs')
  assert.match(source, /cronWarningHours: 25/)
  assert.match(source, /cronCriticalHours: 36/)
  assert.match(source, /resultsDueWarningMinutes: 15/)
  assert.match(source, /resultsDueCriticalMinutes: 120/)
  assert.match(source, /persistenceUncertainCritical: 1/)
  assert.match(source, /captureRejectionMinimumAttempts: 5/)
  assert.match(source, /captureRejectionWarningRatio: 0\.5/)
  assert.match(source, /overall: maxLevel\(Object\.values\(components\)\)/)
  const now = new Date('2026-08-13T18:00:00.000Z')
  const ready = {
    controlsReady: true, smsEnabled: false, smsConfigurationValid: true, stripeSnapshotFresh: true, whopReady: false,
    cronCompletedAt: '2026-08-13T15:00:00.000Z', cronFailed: false,
    dueResultsOldestHours: null, dueNurtureOldestHours: null, expiredLeases: 0, projectionBacklog: 0,
    unmatchedCallbacks24h: 0,
    persistenceUncertain24h: 0, attempts24h: 0, accepted24h: 0, deduplicated24h: 0, rejected24h: 0,
    resultsTerminalFailures: 0, nurtureTerminalFailures: 0, retryableMessages: 0,
    providerComplaints7d: 0, providerFailures7d: 0,
  }
  assert.equal(classifyFunnelHealth(ready, now).overall, 'WARNING')
  assert.equal(classifyFunnelHealth(ready, now).components.controls, 'READY')
  assert.equal(classifyFunnelHealth(ready, now).components.whop_instrumentation, 'WARNING')
  assert.equal(classifyFunnelHealth({ ...ready, whopReady: true }, now).components.whop_instrumentation, 'READY')
  assert.equal(classifyFunnelHealth({ ...ready, smsEnabled: true }, now).overall, 'WARNING')
  assert.equal(classifyFunnelHealth({ ...ready, persistenceUncertain24h: 1 }, now).overall, 'CRITICAL')
  assert.equal(classifyFunnelHealth({ ...ready, controlsReady: false }, now).components.controls, 'CRITICAL')
  assert.equal(classifyFunnelHealth({ ...ready, dueResultsOldestHours: 0.25 }, now).components.queues, 'WARNING')
  assert.equal(classifyFunnelHealth({ ...ready, dueResultsOldestHours: 2 }, now).components.queues, 'CRITICAL')
  assert.equal(classifyFunnelHealth({ ...ready, resultsTerminalFailures: 1 }, now).components.message_failures, 'CRITICAL')
  assert.equal(classifyFunnelHealth({ ...ready, nurtureTerminalFailures: 1 }, now).components.message_failures, 'WARNING')
  assert.equal(classifyFunnelHealth({ ...ready, retryableMessages: 1 }, now).components.message_failures, 'WARNING')
  assert.equal(classifyFunnelHealth({ ...ready, unmatchedCallbacks24h: 1 }, now).components.resend_callbacks, 'WARNING')
})

test('report is fixed aggregate-only and excludes identity columns', async () => {
  const source = await read('../lib/funnel-health.ts')
  const route = await read('../app/api/admin/funnel-health/route.ts')
  const vercel = JSON.parse(await read('../vercel.json'))
  assert.match(route, /if \(!isAdmin\(\)\)/)
  assert.match(route, /Cache-Control': 'no-store/)
  assert.match(source, /assertFunnelHealthReport/)
  assert.match(source, /WHOP_RUNTIME_PROOF_MODE !== '1'/)
  assert.doesNotMatch(source, /select[\s\S]{0,300}\b(email|phone|recipient|subject|provider_message_id|provider_event_id|tracking_id|claim_token|capture_id)\b/i)
  assert.match(source, /is_fixture = false/)
  assert.match(source, /INSTRUMENTED/)
  assert.doesNotThrow(() => {
    const sourceText = JSON.stringify({ events_24h: [
      { event_type: 'rejected', reason_code: 'invalid_email', count: 1 },
      { event_type: 'rejected', reason_code: 'email_limit', count: 1 },
    ] })
    const forbiddenKey = /@|"(?:email|phone|recipient|subject|body|payload|provider_message_id|provider_event_id|tracking_id|claim_token|capture_id|lead_id)"\s*:/i
    if (forbiddenKey.test(sourceText)) throw new Error('false positive')
  })
  assert.match(source, /cronCompletedAt: typeof latestSuccessfulRun\?\.completed_at/)
  assert.match(source, /cronFailed: Boolean\(latestRun && \(latestRun\.failure_category/)
  assert.match(source, /from nurture_runs where failure_category is not null or failed > 0/)
  assert.doesNotMatch(source, /from nurture_runs where completed_at is null or failure_category/)
  const nurtureSchedule = vercel.crons.find((entry) => entry.path === '/api/cron/nurture')?.schedule
  assert.equal(nurtureSchedule, '0 13-22/3 * * *')
  assert.ok(source.includes(`schedule_utc: '${nurtureSchedule}'`))
})

test('panel is prominent, accessible, and renders every required risk domain', async () => {
  const [page, panel] = await Promise.all([
    read('../app/admin/leads/page.tsx'), read('../app/admin/leads/FunnelHealthPanel.tsx'),
  ])
  assert.match(page, /<FunnelHealthPanel report=\{health\}/)
  assert.match(panel, /aria-labelledby="funnel-health-heading"/)
  for (const label of ['Customer funnel health', 'Capture and controls', 'Cron, queues, and delivery', 'Payments', 'Whop:', 'Queue age detail']) {
    assert.ok(panel.includes(label), label)
  }
})

test('Stripe coverage is an explicit fixed server-side snapshot, never a page-load provider call', async () => {
  const source = await read('../lib/funnel-health.ts')
  assert.match(source, /registration_status: 'VERIFIED_SNAPSHOT'/)
  for (const event of ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed']) {
    assert.ok(source.includes(event), event)
  }
  assert.doesNotMatch(source, /fetch\(|new Stripe|stripe\./)
})

test('Whop health contract reports the exact live V1 underscore events', async () => {
  const source = await read('../lib/funnel-health.ts')
  const contract = source.slice(source.indexOf('export const WHOP_WEBHOOK_CONTRACT'), source.indexOf('type QueueRow'))
  for (const event of ['payment_succeeded', 'payment_failed', 'refund_created', 'refund_updated', 'dispute_created', 'dispute_updated']) {
    assert.ok(contract.includes(event), event)
  }
  for (const legacy of ['payment.succeeded', 'payment.failed', 'refund.created', 'refund.updated', 'dispute.created', 'dispute.updated']) {
    assert.equal(contract.includes(legacy), false, legacy)
  }
})
