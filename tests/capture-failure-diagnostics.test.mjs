import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  captureFailureDiagnostic,
  captureFailureHttpResponse,
  captureFailureResponse,
} from '../lib/capture-failure-diagnostics.mjs'
import { fixedCaptureErrorResponse, inputCaptureErrorResponse } from '../lib/capture-route-errors.mjs'
import {
  createFixtureAuthorization,
  FIXTURE_AUTHORIZATION_TTL_MS,
  fixtureDiagnosticAuthorization,
} from '../lib/fixture-authorization.mjs'

const phases = ['risk_claim', 'college_lookup', 'roi_compute', 'lead_insert']
const visitor = 'parent.visitor+secret@example.test'
const secret = 'db-secret-password-visitor-5551212'

for (const phase of phases) {
  test(`${phase} fault emits only fixed allowlisted diagnostic fields`, () => {
    const fault = Object.assign(new Error(`visitor=${visitor} secret=${secret}`), {
      code: '23514',
      constraint: 'leads_capture_state_check',
      cause: { visitor, secret },
      requestId: visitor,
      captureId: visitor,
      stack: `${visitor}\n${secret}`,
    })

    const diagnostic = captureFailureDiagnostic(phase, fault)
    assert.deepEqual(diagnostic, {
      event: 'capture_failure', version: 1, phase,
      sqlstate: '23514', constraint: 'leads_capture_state_check',
    })
    assert.deepEqual(Object.keys(diagnostic), ['event', 'version', 'phase', 'sqlstate', 'constraint'])
    const serialized = JSON.stringify(diagnostic)
    assert.doesNotMatch(serialized, /parent|visitor|secret|example|5551212/i)
  })

  test(`${phase} authorized fixture response has exact bounded keys and no-store disposition`, () => {
    const fault = Object.assign(new Error(`${visitor} ${secret}`), {
      code: '23514',
      constraint: 'leads_capture_state_check',
      cause: { visitor, secret },
      requestId: visitor,
      captureId: visitor,
      leadId: visitor,
      email: visitor,
      phone: '5551212',
      ip: '192.0.2.1',
      headers: { authorization: secret },
      cookie: secret,
      userAgent: visitor,
      referrer: visitor,
      utm_source: visitor,
      gclid: secret,
      url: `https://${visitor}/?secret=${secret}`,
      payload: { visitor, secret },
      database: secret,
      provider: secret,
    })
    const response = captureFailureResponse(true, phase, fault)
    assert.deepEqual(Object.keys(response), ['body', 'diagnostic', 'noStore'])
    assert.deepEqual(Object.keys(response.body), ['error', 'code', 'diagnostic'])
    assert.deepEqual(Object.keys(response.body.diagnostic), ['event', 'version', 'phase', 'sqlstate', 'constraint'])
    assert.deepEqual(response.body.diagnostic, {
      event: 'capture_failure', version: 1, phase,
      sqlstate: '23514', constraint: 'leads_capture_state_check',
    })
    assert.equal(response.noStore, true)
    assert.doesNotMatch(JSON.stringify(response), /parent|visitor|secret|example|5551212|192\.0\.2\.1/i)
  })
}

test('public and nonfixture failures retain exact current body despite body or query fixture claims', () => {
  const expected = '{"error":"Failed to capture results","code":"capture_failed"}'
  const hostile = {
    fixture: true,
    query: '?fixture=1',
    authorization: createFixtureAuthorization('test-only-admin-secret-at-least-16', 1_800_000_000_000),
    code: '23514',
    constraint: 'leads_capture_state_check',
    message: `${visitor} ${secret}`,
  }
  for (const phase of [...phases, null]) {
    const response = captureFailureResponse(false, phase, hostile)
    assert.deepEqual(Object.keys(response.body), ['error', 'code'])
    assert.equal(JSON.stringify(response.body), expected)
    assert.equal(response.diagnostic, null)
    assert.equal(response.noStore, false)
  }
})

test('diagnostic authorization rejects missing, wrong-origin, non-admin, tampered, and expired tokens', () => {
  const secretValue = 'test-only-admin-secret-at-least-16'
  const now = 1_800_000_000_000
  const token = createFixtureAuthorization(secretValue, now)
  const authorize = (overrides = {}) => fixtureDiagnosticAuthorization({
    token,
    allowedOrigin: true,
    admin: true,
    secret: secretValue,
    now: now + 1_000,
    ...overrides,
  })
  assert.equal(authorize(), true)
  assert.equal(authorize({ token: null }), false)
  assert.equal(authorize({ allowedOrigin: false }), false)
  assert.equal(authorize({ admin: false }), false)
  assert.equal(authorize({ token: `${token}x` }), false)
  assert.equal(authorize({ secret: 'different-test-only-secret-value' }), false)
  assert.equal(authorize({ now: now + FIXTURE_AUTHORIZATION_TTL_MS + 1 }), false)
})

