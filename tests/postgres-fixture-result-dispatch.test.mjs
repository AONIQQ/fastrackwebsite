import assert from 'node:assert/strict'
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { RESERVED_FIXTURE_RESULT_CLAIM_SQL } from '../lib/fixture-result-claim-sql.mjs'

const binaries = ['initdb', 'pg_ctl', 'psql']
const available = (binary) => spawnSync('sh', ['-c', `command -v ${binary}`], { stdio: 'ignore' }).status === 0
const execFileAsync = promisify(execFile)

test('PostgreSQL targeted fixture claim fails closed for every competing or unsafe state', {
  skip: binaries.some((binary) => !available(binary)) ? 'local PostgreSQL binaries unavailable' : false,
  timeout: 30_000,
}, async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-pg-fixture-dispatch-'))
  const data = path.join(root, 'data')
  const socket = mkdtempSync('/tmp/ft-fd-')
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  const env = { ...process.env, PGHOST: socket, PGPORT: String(port), PGDATABASE: 'postgres' }
  const run = (sql) => execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-qAt', '-c', sql], {
    env, encoding: 'utf8',
  }).trim()
  const selected = '10000000-0000-4000-8000-000000000001'
  const other = '20000000-0000-4000-8000-000000000002'
  const seed = ({ recipient = 'delivered@resend.dev', leadFixture = true, messageFixture = true } = {}) => {
    run(`
      insert into leads (id, capture_id, email, is_fixture) values
        (1, '${selected}', '${recipient}', ${leadFixture}),
        (2, '${other}', 'not-a-person@example.invalid', true);
      insert into email_messages (id, lead_id, kind, status, is_fixture, rollout_dispatch_eligible) values
        (1, 1, 'results', 'pending', ${messageFixture}, false),
        (2, 2, 'results', 'pending', true, false);
    `)
  }
  const reset = () => run('truncate email_message_identities, email_messages, leads')
  const claimSql = `
    prepare fixture_claim(uuid, uuid, uuid, text[]) as ${RESERVED_FIXTURE_RESULT_CLAIM_SQL};
    execute fixture_claim(
      '${selected}', '30000000-0000-4000-8000-000000000003',
      '50000000-0000-4000-8000-000000000005',
      array['bounced@resend.dev','complained@resend.dev','delivered@resend.dev','suppressed@resend.dev']
    );
  `
  const claim = () => run(claimSql)

  try {
    execFileSync('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' })
    execFileSync('pg_ctl', ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-w', 'start'], { stdio: 'ignore' })
    run(`
      create table leads (
        id bigint primary key, capture_id uuid, email text not null, is_fixture boolean not null,
        unsubscribed_at timestamptz, college text, residency text, snapshot jsonb not null default '{}'::jsonb
      );
      create table email_messages (
        id bigint primary key, lead_id bigint not null references leads(id), kind text not null,
        nurture_stage integer,
        status text not null, claim_token uuid, claim_expires_at timestamptz,
        attempt_count integer not null default 0, next_attempt_at timestamptz not null default now(),
        rollout_dispatch_eligible boolean not null, is_fixture boolean not null,
        provider_idempotency_key text not null default 'stable-provider-key', updated_at timestamptz not null default now()
      );
      create table email_message_identities (
        email_message_id bigint primary key references email_messages(id), tracking_id uuid not null
      );
    `)

    seed()
    assert.notEqual(claim(), '')
    assert.equal(claim(), '')
    assert.equal(run("select status || '|' || rollout_dispatch_eligible || '|' || attempt_count from email_messages where id=1"), 'claimed|true|1')

    run("update email_messages set status='retryable', claim_token=null, claim_expires_at=null, next_attempt_at=now() where id=1")
    assert.notEqual(claim(), '')
    assert.equal(run("select status || '|' || attempt_count || '|' || provider_idempotency_key from email_messages where id=1"), 'claimed|2|stable-provider-key')

    reset(); seed(); run("update email_messages set status='retryable', rollout_dispatch_eligible=true, next_attempt_at=now()+interval '5 minutes' where id=1"); assert.equal(claim(), '')
    reset(); seed(); run("update email_messages set status='claimed', rollout_dispatch_eligible=true, claim_token='60000000-0000-4000-8000-000000000006', claim_expires_at=now()-interval '1 second' where id=1"); assert.notEqual(claim(), '')

    reset(); seed({ recipient: 'person@example.com' }); assert.equal(claim(), '')
    reset(); seed({ recipient: 'delivered+person@resend.dev' }); assert.equal(claim(), '')
    reset(); seed({ leadFixture: false }); assert.equal(claim(), '')
    reset(); seed({ messageFixture: false }); assert.equal(claim(), '')
    reset(); seed(); run('update leads set unsubscribed_at=now() where id=1'); assert.equal(claim(), '')

    reset(); seed(); run("insert into email_messages (id,lead_id,kind,status,is_fixture,rollout_dispatch_eligible) values (3,1,'results','pending',true,false)"); assert.equal(claim(), '')
    reset(); seed(); run("update email_messages set rollout_dispatch_eligible=true where id=2"); assert.equal(claim(), '')
    reset(); seed(); run("update leads set capture_id=null where id=2; update email_messages set rollout_dispatch_eligible=true where id=2"); assert.equal(claim(), '')
    reset(); seed(); run("update email_messages set status='claimed', claim_token='40000000-0000-4000-8000-000000000004', claim_expires_at=now()+interval '5 minutes' where id=2"); assert.equal(claim(), '')

    reset(); seed()
    const concurrent = await Promise.all([
      execFileAsync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-qAt', '-c', claimSql], { env, encoding: 'utf8' }),
      execFileAsync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-qAt', '-c', claimSql], { env, encoding: 'utf8' }),
    ])
    assert.deepEqual(concurrent.map(({ stdout }) => stdout.trim() === '').sort(), [false, true])
    assert.equal(run("select count(*) from email_messages where status='claimed' and attempt_count=1"), '1')
  } finally {
    spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(root, { recursive: true, force: true })
    rmSync(socket, { recursive: true, force: true })
  }
})
