import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { splitStatements } from '../scripts/lib/migrations.mjs'
import {
  NURTURE_ELIGIBLE_WITHOUT_ROW_SQL,
  NURTURE_ENQUEUE_SQL,
} from '../lib/nurture-enqueue-sql.mjs'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pg17 = '/opt/homebrew/opt/postgresql@17/bin'
const binaries = ['initdb', 'pg_ctl', 'psql'].map((name) => path.join(pg17, name))
const available = binaries.every((binary) => spawnSync(binary, ['--version'], { stdio: 'ignore' }).status === 0)

test('exact nurture SQL enqueues stage one at the 48-hour boundary and preserves idempotency', {
  skip: available ? false : 'PostgreSQL 17 binaries unavailable', timeout: 30_000,
}, (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-nurture-enqueue-'))
  const data = path.join(root, 'data')
  const socket = mkdtempSync('/tmp/ft-nurture-')
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  const env = { ...process.env, PGHOST: socket, PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' }
  const run = (sql) => {
    const result = spawnSync(binaries[2], ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], { env, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  execFileSync(binaries[0], ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', 'postgres'], { stdio: 'ignore' })
  execFileSync(binaries[1], ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-w', 'start'], { stdio: 'ignore' })
  t.after(() => {
    spawnSync(binaries[1], ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(root, { recursive: true, force: true })
    rmSync(socket, { recursive: true, force: true })
  })
  run(`
    create table leads (
      id bigserial primary key, created_at timestamptz not null, nurture_stage integer not null default 0,
      unsubscribed_at timestamptz, is_fixture boolean not null default false
    );
    create table email_messages (
      id bigserial primary key, lead_id bigint not null references leads(id), kind text not null,
      nurture_stage integer, logical_key text not null unique, provider_idempotency_key text not null unique,
      is_fixture boolean not null default false, rollout_dispatch_eligible boolean not null default true,
      status text not null default 'pending'
    );
    create table nurture_runs (
      id bigserial primary key, run_key uuid not null unique, started_at timestamptz not null default now(),
      completed_at timestamptz, considered integer not null default 0, claimed integer not null default 0,
      accepted integer not null default 0, retried integer not null default 0, failed integer not null default 0,
      backlog integer not null default 0, failure_category text
    );
  `)
  const migration = readFileSync(path.join(project, 'db/migrations/0023_nurture_enqueue_run_invariant.sql'), 'utf8')
  for (const statement of splitStatements(migration)) run(statement)
  const at = '2026-08-26T16:00:17.000Z'
  run(`
    insert into leads(id,created_at) values
      (1, '${at}'::timestamptz - interval '48 hours'),
      (2, '${at}'::timestamptz - interval '48 hours' + interval '1 millisecond');
    insert into email_messages(lead_id,kind,nurture_stage,logical_key,provider_idempotency_key,status)
      values (1,'results',null,'lead:1:results','ft-lead-1-results','accepted'),
             (2,'results',null,'lead:2:results','ft-lead-2-results','accepted');
  `)
  const prepare = `prepare enqueue(boolean,timestamptz) as ${NURTURE_ENQUEUE_SQL}; prepare invariant(boolean,timestamptz) as ${NURTURE_ELIGIBLE_WITHOUT_ROW_SQL};`
  assert.equal(run(`${prepare} execute enqueue(true,'${at}');`), '1')
  assert.equal(run(`${prepare} execute invariant(true,'${at}');`), '0')
  assert.equal(run("select lead_id||'|'||nurture_stage||'|'||is_fixture||'|'||rollout_dispatch_eligible from email_messages where kind='nurture'"), '1|1|false|true')
  assert.equal(run(`${prepare} execute enqueue(true,'${at}');`), '0')
  assert.equal(run(`${prepare} execute invariant(true,'${at}');`), '0')
  assert.equal(run(`${prepare} execute enqueue(false,'${at}'::timestamptz + interval '1 millisecond');`), '0')
  assert.equal(run("select count(*) from email_messages where kind='nurture'"), '1')
  assert.equal(run(`${prepare} execute enqueue(true,'${at}'::timestamptz + interval '1 millisecond');`), '1')
  assert.equal(run(`${prepare} execute invariant(true,'${at}'::timestamptz + interval '1 millisecond');`), '0')
  assert.equal(run("select count(*) from email_messages where kind='nurture'"), '2')
  run("insert into nurture_runs(run_key,nurture_enqueued,nurture_eligible_without_row) values('10000000-0000-4000-8000-000000000001',2,0)")
  assert.equal(run('select nurture_enqueued||\'|\'||nurture_eligible_without_row from nurture_runs'), '2|0')
})
