import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { claimable } from '../lib/message-policy.mjs'
import {
  ROLLOUT_CONTROL_NAMES,
  canClaimMessage,
  captureRolloutPlan,
  captureAcknowledgementReady,
  effectiveRolloutControls,
  nurtureCronPreflight,
  publicRolloutStatus,
  rolloutConfigurationStatus,
  rolloutControls,
  rolloutDependencyWarnings,
} from '../lib/rollout-controls.mjs'
import { isAuthorizedCronRequest, runNurtureCron } from '../lib/nurture-cron-runner.mjs'

const allEnabled = () => Object.fromEntries(Object.keys(ROLLOUT_CONTROL_NAMES).map((key) => [key, true]))

test('every rollout control is exact-on and fails closed when missing or malformed', () => {
  const empty = rolloutControls({})
  assert.deepEqual(Object.values(empty), Object.values(empty).map(() => false))

  for (const [key, name] of Object.entries(ROLLOUT_CONTROL_NAMES)) {
    const enabled = rolloutControls({ [name]: '1' })
    assert.equal(enabled[key], true, name)
    assert.equal(Object.entries(enabled).filter(([, value]) => value).length, 1)
    for (const malformed of ['true', 'yes', '01', ' 1 ', '2']) {
      assert.equal(rolloutControls({ [name]: malformed })[key], false, `${name}=${malformed}`)
    }
    assert.equal(rolloutControls({ [name]: '0' })[key], false)
  }
})

test('control status reveals only enabled and configuration classification', () => {
  const explicitOff = Object.fromEntries(Object.values(ROLLOUT_CONTROL_NAMES).map((name) => [name, '0']))
  const status = publicRolloutStatus({
    ...explicitOff,
    [ROLLOUT_CONTROL_NAMES.shadowLedger]: '1',
    [ROLLOUT_CONTROL_NAMES.resultsEnqueue]: 'not-valid',
  })
  assert.deepEqual(status.controls.shadowLedger, { enabled: true, configuration: 'valid', effective: true })
  assert.deepEqual(status.controls.resultsEnqueue, { enabled: false, configuration: 'malformed', effective: false })
  assert.equal(status.configuration_status, 'invalid_configuration')
  assert.deepEqual(status.configuration_issues, ['resultsEnqueue_malformed'])
  assert.equal(status.dependency_status, 'valid')
  assert.equal(JSON.stringify(status).includes('not-valid'), false)
})

test('cron preflight classifies every raw control before execution', () => {
  const explicitOff = Object.fromEntries(Object.values(ROLLOUT_CONTROL_NAMES).map((name) => [name, '0']))
  const valid = nurtureCronPreflight(explicitOff)
  assert.equal(valid.configurationStatus, 'valid')
  assert.equal(valid.shouldRun, false)
  assert.deepEqual(valid.configurationIssues, [])

  const missing = rolloutConfigurationStatus({})
  assert.equal(missing.configurationStatus, 'invalid_configuration')
  assert.equal(missing.configurationIssues.length, 10)
  assert.ok(missing.configurationIssues.every((issue) => issue.endsWith('_missing')))

  const malformed = rolloutConfigurationStatus({
    ...explicitOff,
    [ROLLOUT_CONTROL_NAMES.resultsEnqueue]: 'enabled',
  })
  assert.equal(malformed.configurationStatus, 'invalid_configuration')
  assert.deepEqual(malformed.configurationIssues, ['resultsEnqueue_malformed'])

  const incoherent = rolloutConfigurationStatus({
    ...explicitOff,
    [ROLLOUT_CONTROL_NAMES.resultsEnqueue]: '1',
  })
  assert.equal(incoherent.configurationStatus, 'invalid_dependencies')
  assert.deepEqual(incoherent.dependencyWarnings, ['results_enqueue_requires_shadow_ledger'])
})

test('cron authorization preserves exact nonempty bearer-secret semantics', () => {
  assert.equal(isAuthorizedCronRequest(undefined, null), false)
  assert.equal(isAuthorizedCronRequest('', 'Bearer '), false)
  assert.equal(isAuthorizedCronRequest('cron-secret', null), false)
  assert.equal(isAuthorizedCronRequest('cron-secret', 'cron-secret'), false)
  assert.equal(isAuthorizedCronRequest('cron-secret', 'Bearer wrong'), false)
  assert.equal(isAuthorizedCronRequest('cron-secret', 'Bearer cron-secret'), true)
})

test('nurture cron runs across daytime Eastern hours instead of delaying due work until the next day', async () => {
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const schedules = vercel.crons.filter((cron) => cron.path === '/api/cron/nurture')
  assert.deepEqual(schedules, [{ path: '/api/cron/nurture', schedule: '0 13-22/3 * * *' }])
})