test('hostile response error accessors cannot leak or change the public parity boundary', () => {
  const error = {}
  for (const key of ['code', 'constraint', 'message', 'stack', 'cause', 'requestId', 'captureId']) {
    Object.defineProperty(error, key, { enumerable: true, get() { throw new Error(`${secret} ${visitor}`) } })
  }
  const authorized = captureFailureResponse(true, 'risk_claim', error)
  assert.deepEqual(authorized.body, {
    error: 'Failed to capture results', code: 'capture_failed',
    diagnostic: { event: 'capture_failure', version: 1, phase: 'risk_claim' },
  })
  assert.equal(authorized.noStore, true)
  const publicResponse = captureFailureResponse(false, 'risk_claim', error)
  assert.equal(JSON.stringify(publicResponse.body), '{"error":"Failed to capture results","code":"capture_failed"}')
})

test('executable HTTP responses preserve exact public, auth, disabled, origin, and input failures', async () => {
  const assertHttp = async (response, status, body, cacheControl = null) => {
    assert.equal(response.status, status)
    assert.equal(response.headers.get('content-type'), 'application/json')
    assert.equal(response.headers.get('cache-control'), cacheControl)
    assert.equal(await response.text(), JSON.stringify(body))
  }

  await assertHttp(
    captureFailureHttpResponse(captureFailureResponse(false, 'risk_claim', new Error(secret))),
    500,
    { error: 'Failed to capture results', code: 'capture_failed' },
  )
  await assertHttp(
    fixedCaptureErrorResponse('fixture_unauthorized'),
    401,
    { error: 'Unauthorized', code: 'fixture_unauthorized' },
    'no-store',
  )
  await assertHttp(
    fixedCaptureErrorResponse('capture_disabled'),
    503,
    { error: 'Capture is temporarily unavailable', code: 'capture_disabled' },
  )
  await assertHttp(
    fixedCaptureErrorResponse('invalid_origin'),
    403,
    { error: 'Request origin is not allowed', code: 'invalid_origin' },
  )
  await assertHttp(
    inputCaptureErrorResponse('Invalid request', 'invalid_json'),
    400,
    { error: 'Invalid request', code: 'invalid_json' },
  )
})

for (const phase of phases) {
  test(`${phase} executable authorized HTTP 500 has exact body and no-store header`, async () => {
    const failure = captureFailureResponse(true, phase, Object.assign(new Error(secret), {
      code: '23514', constraint: 'leads_capture_state_check', payload: visitor,
    }))
    const response = captureFailureHttpResponse(failure)
    assert.equal(response.status, 500)
    assert.equal(response.headers.get('content-type'), 'application/json')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(await response.text(), JSON.stringify({
      error: 'Failed to capture results',
      code: 'capture_failed',
      diagnostic: {
        event: 'capture_failure', version: 1, phase,
        sqlstate: '23514', constraint: 'leads_capture_state_check',
      },
    }))
  })
}

test('each failed fixture authorization executes the unchanged unauthorized HTTP response', async () => {
  const secretValue = 'test-only-admin-secret-at-least-16'
  const now = 1_800_000_000_000
  const token = createFixtureAuthorization(secretValue, now)
  const attempts = [
    { token, allowedOrigin: false, admin: true, secret: secretValue, now },
    { token, allowedOrigin: true, admin: false, secret: secretValue, now },
    { token: `${token}x`, allowedOrigin: true, admin: true, secret: secretValue, now },
    { token, allowedOrigin: true, admin: true, secret: secretValue, now: now + FIXTURE_AUTHORIZATION_TTL_MS + 1 },
  ]
  for (const attempt of attempts) {
    assert.equal(fixtureDiagnosticAuthorization(attempt), false)
    const response = fixedCaptureErrorResponse('fixture_unauthorized')
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(await response.text(), '{"error":"Unauthorized","code":"fixture_unauthorized"}')
  }
})

test('missing fixture header remains a nonfixture public failure with exact body', async () => {
  const authorized = fixtureDiagnosticAuthorization({
    token: null,
    allowedOrigin: true,
    admin: true,
    secret: 'test-only-admin-secret-at-least-16',
  })
  assert.equal(authorized, false)
  const response = captureFailureHttpResponse(captureFailureResponse(authorized, 'lead_insert', {
    code: '23514', constraint: 'leads_capture_state_check', body: { fixture: true }, query: '?fixture=1',
  }))
  assert.equal(response.status, 500)
  assert.equal(response.headers.get('cache-control'), null)
  assert.equal(await response.text(), '{"error":"Failed to capture results","code":"capture_failed"}')
})

test('unknown database and adversarial metadata are dropped rather than reflected', () => {
  for (const error of [
    new Error(`${visitor} ${secret}`),
    { code: 'XX000', constraint: visitor, message: secret, stack: visitor },
    { code: '23514', constraint: visitor, detail: secret, table: visitor, schema: secret },
    { code: visitor, constraint: 'leads_capture_state_check' },
    null,
    visitor,
  ]) {
    const diagnostic = captureFailureDiagnostic('lead_insert', error)
    assert.deepEqual(
      diagnostic,
      error && error.code === '23514'
        ? { event: 'capture_failure', version: 1, phase: 'lead_insert', sqlstate: '23514' }
        : { event: 'capture_failure', version: 1, phase: 'lead_insert' },
    )
    assert.doesNotMatch(JSON.stringify(diagnostic), /parent|visitor|secret|example|5551212/i)
  }
})

