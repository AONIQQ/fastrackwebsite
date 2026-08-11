import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { neon, neonConfig } from '@neondatabase/serverless'

const here = path.dirname(fileURLToPath(import.meta.url))
const project = path.resolve(here, '..')
const pg17 = '/opt/homebrew/opt/postgresql@17/bin'
const binaries = ['initdb', 'pg_ctl', 'psql'].map((name) => path.join(pg17, name))
const available = binaries.every((binary) => spawnSync(binary, ['--version'], { stdio: 'ignore' }).status === 0)

function extractTemplateBody(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `missing production SQL start marker: ${startMarker}`)
  const bodyStart = start + startMarker.length
  const end = source.indexOf(endMarker, bodyStart)
  assert.notEqual(end, -1, `missing production SQL end marker: ${endMarker}`)
  return source.slice(bodyStart, end)
}

function parameterize(template) {
  let query = ''
  const expressions = []
  for (let index = 0; index < template.length;) {
    if (template[index] !== '$' || template[index + 1] !== '{') {
      query += template[index++]
      continue
    }
    let cursor = index + 2
    let depth = 1
    let quote = null
    while (cursor < template.length && depth) {
      const character = template[cursor]
      if (quote) {
        if (character === '\\') cursor += 2
        else {
          if (character === quote) quote = null
          cursor++
        }
        continue
      }
      if (character === "'" || character === '"' || character === '`') quote = character
      else if (character === '{') depth++
      else if (character === '}') depth--
      cursor++
    }
    assert.equal(depth, 0, 'unterminated production interpolation')
    expressions.push(template.slice(index + 2, cursor - 1).trim())
    query += `$${expressions.length}`
    index = cursor
  }
  return { query, expressions }
}

const source = readFileSync(path.join(project, 'app', 'api', 'webhooks', 'stripe', 'route.ts'), 'utf8')
const checkout = parameterize(extractTemplateBody(
  source,
  'await sql`\n      with incoming as (',
  '\n    `\n    if (paymentIntent)',
))
checkout.query = `with incoming as (${checkout.query}`
const reconcile = parameterize(extractTemplateBody(
  source,
  'await sql`\n    with refund_per_charge as (',
  '\n  `\n}',
))
reconcile.query = `with refund_per_charge as (${reconcile.query}`

function checkoutParams(overrides = {}) {
  const fixture = {
    event: { id: 'evt-checkout', type: 'checkout.session.completed', created: 1_800_000_000 },
    object: { id: 'cs-checkout', payment_intent: 'pi-checkout', amount_total: 49_700, mode: 'payment', payment_status: 'unpaid' },
    paymentIntent: 'pi-checkout', state: 'pending', trackingId: '10000000-0000-4000-8000-000000000001',
    step: 'results', nurtureStage: null, checkoutEmail: 'fixture@example.invalid', rawReference: 'signed-fixture-token', invalidOutcome: null,
    ...overrides,
  }
  const values = {
    'event.id': fixture.event.id,
    'event.type': fixture.event.type,
    'object.id ?? null': fixture.object.id ?? null,
    paymentIntent: fixture.paymentIntent,
    'object.amount_total ?? null': fixture.object.amount_total ?? null,
    state: fixture.state,
    'event.created': fixture.event.created,
    'claims?.trackingId ?? null': fixture.trackingId,
    'claims?.step ?? null': fixture.step,
    nurtureStage: fixture.nurtureStage,
    checkoutEmail: fixture.checkoutEmail,
    'rawReference || null': fixture.rawReference || null,
    invalidOutcome: fixture.invalidOutcome,
    'JSON.stringify({ mode: object.mode, payment_status: object.payment_status })': JSON.stringify({ mode: fixture.object.mode, payment_status: fixture.object.payment_status }),
  }
  return checkout.expressions.map((expression) => {
    assert.ok(Object.hasOwn(values, expression), `unmapped production interpolation: ${expression}`)
    return values[expression]
  })
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replaceAll("'", "''")}'`
}

