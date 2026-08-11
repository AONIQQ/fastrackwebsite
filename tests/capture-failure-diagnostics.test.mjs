import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { captureFailureDiagnostic } from '../lib/capture-failure-diagnostics.mjs'

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
}

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
  assert.match(finalFailure, /console\.error\(JSON\.stringify\(diagnostic\)\)/)
  assert.equal((finalFailure.match(/console\.error\(/g) ?? []).length, 1)
  assert.doesNotMatch(finalFailure, /console\.error\([^\n]*(error|message|stack|cause|request|captureId|leadId)/i)
  assert.doesNotMatch(finalFailure, /capture failed before lead persistence|capture persistence or response unconfirmed|capture failure unobservable/)
  assert.doesNotMatch(route, /console\.error\([^\n]*,\s*error\)/)
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
