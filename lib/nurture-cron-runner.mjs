const emptyMetrics = () => ({
  considered: 0,
  claimed: 0,
  accepted: 0,
  retried: 0,
  failed: 0,
  backlog: 0,
  results_enqueued: 0,
  nurture_enqueued: 0,
  nurture_eligible_without_row: 0,
  delivery_events_considered: 0,
  delivery_states_projected: 0,
})

export function isAuthorizedCronRequest(secret, authorization) {
  return Boolean(secret) && authorization === `Bearer ${secret}`
}

export async function runNurtureCron({ preflight, maxMessages, dependencies }) {
  const metrics = emptyMetrics()
  if (preflight.configurationStatus !== 'valid') {
    return {
      status: 500,
      body: {
        ...metrics,
        configuration_status: preflight.configurationStatus,
        configuration_issues: preflight.configurationIssues,
        dependency_warnings: preflight.dependencyWarnings,
      },
    }
  }

  if (!preflight.shouldRun) {
    return {
      status: 200,
      body: {
        ...metrics,
        configuration_status: 'valid_idle',
        configuration_issues: [],
        dependency_warnings: [],
      },
    }
  }

  const runId = await dependencies.createRun()
  let failureCategory = null
  try {
    if (preflight.effective.resendWebhookProject) {
      const projection = await dependencies.projectResendEvents()
      metrics.delivery_events_considered = projection.considered
      metrics.delivery_states_projected = projection.projected
    }
    metrics.results_enqueued = await dependencies.enqueueShadowResults()
    const nurtureEnqueue = await dependencies.enqueueDueNurture(preflight.effective.nurtureEnqueue)
    metrics.nurture_enqueued = nurtureEnqueue.enqueued
    metrics.nurture_eligible_without_row = nurtureEnqueue.eligibleWithoutRow
    if (metrics.nurture_eligible_without_row > 0) failureCategory = 'nurture_enqueue_invariant'
    for (const kind of ['results', 'nurture']) {
      while (metrics.claimed < maxMessages) {
        const message = await dependencies.claimNextMessage(kind)
        if (!message) break
        metrics.considered += 1
        metrics.claimed += 1
        if (message.claim_origin !== 'pending') metrics.retried += 1
        try {
          const outcome = await dependencies.dispatchClaimedMessage(message)
          if (outcome === 'accepted') metrics.accepted += 1
        } catch {
          metrics.failed += 1
        }
      }
    }
  } catch {
    failureCategory = 'invocation_failure'
  }

  try {
    metrics.backlog = await dependencies.messageBacklog()
  } catch {
    failureCategory ||= 'backlog_count_failure'
  }
  await dependencies.completeRun(runId, metrics, failureCategory)
  return {
    status: failureCategory ? 500 : 200,
    body: {
      ...metrics,
      configuration_status: 'valid',
      configuration_issues: [],
      dependency_warnings: [],
    },
  }
}