test('invalid and idle cron preflights invoke no database, queue, projection, claim, or dispatch dependency', async () => {
  const explicitOff = Object.fromEntries(Object.values(ROLLOUT_CONTROL_NAMES).map((name) => [name, '0']))
  const makeDependencies = () => {
    const calls = Object.fromEntries([
      'createRun', 'projectResendEvents', 'enqueueShadowResults', 'enqueueDueNurture',
      'claimNextMessage', 'dispatchClaimedMessage', 'messageBacklog', 'completeRun',
    ].map((name) => [name, 0]))
    const called = (name, result) => async () => { calls[name] += 1; return result }
    return {
      calls,
      dependencies: {
        createRun: called('createRun', 1),
        projectResendEvents: called('projectResendEvents', { considered: 0, projected: 0 }),
        enqueueShadowResults: called('enqueueShadowResults', 0),
        enqueueDueNurture: called('enqueueDueNurture'),
        claimNextMessage: called('claimNextMessage', null),
        dispatchClaimedMessage: called('dispatchClaimedMessage', 'accepted'),
        messageBacklog: called('messageBacklog', 0),
        completeRun: called('completeRun'),
      },
    }
  }
  const cases = [
    ['missing', {}],
    ['malformed root', { ...explicitOff, [ROLLOUT_CONTROL_NAMES.shadowLedger]: 'yes' }],
    ['malformed dependency', { ...explicitOff, [ROLLOUT_CONTROL_NAMES.resultsEnqueue]: 'yes' }],
    ['incoherent dependency', { ...explicitOff, [ROLLOUT_CONTROL_NAMES.resultsEnqueue]: '1' }],
    ['explicit all off', explicitOff],
  ]
  for (const [label, env] of cases) {
    const { calls, dependencies } = makeDependencies()
    const result = await runNurtureCron({
      preflight: nurtureCronPreflight(env),
      maxMessages: 80,
      dependencies,
    })
    assert.deepEqual(Object.values(calls), Object.values(calls).map(() => 0), label)
    assert.equal(result.status, label === 'explicit all off' ? 200 : 500, label)
    assert.equal(result.body.configuration_status, label === 'explicit all off' ? 'valid_idle'
      : label === 'incoherent dependency' ? 'invalid_dependencies' : 'invalid_configuration', label)
    assert.equal(result.body.considered, 0, label)
    assert.equal(result.body.claimed, 0, label)
    assert.equal(result.body.accepted, 0, label)
  }
})

test('valid cron configuration preserves the bounded operational path', async () => {
  const env = Object.fromEntries(Object.values(ROLLOUT_CONTROL_NAMES).map((name) => [name, '1']))
  const calls = []
  const result = await runNurtureCron({
    preflight: nurtureCronPreflight(env),
    maxMessages: 80,
    dependencies: {
      createRun: async () => { calls.push('create'); return 7 },
      projectResendEvents: async () => { calls.push('project'); return { considered: 2, projected: 1 } },
      enqueueShadowResults: async () => { calls.push('promote'); return 3 },
      enqueueDueNurture: async () => { calls.push('enqueue') },
      claimNextMessage: async (kind) => { calls.push(`claim:${kind}`); return null },
      dispatchClaimedMessage: async () => { calls.push('dispatch'); return 'accepted' },
      messageBacklog: async () => { calls.push('backlog'); return 4 },
      completeRun: async (id) => { calls.push(`complete:${id}`) },
    },
  })
  assert.equal(result.status, 200)
  assert.equal(result.body.configuration_status, 'valid')
  assert.deepEqual(calls, ['create', 'project', 'promote', 'enqueue', 'claim:results', 'claim:nurture', 'backlog', 'complete:7'])
  assert.equal(result.body.results_enqueued, 3)
  assert.equal(result.body.backlog, 4)
})

test('capture acknowledgement requires durable shadow creation and results enqueue', () => {
  const controls = allEnabled()
  assert.equal(captureAcknowledgementReady(controls), true)
  for (const key of ['captureAcknowledgement', 'shadowLedger', 'resultsEnqueue']) {
    assert.equal(captureAcknowledgementReady({ ...controls, [key]: false }), false, key)
  }
})

