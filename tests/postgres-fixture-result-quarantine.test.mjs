import assert from 'node:assert/strict'
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { RESERVED_FIXTURE_RESULT_QUARANTINE_SQL } from '../lib/fixture-result-quarantine-sql.mjs'

const binaries = ['initdb', 'pg_ctl', 'psql']
const available = (binary) => spawnSync('sh', ['-c', `command -v ${binary}`], { stdio: 'ignore' }).status === 0
const execFileAsync = promisify(execFile)

test('exact production quarantine SQL is atomic, adversarially closed, concurrent, and idempotent', {
  skip: binaries.some((binary) => !available(binary)) ? 'local PostgreSQL binaries unavailable' : false,
  timeout: 30_000,
}, async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-pg-fixture-quarantine-'))
  const data = path.join(root, 'data')
  const socket = mkdtempSync('/tmp/ft-fq-')
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  const env = { ...process.env, PGHOST: socket, PGPORT: String(port), PGDATABASE: 'postgres' }
  const run = (sql) => execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-qAt', '-c', sql], { env, encoding: 'utf8' }).trim()
  const selected = '10000000-0000-4000-8000-000000000001'
  const other = '20000000-0000-4000-8000-000000000002'
  const reset = () => run('truncate email_provider_events, email_messages, leads')
  const seed = ({ recipient = 'delivered@resend.dev', leadFixture = true, messageFixture = true } = {}) => run(`
    insert into leads (id,capture_id,email,is_fixture) values (1,'${selected}','${recipient}',${leadFixture}), (2,'${other}','ordinary@example.invalid',false);
    insert into email_messages (id,lead_id,kind,status,is_fixture,rollout_dispatch_eligible,attempt_count,failure_category,next_attempt_at)
    values (1,1,'results','retryable',${messageFixture},true,2,'provider_rejected',now()+interval '1 hour'),
           (2,2,'results','pending',false,true,0,null,now());
    insert into email_provider_events (provider_event_id,provider_message_id) values ('event-unchanged','unmatched-provider-id');
  `)
  const prepared = `prepare fixture_quarantine(uuid,text[]) as ${RESERVED_FIXTURE_RESULT_QUARANTINE_SQL}; execute fixture_quarantine('${selected}',array['bounced@resend.dev','complained@resend.dev','delivered@resend.dev','suppressed@resend.dev']);`
  const quarantine = () => run(prepared)

  try {
    execFileSync('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' })
    execFileSync('pg_ctl', ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-w', 'start'], { stdio: 'ignore' })
    run(`
      create table leads (id bigint primary key,capture_id uuid,email text not null,is_fixture boolean not null,unsubscribed_at timestamptz);
      create table email_messages (id bigint primary key,lead_id bigint references leads(id),kind text,status text,claim_token uuid,claim_expires_at timestamptz,attempt_count int,next_attempt_at timestamptz,rollout_dispatch_eligible boolean,is_fixture boolean,provider text,provider_message_id text,accepted_at timestamptz,terminal_at timestamptz,failure_category text,provider_delivery_state text,updated_at timestamptz default now());
      create table email_provider_events (provider_event_id text primary key,provider_message_id text);
    `)

    seed(); assert.equal(quarantine(), '1')
    assert.match(run("select status||'|'||rollout_dispatch_eligible||'|'||(claim_token is null)||'|'||(claim_expires_at is null)||'|'||attempt_count||'|'||failure_category from email_messages where id=1"), /^terminal\|false\|true\|true\|2\|provider_rejected$/)
    assert.equal(run('select unsubscribed_at is not null from leads where id=1'), 't')
    assert.equal(run("select status||'|'||rollout_dispatch_eligible from email_messages where id=2"), 'pending|true')
    assert.equal(run("select provider_event_id||'|'||provider_message_id from email_provider_events"), 'event-unchanged|unmatched-provider-id')
    const firstTerminal = run('select terminal_at::text from email_messages where id=1')
    const firstUnsubscribe = run('select unsubscribed_at::text from leads where id=1')
    assert.equal(quarantine(), '1')
    assert.equal(run('select terminal_at::text from email_messages where id=1'), firstTerminal)
    assert.equal(run('select unsubscribed_at::text from leads where id=1'), firstUnsubscribe)

    reset(); seed({ recipient: 'person@example.com' }); assert.equal(quarantine(), '0')
    reset(); seed({ recipient: 'delivered+person@resend.dev' }); assert.equal(quarantine(), '0')
    reset(); seed({ leadFixture: false }); assert.equal(quarantine(), '0')
    reset(); seed({ messageFixture: false }); assert.equal(quarantine(), '0')
    reset(); seed(); run("update email_messages set provider='resend',provider_message_id='receipt' where id=1"); assert.equal(quarantine(), '0')
    reset(); seed(); run("update email_messages set accepted_at=now() where id=1"); assert.equal(quarantine(), '0')
    reset(); seed(); run("update email_messages set status='claimed',claim_token='30000000-0000-4000-8000-000000000003',claim_expires_at=now()+interval '1 minute' where id=1"); assert.equal(quarantine(), '0')
    reset(); seed(); run("update email_messages set status='claimed',claim_token='30000000-0000-4000-8000-000000000003',claim_expires_at=now()-interval '1 second' where id=1"); assert.equal(quarantine(), '1')
    reset(); seed(); run("insert into email_messages values (3,1,'results','retryable',null,null,1,now(),true,true,null,null,null,null,'failed',null,now())"); assert.equal(quarantine(), '0')

    reset(); seed()
    const concurrent = await Promise.all([
      execFileAsync('psql', ['-v','ON_ERROR_STOP=1','-X','-qAt','-c',prepared], { env, encoding: 'utf8' }),
      execFileAsync('psql', ['-v','ON_ERROR_STOP=1','-X','-qAt','-c',prepared], { env, encoding: 'utf8' }),
    ])
    assert.deepEqual(concurrent.map(({ stdout }) => stdout.trim()), ['1', '1'])
    assert.equal(run("select count(*) from email_messages where status='terminal' and rollout_dispatch_eligible=false"), '1')
  } finally {
    spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(root, { recursive: true, force: true })
    rmSync(socket, { recursive: true, force: true })
  }
})
