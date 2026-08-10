import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const project = path.resolve(here, '..')
const binaries = ['initdb', 'pg_ctl', 'psql']

function available(binary) {
  return spawnSync('sh', ['-c', `command -v ${binary}`], { stdio: 'ignore' }).status === 0
}

test('PostgreSQL enforces complete prospective risk binding and fixture provenance', {
  skip: binaries.some((binary) => !available(binary)) ? 'local PostgreSQL binaries unavailable' : false,
  timeout: 30_000,
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-pg-contract-'))
  const data = path.join(root, 'data')
  const socket = path.join(root, 'socket')
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  execFileSync('mkdir', ['-m', '700', socket])

  const env = { ...process.env, PGHOST: socket, PGPORT: String(port), PGDATABASE: 'postgres' }
  const psql = (sql, succeeds = true) => {
    const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-qAt', '-c', sql], {
      env, encoding: 'utf8',
    })
    assert.equal(result.status === 0, succeeds, succeeds ? result.stderr : `unexpected success: ${sql}`)
  }

  try {
    execFileSync('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' })
    execFileSync('pg_ctl', ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-w', 'start'], { stdio: 'ignore' })
    psql(`
      create table capture_risk_decisions (
        id bigint primary key, capture_id uuid not null unique, request_hash text not null,
        policy_version text not null, decision text not null, accepted_at timestamptz
      );
      create table leads (
        id bigserial primary key, capture_id uuid, capture_request_hash text,
        capture_risk_decision_id bigint, capture_risk_accepted_at timestamptz,
        capture_risk_policy_version text
      );
      create table sales (id bigserial primary key, checkout_session_id text unique);
    `)
    for (const filename of [
      '0009_capture_reporting_risk_binding.sql',
      '0010_reporting_fixture_provenance.sql',
    ]) {
      execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-f', path.join(project, 'db', 'migrations', filename)], {
        env, stdio: 'ignore',
      })
    }

    const acceptedCapture = '10000000-0000-4000-8000-000000000001'
    const rejectedCapture = '20000000-0000-4000-8000-000000000002'
    const acceptedAt = '2026-08-10T12:00:00Z'
    const hashA = 'a'.repeat(64)
    const hashB = 'b'.repeat(64)
    psql(`insert into capture_risk_decisions values
      (1, '${acceptedCapture}', '${hashA}', 'policy-1', 'accepted', '${acceptedAt}'),
      (2, '${rejectedCapture}', '${hashB}', 'policy-1', 'rejected', null)`)

    // Legacy writes remain compatible, while an exact accepted relationship succeeds.
    psql(`insert into leads (capture_id) values (null)`)
    psql(`insert into leads values (default, '${acceptedCapture}', '${hashA}', 1, '${acceptedAt}', 'policy-1', 'accepted')`)

    // PostgreSQL CHECK UNKNOWN and MATCH SIMPLE cannot bypass the new complete-proof check.
    psql(`insert into leads values (default, '${acceptedCapture}', '${hashA}', 1, '${acceptedAt}', 'policy-1', null)`, false)
    psql(`insert into leads values (default, '${rejectedCapture}', '${hashB}', 2, null, 'policy-1', 'rejected')`, false)
    psql(`insert into leads values (default, '${acceptedCapture}', '${hashA}', 2, '${acceptedAt}', 'policy-1', 'accepted')`, false)
    psql(`insert into leads values (default, '${acceptedCapture}', '${hashB}', 1, '${acceptedAt}', 'policy-1', 'accepted')`, false)
    psql(`insert into leads values (default, '${acceptedCapture}', '${hashA}', 1, '2026-08-10T12:00:01Z', 'policy-1', 'accepted')`, false)
    psql(`insert into leads values (default, '${acceptedCapture}', '${hashA}', 1, '${acceptedAt}', 'policy-2', 'accepted')`, false)

    psql(`insert into sales (checkout_session_id) values ('direct-sale')`)
    psql(`insert into sales (checkout_session_id, is_fixture) values ('fixture-sale', true)`)
    psql(`insert into sales (checkout_session_id, is_fixture) values ('invalid-null', null)`, false)
    psql(`update sales set is_fixture = coalesce(is_fixture, false) or false where checkout_session_id = 'fixture-sale'`)
    const marker = execFileSync('psql', ['-X', '-qAt', '-c', "select is_fixture from sales where checkout_session_id = 'fixture-sale'"], { env, encoding: 'utf8' }).trim()
    assert.equal(marker, 't')
  } finally {
    spawnSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(root, { recursive: true, force: true })
  }
})