test('capture rollout makes fixture shadow reachable while public persistence stays atomic with acknowledgement', () => {
  const stopped = rolloutControls({})
  assert.deepEqual(captureRolloutPlan(stopped), {
    persist: false, acknowledge: false, createShadowLedger: false,
    enqueueResults: false, status: 503, code: 'capture_disabled',
  })
  assert.deepEqual(captureRolloutPlan(stopped, { fixture: true }), {
    persist: false, acknowledge: false, createShadowLedger: false,
    enqueueResults: false, status: 503, code: 'capture_disabled',
  })

  const shadowOnly = { ...stopped, shadowLedger: true }
  assert.deepEqual(captureRolloutPlan(shadowOnly), {
    persist: false, acknowledge: false, createShadowLedger: false,
    enqueueResults: false, status: 503, code: 'capture_disabled',
  })
  assert.deepEqual(captureRolloutPlan(shadowOnly, { fixture: true }), {
    persist: true, acknowledge: false, createShadowLedger: true,
    enqueueResults: false, status: 202, code: 'fixture_shadow_recorded',
  })

  const promotedStage = { ...shadowOnly, resultsEnqueue: true }
  assert.equal(captureRolloutPlan(promotedStage).persist, false)
  assert.equal(captureRolloutPlan(promotedStage, { fixture: true }).enqueueResults, false)

  const publicReady = { ...promotedStage, captureAcknowledgement: true }
  assert.deepEqual(captureRolloutPlan(publicReady), {
    persist: true, acknowledge: true, createShadowLedger: true,
    enqueueResults: true, status: 200, code: 'capture_acknowledged',
  })
  assert.equal(captureRolloutPlan(publicReady, { fixture: true }).acknowledge, false)
  assert.equal(captureRolloutPlan(publicReady, { fixture: true }).enqueueResults, false)
})

test('effective dependency graph makes every partial transition fail closed', () => {
  const stopped = rolloutControls({})
  const cases = [
    ['results enqueue', { resultsEnqueue: true }, 'resultsEnqueue'],
    ['results dispatch', { resultsDispatch: true }, 'resultsDispatch'],
    ['results dispatch without shadow', { resultsEnqueue: true, resultsDispatch: true }, 'resultsDispatch'],
    ['results retry', { resultsRetry: true }, 'resultsRetry'],
    ['nurture claim', { nurtureClaim: true }, 'nurtureClaim'],
    ['nurture dispatch', { nurtureClaim: true, nurtureDispatch: true }, 'nurtureDispatch'],
    ['Resend projection', { resendWebhookProject: true }, 'resendWebhookProject'],
  ]
  for (const [label, patch, key] of cases) {
    assert.equal(effectiveRolloutControls({ ...stopped, ...patch })[key], false, label)
  }

  const safe = effectiveRolloutControls({
    ...stopped,
    shadowLedger: true, resultsEnqueue: true, resultsDispatch: true, resultsRetry: true,
    nurtureEnqueue: true, nurtureClaim: true, nurtureDispatch: true,
    resendWebhookIngest: true, resendWebhookProject: true,
  })
  for (const key of [
    'resultsEnqueue', 'resultsDispatch', 'resultsRetry',
    'nurtureEnqueue', 'nurtureClaim', 'nurtureDispatch',
    'resendWebhookIngest', 'resendWebhookProject',
  ]) assert.equal(safe[key], true, key)
})

test('dependency warnings describe every unsafe staged transition', () => {
  assert.deepEqual(rolloutDependencyWarnings({ ...rolloutControls({}), resultsEnqueue: true }), [
    'results_enqueue_requires_shadow_ledger',
  ])
  assert.deepEqual(rolloutDependencyWarnings({ ...rolloutControls({}), resultsDispatch: true }), [
    'results_dispatch_requires_results_enqueue',
  ])
  assert.deepEqual(rolloutDependencyWarnings({ ...rolloutControls({}), resultsRetry: true }), [
    'results_retry_requires_results_dispatch',
  ])
  assert.deepEqual(rolloutDependencyWarnings({ ...rolloutControls({}), nurtureClaim: true }), [
    'nurture_claim_requires_nurture_enqueue',
  ])
  assert.deepEqual(rolloutDependencyWarnings({ ...rolloutControls({}), nurtureDispatch: true }), [
    'nurture_dispatch_requires_nurture_claim',
  ])
  assert.deepEqual(rolloutDependencyWarnings({ ...rolloutControls({}), resendWebhookProject: true }), [
    'resend_projection_requires_ingestion',
  ])
})

test('results initial dispatch and retries are independently controlled', () => {
  const stopped = rolloutControls({})
  assert.equal(canClaimMessage('results', 'pending', stopped), false)
  assert.equal(canClaimMessage('results', 'retryable', stopped), false)

  const initialOnly = { ...stopped, shadowLedger: true, resultsEnqueue: true, resultsDispatch: true }
  assert.equal(canClaimMessage('results', 'pending', initialOnly), true)
  assert.equal(canClaimMessage('results', 'retryable', initialOnly), false)
  assert.equal(canClaimMessage('results', 'claimed', initialOnly), false)

  const recovery = { ...initialOnly, resultsRetry: true }
  assert.equal(canClaimMessage('results', 'retryable', recovery), true)
  assert.equal(canClaimMessage('results', 'claimed', recovery), true)
})

