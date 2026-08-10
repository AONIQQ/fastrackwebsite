import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CAPTURE_ABUSE_CLEANUP_BATCH_SIZE,
  CAPTURE_ABUSE_CLEANUP_MAX_BATCHES,
  CAPTURE_ABUSE_MAX_NEW_DECISIONS_PER_DAY,
  CAPTURE_ABUSE_MAX_NEW_WINDOWS_PER_DAY,
} from '../lib/capture-abuse-cleanup.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const project = path.resolve(here, '..')
const binaries = ['initdb', 'pg_ctl', 'psql']

function available(binary) {
  return spawnSync('sh', ['-c', `command -v ${binary}`], { stdio: 'ignore' }).status === 0
}

test('PostgreSQL cleanup retains referenced proof and isolates bounded window cleanup', {
  skip: binaries.some((binary) => !available(binary)) ? 'local PostgreSQL binaries unavailable' : false,
  timeout: 30_000,
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-pg-cleanup-'))
  const data = path.join(root, 'data')
  const socket = path.join(root, 'socket')
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  execFileSync('mkdir', ['-m', '700', socket])
  const env = { ...process.env, PGHOST: socket, PGPORT: String(port), PGDATABASE: 'postgres' }
  const run = (sql, succeeds = true) => {
    const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-qAt', '-F', '|', '-c', sql], {
      env, encoding: 'utf8',
    })
    assert.equal(result.status === 0, succeeds, succeeds ? result.stderr : `unexpected success: ${sql}`)
    return result.stdout.trim()
  }

  try {
    execFileSync('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' })
    execFileSync('pg_ctl', ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-w', 'start'], { stdio: 'ignore' })
    run(`
      create table capture_rate_windows (
        scope text not null, key_digest text not null, window_start timestamptz not null,
        window_seconds integer not null, attempt_count integer not null, expires_at timestamptz not null,
        primary key (scope, key_digest, window_start)
      );
      create table capture_risk_decisions (
        id bigint primary key, capture_id uuid not null unique, request_hash text not null,
        policy_version text not null, decision text not null, reason_code text not null,
        accepted_at timestamptz, expires_at timestamptz not null
      );
      create table leads (
        id bigint primary key, capture_risk_decision_id bigint references capture_risk_decisions(id)
      );
      insert into capture_rate_windows values
        ('global', repeat('a', 64), now() - interval '2 hours', 600, 1, now() - interval '1 hour'),
        ('network', repeat('b', 64), now() - interval '2 hours', 60, 1, now() - interval '1 hour'),
        ('email', repeat('c', 64), now() - interval '2 hours', 86400, 1, now() - interval '1 hour');
      insert into capture_risk_decisions values
        (1, '10000000-0000-4000-8000-000000000001', repeat('1', 64), 'capture-risk-v1', 'accepted', 'accepted', now() - interval '31 days', now() - interval '1 day'),
        (2, '20000000-0000-4000-8000-000000000002', repeat('2', 64), 'capture-risk-v1', 'accepted', 'accepted', now() - interval '31 days', now() - interval '1 day'),
        (3, '30000000-0000-4000-8000-000000000003', repeat('3', 64), 'capture-risk-v1', 'rejected', 'email_limit', null, now() - interval '1 day'),
        (4, '40000000-0000-4000-8000-000000000004', repeat('4', 64), 'capture-risk-v1', 'rejected', 'network_limit', null, now() - interval '1 day');
      insert into leads values (1, 1);
    `)
    execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-f', path.join(project, 'db', 'migrations', '0012_capture_risk_cleanup_index.sql')], {
      env, stdio: 'ignore',
    })
    assert.equal(run("select count(*) from pg_indexes where indexname = 'leads_capture_risk_decision_idx'"), '1')

    // Reproduce the legacy all-in-one statement: the referenced decision causes
    // an FK failure, and PostgreSQL rolls back the window deletion with it.
    run(`
      with expired_windows as (
        select ctid from capture_rate_windows where expires_at < now() order by expires_at limit 2
      ), deleted_windows as (
        delete from capture_rate_windows where ctid in (select ctid from expired_windows) returning 1
      ), expired_decisions as (
        select ctid from capture_risk_decisions where expires_at < now() order by expires_at limit 2
      ), deleted_decisions as (
        delete from capture_risk_decisions where ctid in (select ctid from expired_decisions) returning 1
      ) select count(*) from deleted_windows
    `, false)
    assert.equal(run('select count(*) from capture_rate_windows'), '3')

    // The corrected window statement commits independently and is bounded.
    assert.equal(run(`
      with candidates as (
        select ctid from capture_rate_windows where expires_at < now() order by expires_at limit 2
      ), deleted as (
        delete from capture_rate_windows where ctid in (select ctid from candidates) returning 1
      ) select count(*) from deleted
    `), '2')
    assert.equal(run('select count(*) from capture_rate_windows where expires_at < now()'), '1')

    // The corrected decision statement removes only expired unreferenced rows.
    assert.equal(run(`
      with candidates as (
        select decision.id from capture_risk_decisions decision
        where decision.expires_at < now()
          and not exists (select 1 from leads where leads.capture_risk_decision_id = decision.id)
        order by decision.expires_at, decision.id limit 2
      ), deleted as (
        delete from capture_risk_decisions decision
        where decision.id in (select id from candidates)
          and not exists (select 1 from leads where leads.capture_risk_decision_id = decision.id)
        returning 1
      ) select count(*) from deleted
    `), '2')
    assert.equal(run('select count(*) from capture_risk_decisions where id = 1'), '1')
    assert.equal(run('select count(*) from capture_risk_decisions where id in (2,3,4)'), '1')

    // A second bounded pass drains both actionable backlogs. Repeating it is idempotent.
    assert.equal(run(`
      with candidates as (
        select ctid from capture_rate_windows where expires_at < now() order by expires_at limit 2
      ) delete from capture_rate_windows where ctid in (select ctid from candidates) returning 1
    `).split('\n').filter(Boolean).length, 1)
    assert.equal(run(`
      with candidates as (
        select decision.id from capture_risk_decisions decision
        where decision.expires_at < now()
          and not exists (select 1 from leads where leads.capture_risk_decision_id = decision.id)
        order by decision.expires_at, decision.id limit 2
      ) delete from capture_risk_decisions decision
        where decision.id in (select id from candidates)
          and not exists (select 1 from leads where leads.capture_risk_decision_id = decision.id)
        returning 1
    `).split('\n').filter(Boolean).length, 1)
    assert.equal(run(`
      select
        (select count(*) from capture_rate_windows where expires_at < now()),
        (select count(*) from capture_risk_decisions decision where decision.expires_at < now()
          and not exists (select 1 from leads where leads.capture_risk_decision_id = decision.id)),
        (select count(*) from capture_risk_decisions decision where decision.expires_at < now()
          and exists (select 1 from leads where leads.capture_risk_decision_id = decision.id))
    `), '0|0|1')
    assert.equal(run(`
      with candidates as (
        select decision.id from capture_risk_decisions decision
        where decision.expires_at < now()
          and not exists (select 1 from leads where leads.capture_risk_decision_id = decision.id)
        limit 2
      ) delete from capture_risk_decisions where id in (select id from candidates) returning 1
    `), '')

    // Source uses the production batch constant in both independent statements.
    const source = readFileSync(path.join(project, 'lib', 'db.ts'), 'utf8')
    assert.match(source, /cleanupCaptureRateWindows[\s\S]*limit \$\{CAPTURE_ABUSE_CLEANUP_BATCH_SIZE\}/)
    assert.match(source, /cleanupCaptureRiskDecisions[\s\S]*limit \$\{CAPTURE_ABUSE_CLEANUP_BATCH_SIZE\}/)
    assert.ok(CAPTURE_ABUSE_CLEANUP_BATCH_SIZE * CAPTURE_ABUSE_CLEANUP_MAX_BATCHES > CAPTURE_ABUSE_MAX_NEW_WINDOWS_PER_DAY)
    assert.ok(CAPTURE_ABUSE_CLEANUP_BATCH_SIZE * CAPTURE_ABUSE_CLEANUP_MAX_BATCHES > CAPTURE_ABUSE_MAX_NEW_DECISIONS_PER_DAY)
  } finally {
    spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(root, { recursive: true, force: true })
  }
})
