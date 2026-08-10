export const ROLLOUT_CONTROL_NAMES = Object.freeze({
  shadowLedger: 'ROLLOUT_EMAIL_SHADOW_LEDGER_ENABLED',
  resultsEnqueue: 'ROLLOUT_RESULTS_ENQUEUE_ENABLED',
  resultsDispatch: 'ROLLOUT_RESULTS_DISPATCH_ENABLED',
  resultsRetry: 'ROLLOUT_RESULTS_RETRY_ENABLED',
  nurtureEnqueue: 'ROLLOUT_NURTURE_ENQUEUE_ENABLED',
  nurtureClaim: 'ROLLOUT_NURTURE_CLAIM_ENABLED',
  nurtureDispatch: 'ROLLOUT_NURTURE_DISPATCH_ENABLED',
  resendWebhookIngest: 'ROLLOUT_RESEND_WEBHOOK_INGEST_ENABLED',
  resendWebhookProject: 'ROLLOUT_RESEND_WEBHOOK_PROJECT_ENABLED',
  captureAcknowledgement: 'CAPTURE_ACK_ENABLED',
})

function controlState(value) {
  if (value === '1') return Object.freeze({ enabled: true, configuration: 'valid' })
  if (value === '0') return Object.freeze({ enabled: false, configuration: 'valid' })
  if (value === undefined || value === '') return Object.freeze({ enabled: false, configuration: 'missing' })
  return Object.freeze({ enabled: false, configuration: 'malformed' })
}

export function rolloutControlStatus(env = process.env) {
  return Object.freeze(Object.fromEntries(
    Object.entries(ROLLOUT_CONTROL_NAMES).map(([key, name]) => [key, controlState(env[name])]),
  ))
}

export function rolloutControls(env = process.env) {
  const status = rolloutControlStatus(env)
  return Object.freeze(Object.fromEntries(
    Object.entries(status).map(([key, value]) => [key, value.enabled]),
  ))
}

export function effectiveRolloutControls(configured) {
  const resultsEnqueue = configured.shadowLedger && configured.resultsEnqueue
  const resultsDispatch = resultsEnqueue && configured.resultsDispatch
  const nurtureClaim = configured.nurtureEnqueue && configured.nurtureClaim
  const nurtureDispatch = nurtureClaim && configured.nurtureDispatch
  const resendWebhookProject = configured.resendWebhookIngest && configured.resendWebhookProject
  return Object.freeze({
    ...configured,
    resultsEnqueue,
    resultsDispatch,
    resultsRetry: resultsDispatch && configured.resultsRetry,
    nurtureClaim,
    nurtureDispatch,
    resendWebhookProject,
    captureAcknowledgement: configured.captureAcknowledgement
      && configured.shadowLedger && resultsEnqueue,
  })
}

export function captureAcknowledgementReady(controls) {
  return effectiveRolloutControls(controls).captureAcknowledgement
}

export function captureRolloutPlan(configured, { fixture = false } = {}) {
  const effective = effectiveRolloutControls(configured)
  if (fixture) {
    return Object.freeze({
      persist: effective.shadowLedger,
      acknowledge: false,
      createShadowLedger: effective.shadowLedger,
      enqueueResults: false,
      status: effective.shadowLedger ? 202 : 503,
      code: effective.shadowLedger ? 'fixture_shadow_recorded' : 'capture_disabled',
    })
  }
  const ready = effective.captureAcknowledgement
  return Object.freeze({
    persist: ready,
    acknowledge: ready,
    createShadowLedger: ready,
    enqueueResults: ready,
    status: ready ? 200 : 503,
    code: ready ? 'capture_acknowledged' : 'capture_disabled',
  })
}

export function canClaimMessage(kind, status, controls) {
  const effective = effectiveRolloutControls(controls)
  if (kind === 'results') {
    if (!effective.resultsDispatch) return false
    return status === 'pending' || ((status === 'retryable' || status === 'claimed') && effective.resultsRetry)
  }
  if (kind === 'nurture') {
    if (!effective.nurtureDispatch) return false
    return status === 'pending' || status === 'retryable' || status === 'claimed'
  }
  return false
}

export function rolloutDependencyWarnings(controls) {
  const warnings = []
  if (controls.resultsEnqueue && !controls.shadowLedger) warnings.push('results_enqueue_requires_shadow_ledger')
  if (controls.resultsDispatch && !controls.resultsEnqueue) warnings.push('results_dispatch_requires_results_enqueue')
  if (controls.resultsRetry && !controls.resultsDispatch) warnings.push('results_retry_requires_results_dispatch')
  if (controls.nurtureClaim && !controls.nurtureEnqueue) warnings.push('nurture_claim_requires_nurture_enqueue')
  if (controls.nurtureDispatch && !controls.nurtureClaim) warnings.push('nurture_dispatch_requires_nurture_claim')
  if (controls.resendWebhookProject && !controls.resendWebhookIngest) warnings.push('resend_projection_requires_ingestion')
  if (controls.captureAcknowledgement && !captureAcknowledgementReady(controls)) warnings.push('capture_ack_requires_shadow_and_results_enqueue')
  return Object.freeze(warnings)
}

export function rolloutConfigurationStatus(env = process.env) {
  const controls = rolloutControlStatus(env)
  const configured = rolloutControls(env)
  const dependencyWarnings = rolloutDependencyWarnings(configured)
  const configurationIssues = Object.freeze(Object.entries(controls)
    .filter(([, state]) => state.configuration !== 'valid')
    .map(([key, state]) => `${key}_${state.configuration}`))
  const configurationStatus = configurationIssues.length
    ? 'invalid_configuration'
    : dependencyWarnings.length
      ? 'invalid_dependencies'
      : 'valid'

  return Object.freeze({
    controls,
    configured,
    effective: effectiveRolloutControls(configured),
    configurationStatus,
    configurationIssues,
    dependencyWarnings,
  })
}

export function nurtureCronPreflight(env = process.env) {
  const snapshot = rolloutConfigurationStatus(env)
  const shouldRun = snapshot.configurationStatus === 'valid' && [
    snapshot.effective.resultsEnqueue,
    snapshot.effective.resultsDispatch,
    snapshot.effective.resultsRetry,
    snapshot.effective.nurtureEnqueue,
    snapshot.effective.nurtureClaim,
    snapshot.effective.nurtureDispatch,
    snapshot.effective.resendWebhookProject,
  ].some(Boolean)
  return Object.freeze({ ...snapshot, shouldRun })
}

export function publicRolloutStatus(env = process.env) {
  const snapshot = rolloutConfigurationStatus(env)
  return Object.freeze({
    controls: Object.freeze(Object.fromEntries(
      Object.entries(snapshot.controls).map(([key, value]) => [key, Object.freeze({
        ...value,
        effective: snapshot.effective[key],
      })]),
    )),
    configuration_status: snapshot.configurationStatus,
    configuration_issues: snapshot.configurationIssues,
    dependency_status: snapshot.dependencyWarnings.length ? 'invalid' : 'valid',
    dependency_warnings: snapshot.dependencyWarnings,
  })
}