test('nurture never claims unless claim and dispatch controls both permit a send', () => {
  const stopped = rolloutControls({})
  for (const status of ['pending', 'retryable', 'claimed']) {
    assert.equal(canClaimMessage('nurture', status, { ...stopped, nurtureClaim: true }), false)
    assert.equal(canClaimMessage('nurture', status, { ...stopped, nurtureDispatch: true }), false)
    assert.equal(canClaimMessage('nurture', status, { ...stopped, nurtureEnqueue: true, nurtureClaim: true, nurtureDispatch: true }), true)
  }
})

test('stopping claims preserves leases until expiry and permits recovery only after re-enable', () => {
  const now = 10_000
  const enabled = { ...rolloutControls({}), nurtureEnqueue: true, nurtureClaim: true, nurtureDispatch: true }
  const stopped = { ...enabled, nurtureClaim: false }
  const mayClaim = (controls, expiry) => canClaimMessage('nurture', 'claimed', controls)
    && claimable('claimed', now, now, expiry)

  assert.equal(mayClaim(enabled, now + 1), false)
  assert.equal(mayClaim(stopped, now), false)
  assert.equal(mayClaim(enabled, now), true)
})

test('source binds each control to its state-changing boundary and aggregate-only status', async () => {
  const [route, db, ledger, cron, webhook, providerLedger, statusRoute, status, migration] = await Promise.all([
    readFile(new URL('../app/api/insertEmailDocument/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/db.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/message-ledger.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/cron/nurture/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/webhooks/resend/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/resend-event-ledger.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/rollout-status/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/rollout-status.ts', import.meta.url), 'utf8'),
    readFile(new URL('../db/migrations/0011_email_rollout_controls.sql', import.meta.url), 'utf8'),
  ])
  assert.match(route, /captureRolloutPlan\(configuredControls, \{ fixture: isFixture \}\)/)
  assert.match(route, /createShadowLedger: capturePlan\.createShadowLedger/)
  assert.match(route, /enqueueResults: capturePlan\.enqueueResults/)
  assert.match(route, /isFixture[\s\S]*fixture_shadow_recorded/)
  assert.doesNotMatch(route, /fixture_shadow_recorded[\s\S]{0,300}\broi\b/)
  assert.match(db, /where \$\{lead\.createShadowLedger\}/)
  assert.match(db, /rollout_dispatch_eligible[\s\S]*\$\{lead\.enqueueResults\}/)
  assert.match(db, /blocked_fixture as materialized[\s\S]*where not exists \(select 1 from blocked_fixture\)/)
  assert.match(db, /result_message as \([\s\S]*from message_work[\s\S]*union all[\s\S]*from email_messages/)
  assert.match(db, /fixture_blocked/)
  assert.match(ledger, /canClaimMessage\(kind, 'pending', controls\)/)
  assert.match(ledger, /coalesce\(m\.rollout_dispatch_eligible, true\)/)
  assert.match(ledger, /if \(!controls\.nurtureEnqueue\) return 0/)
  assert.match(ledger, /enqueueShadowResults[\s\S]*effectiveControls\(\)[\s\S]*if \(!controls\.resultsEnqueue\) return 0[\s\S]*for update skip locked/)
  assert.match(cron, /preflight: nurtureCronPreflight\(\)/)
  assert.match(cron, /createRun:[\s\S]*projectResendEvents:[\s\S]*enqueueShadowResults[\s\S]*claimNextMessage[\s\S]*dispatchClaimedMessage/)
  assert.ok(cron.indexOf('isAuthorizedCronRequest(process.env.CRON_SECRET, auth)') < cron.indexOf('runNurtureCron({'))
  assert.match(webhook, /ingestionEnabled: controls\.resendWebhookIngest/)
  assert.match(webhook, /projectionEnabled: controls\.resendWebhookProject/)
  assert.match(providerLedger, /projectResendEventBacklog[\s\S]*candidate_events[\s\S]*limit \$\{boundedLimit\}/)
  assert.match(statusRoute, /if \(!isAdmin\(\)\)/)
  assert.match(statusRoute, /Cache-Control': 'no-store'/)
  assert.doesNotMatch(status, /select[\s\S]*(?:lead_row\.email|lead_row\.phone|provider_message_id|provider_event_id|tracking_id|claim_token)/i)
  assert.match(status, /fixture_ineligible/)
  assert.match(status, /genuine_ineligible/)
  assert.match(migration, /add column if not exists rollout_dispatch_eligible boolean default true/)
})