test('hostile accessors cannot leak or break the sanitizer', () => {
  const error = {}
  Object.defineProperties(error, {
    code: { enumerable: true, get() { throw new Error(secret) } },
    constraint: { enumerable: true, get() { throw new Error(visitor) } },
  })
  assert.deepEqual(captureFailureDiagnostic('risk_claim', error), {
    event: 'capture_failure', version: 1, phase: 'risk_claim',
  })
})

test('capture route tracks exactly four named phases and logs only the structured diagnostic on bounded final failure', async () => {
  const route = await readFile(new URL('../app/api/insertEmailDocument/route.ts', import.meta.url), 'utf8')
  for (const phase of phases) assert.match(route, new RegExp(`failurePhase = '${phase}'`))
  assert.equal((route.match(/failurePhase = '/g) ?? []).length, 4)
  assert.equal((route.match(/failurePhase = null/g) ?? []).length, 4)
  const finalFailure = route.slice(route.lastIndexOf('  } catch (error) {'))
  assert.match(route, /let failurePhase: CaptureFailurePhase \| null = null/)
  assert.match(finalFailure, /console\.error\(JSON\.stringify\(failure\.diagnostic\)\)/)
  assert.equal((finalFailure.match(/console\.error\(/g) ?? []).length, 1)
  assert.doesNotMatch(finalFailure, /console\.error\([^\n]*(error|message|stack|cause|request|captureId|leadId)/i)
  assert.doesNotMatch(finalFailure, /capture failed before lead persistence|capture persistence or response unconfirmed|capture failure unobservable/)
  assert.doesNotMatch(route, /console\.error\([^\n]*,\s*error\)/)
})

test('route derives diagnostic capability before parsing only from existing fixture authorization gates', async () => {
  const route = await readFile(new URL('../app/api/insertEmailDocument/route.ts', import.meta.url), 'utf8')
  const gateStart = route.indexOf('const fixtureAuthorization')
  const gate = route.slice(gateStart, route.indexOf('  try {', gateStart))
  assert.match(gate, /fixtureAuthorization = request\.headers\.get\('x-fastrack-fixture-authorization'\)/)
  assert.match(gate, /allowedOrigin = isAllowedCaptureOrigin\(request\.headers\.get\('origin'\), request\.url\)/)
  assert.match(gate, /fixtureDiagnosticAuthorization\(\{[\s\S]*token: fixtureAuthorization,[\s\S]*allowedOrigin,[\s\S]*admin: isFixture && isAdmin\(\),[\s\S]*secret: process\.env\.ADMIN_TOKEN/)
  assert.match(gate, /if \(isFixture && !fixtureDiagnosticAuthorized\)/)
  assert.doesNotMatch(gate, /request\.(text|json)|body|searchParams|query/)
  const finalFailure = route.slice(route.lastIndexOf('  } catch (error) {'))
  assert.match(finalFailure, /captureFailureResponse\(fixtureDiagnosticAuthorized, failurePhase, error\)/)
  assert.match(finalFailure, /return captureFailureHttpResponse\(failure\)/)
})

test('route binds all existing early failure branches to executable exact response constructors', async () => {
  const route = await readFile(new URL('../app/api/insertEmailDocument/route.ts', import.meta.url), 'utf8')
  for (const kind of [
    'fixture_unauthorized', 'capture_disabled', 'invalid_origin', 'payload_too_large',
    'risk_identity_missing', 'capture_mismatch', 'invalid_college', 'rate_limited',
    'risk_unavailable',
  ]) {
    assert.match(route, new RegExp(`fixedCaptureErrorResponse\\('${kind}'\\)`))
  }
  assert.match(route, /error instanceof CaptureInputError[\s\S]*inputCaptureErrorResponse\(error\.message, error\.code\)/)
})

test('allowlisted constraint names are checked migration names and no error object is serialized', async () => {
  const [helper, migrations] = await Promise.all([
    readFile(new URL('../lib/capture-failure-diagnostics.mjs', import.meta.url), 'utf8'),
    Promise.all([
      '0002_durable_capture.sql', '0003_nurture_conversion_ledger.sql',
      '0006_capture_abuse_controls.sql', '0007_capture_abuse_business_identity.sql',
      '0008_capture_reporting_invariants.sql', '0009_capture_reporting_risk_binding.sql',
      '0010_reporting_fixture_provenance.sql',
    ].map((name) => readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8'))),
  ])
  const names = [...helper.matchAll(/^  '([a-z0-9_]+)',$/gm)].map((match) => match[1])
  const migrationSource = migrations.join('\n')
  assert.ok(names.length > 0)
  for (const name of names) assert.match(migrationSource, new RegExp(`\\b${name}\\b`))
  assert.doesNotMatch(helper, /JSON\.stringify\(error\)|String\(error\)|error\.(message|stack|cause)/)
})
