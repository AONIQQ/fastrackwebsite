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

const productionAcceptanceQuery = () => {
  const source = readFileSync(path.join(project, 'lib', 'message-ledger.ts'), 'utf8')
  const match = source.match(/const updated = \(await sql`([\s\S]*?)`\) as \{ id: number \}\[\]/)
  assert.ok(match, 'exact production acceptance query must remain discoverable')
  let parameter = 0
  return match[1].replace(/\$\{[^}]+\}/g, () => `$${++parameter}`)
}

test('installed Neon driver preserves text typing for each standalone receipt identity predicate', async () => {
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
    const providerMessageId = 'provider-fixture-id'
    await driver`select 1 where ${'resend'} = 'resend' and ${providerMessageId}::text is not null and provider_message_id = ${providerMessageId}`
    assert.deepEqual(requestBody, {
      query: "select 1 where $1 = 'resend' and $2::text is not null and provider_message_id = $3",
      params: ['resend', providerMessageId, providerMessageId],
    })
    const query = productionAcceptanceQuery()
    assert.equal((query.match(/\$\d+::text is not null/g) ?? []).length, 2)
  } finally {
    neonConfig.fetchFunction = previousFetch
  }
})

test('PostgreSQL 17 rejects the pre-fix wire shape and accepts the exact production receipt transaction', {
  skip: available ? false : 'PostgreSQL 17 binaries unavailable',
  timeout: 30_000,
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-pg-acceptance-'))
  const data = path.join(root, 'data')
  const socket = mkdtempSync('/tmp/ft-ma-')
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  const env = { ...process.env, PGHOST: socket, PGPORT: String(port), PGDATABASE: 'postgres' }
  const run = (sql, succeeds = true) => {
    const result = spawnSync(binaries[2], ['-v', 'ON_ERROR_STOP=1', '--set=VERBOSITY=verbose', '-X', '-qAt', '-c', sql], { env, encoding: 'utf8' })
    if (succeeds) assert.equal(result.status, 0, result.stderr)
    else assert.notEqual(result.status, 0)
    return result
  }
  const query = productionAcceptanceQuery()
  const preFixQuery = query.replace(/::text is not null/g, ' is not null')
  const claimToken = '10000000-0000-4000-8000-000000000001'
  const values = `(1, '${claimToken}', 'resend', 'provider-fixture-id', 'provider-fixture-id', true, 'resend', 'provider-fixture-id', 'provider-fixture-id', 'resend', 'provider-fixture-id', 'results', 'results', null, 'results')`

  try {
    execFileSync(binaries[0], ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' })
    execFileSync(binaries[1], ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-w', 'start'], { stdio: 'ignore' })
    run(`
      create table leads (
        id bigint primary key, results_email_sent_at timestamptz,
        nurture_stage integer not null default 0, nurture_last_at timestamptz
      );
      create table email_messages (
        id bigint primary key, lead_id bigint not null references leads(id), is_fixture boolean not null,
        status text not null, claim_token uuid, claim_expires_at timestamptz, provider text,
        provider_message_id text, accepted_at timestamptz, failure_category text,
        provider_delivery_state text, provider_state_at timestamptz,
        provider_failure_category text, updated_at timestamptz not null default now()
      );
      create table email_provider_events (
        provider_event_id text primary key, email_message_id bigint references email_messages(id),
        provider_message_id text not null, event_type text not null,
        provider_created_at timestamptz not null, failure_category text,
        outcome text not null, is_fixture boolean not null
      );
      insert into leads (id) values (1);
      insert into email_messages (id, lead_id, is_fixture, status, claim_token)
        values (1, 1, true, 'claimed', '${claimToken}');
      insert into email_provider_events values
        ('event-sent', null, 'provider-fixture-id', 'sent', now() - interval '1 second', null, 'unmatched', false),
        ('event-delivered', null, 'provider-fixture-id', 'delivered', now(), null, 'unmatched', false);
    `)

    const rejected = run(`prepare pre_fix as ${preFixQuery};`, false)
    assert.match(rejected.stderr, /42P18/)
    assert.match(rejected.stderr, /could not determine data type of parameter \$4/)

    run(`prepare corrected as ${query}; execute corrected${values};`)
    assert.equal(run("select status || '|' || provider || '|' || provider_delivery_state from email_messages where id=1").stdout.trim(), 'accepted|resend|delivered')
    assert.equal(run("select count(*) || '|' || bool_and(outcome='matched') || '|' || bool_and(is_fixture) || '|' || count(distinct email_message_id) from email_provider_events").stdout.trim(), '2|true|true|1')
    assert.equal(run("select count(*) || '|' || count(distinct provider_message_id) from email_messages where provider_message_id='provider-fixture-id'").stdout.trim(), '1|1')
    assert.equal(run(`prepare corrected_again as ${query}; execute corrected_again${values};`).stdout.trim(), '')
    assert.equal(run("select count(*) from email_messages where status='accepted' and provider_message_id='provider-fixture-id'").stdout.trim(), '1')
  } finally {
    spawnSync(binaries[1], ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(root, { recursive: true, force: true })
    rmSync(socket, { recursive: true, force: true })
  }
})