test('installed Neon driver sends explicit types for both standalone nullable checkout predicates', async () => {
  const previousFetch = neonConfig.fetchFunction
  let requestBody
  neonConfig.fetchFunction = async (_url, init) => {
    requestBody = JSON.parse(init.body)
    return new Response(JSON.stringify({ fields: [], rows: [], rowCount: 0, command: 'SELECT' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  try {
    const driver = neon('postgresql://user:password@example.neon.tech/database')
    const params = checkoutParams()
    await driver.query(checkout.query, params)
    assert.equal(requestBody.query, checkout.query)
    assert.deepEqual(requestBody.params, params.map((value) => typeof value === 'number' ? String(value) : value))
    assert.match(requestBody.query, /\$10::integer is not null/)
    assert.match(requestBody.query, /\$20::text is not null/)
    assert.equal((requestBody.query.match(/\$\d+/g) ?? []).length, checkout.expressions.length)
  } finally {
    neonConfig.fetchFunction = previousFetch
  }
})

test('PostgreSQL 17 rejects the pre-fix checkout wire shape and executes paid-only monotonic fixture-safe reconciliation', {
  skip: available ? false : 'PostgreSQL 17 binaries unavailable', timeout: 40_000,
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-pg-stripe-'))
  const data = path.join(root, 'data')
  const socket = mkdtempSync('/tmp/ft-sc-')
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  const env = { ...process.env, PGHOST: socket, PGPORT: String(port), PGDATABASE: 'postgres' }
  const run = (sql, succeeds = true) => {
    const result = spawnSync(binaries[2], ['-v', 'ON_ERROR_STOP=1', '--set=VERBOSITY=verbose', '-X', '-qAt', '-c', sql], { env, encoding: 'utf8' })
    if (succeeds) assert.equal(result.status, 0, result.stderr)
    else assert.notEqual(result.status, 0)
    return result
  }
  const execute = (name, query, values) => run(`prepare ${name} as ${query}; execute ${name}(${values.map(sqlLiteral).join(',')});`)

  try {
    execFileSync(binaries[0], ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' })
    execFileSync(binaries[1], ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-w', 'start'], { stdio: 'ignore' })
    run(`
      create table leads (id bigint primary key, email text not null);
      create table email_messages (id bigint primary key, lead_id bigint not null references leads(id), kind text not null, nurture_stage integer, is_fixture boolean not null);
      create table email_message_identities (tracking_id uuid primary key, email_message_id bigint not null references email_messages(id));
      create table stripe_events (
        event_id text primary key, event_type text not null, object_id text, payment_intent text, amount_cents integer, state text,
        provider_created_at timestamptz not null, outcome text not null, applied_at timestamptz
      );
      create table sales (
        id bigserial primary key, stripe_event_id text not null, checkout_session_id text, payment_intent text, email text, amount_cents integer,
        client_reference_id text, email_message_id bigint, lead_id bigint, touch_ref text, attribution_outcome text, payment_state text, paid_at timestamptz,
        refunded_cents integer not null default 0, dispute_state text, disputed_cents integer not null default 0, is_fixture boolean not null default false,
        raw jsonb, updated_at timestamptz not null
      );
      create unique index sales_checkout_session_unique on sales(checkout_session_id) where checkout_session_id is not null;
      insert into leads values (1, 'fixture@example.invalid'), (2, 'ordinary@example.invalid');
      insert into email_messages values (11, 1, 'results', null, true), (12, 2, 'nurture', 3, false);
      insert into email_message_identities values
        ('10000000-0000-4000-8000-000000000001', 11), ('20000000-0000-4000-8000-000000000002', 12);
    `)

    const preFix = checkout.query.replace('::integer is not null', ' is not null').replace('::text is not null', ' is not null')
    const rejected = run(`prepare checkout_pre_fix as ${preFix};`, false)
    assert.match(rejected.stderr, /42P18/)

    execute('checkout_fixed', checkout.query, checkoutParams())
    assert.equal(run("select payment_state || '|' || (paid_at is null)::text || '|' || is_fixture::text from sales where checkout_session_id='cs-checkout'").stdout.trim(), 'pending|true|true')

    execute('checkout_fixed', checkout.query, checkoutParams({
      event: { id: 'evt-failed', type: 'checkout.session.async_payment_failed', created: 1_800_000_010 }, state: 'failed',
      object: { id: 'cs-checkout', amount_total: 49_700, mode: 'payment', payment_status: 'unpaid' },
    }))
    execute('checkout_fixed', checkout.query, checkoutParams({
      event: { id: 'evt-paid', type: 'checkout.session.async_payment_succeeded', created: 1_800_000_020 }, state: 'paid',
      object: { id: 'cs-checkout', amount_total: 49_700, mode: 'payment', payment_status: 'paid' },
    }))
    execute('checkout_fixed', checkout.query, checkoutParams({
      event: { id: 'evt-paid', type: 'checkout.session.async_payment_succeeded', created: 1_800_000_020 }, state: 'paid',
      object: { id: 'cs-checkout', amount_total: 49_700, mode: 'payment', payment_status: 'paid' },
    }))
    execute('checkout_fixed', checkout.query, checkoutParams({
      event: { id: 'evt-late-failed', type: 'checkout.session.async_payment_failed', created: 1_800_000_030 }, state: 'failed',
      object: { id: 'cs-checkout', amount_total: 49_700, mode: 'payment', payment_status: 'unpaid' },
    }))
    assert.equal(run("select payment_state || '|' || (paid_at is not null)::text || '|' || is_fixture::text from sales where checkout_session_id='cs-checkout'").stdout.trim(), 'paid|true|true')
    assert.equal(run("select count(*) from stripe_events where event_id='evt-paid'").stdout.trim(), '1')

    execute('checkout_fixed', checkout.query, checkoutParams({
      event: { id: 'evt-nurture', type: 'checkout.session.async_payment_succeeded', created: 1_800_000_040 },
      object: { id: 'cs-nurture', amount_total: 49_700, mode: 'payment', payment_status: 'paid' },
      paymentIntent: 'pi-nurture', state: 'paid', trackingId: '20000000-0000-4000-8000-000000000002', step: 'n3', nurtureStage: 3,
      checkoutEmail: 'ordinary@example.invalid', rawReference: 'signed-nurture-token', invalidOutcome: null,
    }))
    execute('checkout_fixed', checkout.query, checkoutParams({
      event: { id: 'evt-invalid', type: 'checkout.session.async_payment_succeeded', created: 1_800_000_050 },
      object: { id: 'cs-invalid', amount_total: 49_700, mode: 'payment', payment_status: 'paid' },
      paymentIntent: 'pi-invalid', state: 'paid', trackingId: null, step: null, nurtureStage: null,
      checkoutEmail: 'unknown@example.invalid', rawReference: 'invalid-token', invalidOutcome: 'invalid_token',
    }))
    assert.equal(run("select attribution_outcome || '|' || is_fixture::text from sales where checkout_session_id='cs-nurture'").stdout.trim(), 'attributed|false')
    assert.equal(run("select attribution_outcome || '|' || is_fixture::text from sales where checkout_session_id='cs-invalid'").stdout.trim(), 'invalid_token|false')

    run(`
      insert into stripe_events values
        ('evt-refund-new', 'charge.refunded', 'ch-1', 'pi-checkout', 15000, 'partially_refunded', to_timestamp(1800000100), 'received', null),
        ('evt-refund-old', 'charge.refunded', 'ch-1', 'pi-checkout', 5000, 'partially_refunded', to_timestamp(1800000090), 'received', null),
        ('evt-dispute-close', 'charge.dispute.closed', 'dp-1', 'pi-checkout', 20000, 'won', to_timestamp(1800000110), 'received', null),
        ('evt-dispute-create', 'charge.dispute.created', 'dp-1', 'pi-checkout', 20000, 'open', to_timestamp(1800000120), 'received', null);
    `)
    execute('reconcile_fixed', reconcile.query, reconcile.expressions.map(() => 'pi-checkout'))
    assert.equal(run("select refunded_cents || '|' || dispute_state || '|' || disputed_cents || '|' || is_fixture::text from sales where checkout_session_id='cs-checkout'").stdout.trim(), '15000|won|20000|true')
    assert.equal(run("select count(*) from stripe_events where payment_intent='pi-checkout' and outcome='applied'").stdout.trim(), '8')
    assert.equal(run("select count(*) || '|' || coalesce(sum(amount_cents),0) from sales where paid_at is not null and not is_fixture").stdout.trim(), '2|99400')
  } finally {
    spawnSync(binaries[1], ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(root, { recursive: true, force: true })
    rmSync(socket, { recursive: true, force: true })
  }
})
