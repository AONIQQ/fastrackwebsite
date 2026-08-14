import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { splitStatements } from '../scripts/lib/migrations.mjs'

const pg17 = '/opt/homebrew/opt/postgresql@17/bin'
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const runProcess = (file, args, options) => new Promise((resolve, reject) => {
  const child = spawn(file, args, options)
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('error', reject)
  child.on('close', (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || `exit ${code}`)))
})

test('PostgreSQL 17 enforces private singleton alert state and serializes claims', async (t) => {
  const required = ['initdb', 'pg_ctl', 'psql'].every((name) => {
    try { execFileSync('test', ['-x', path.join(pg17, name)]); return true } catch { return false }
  })
  if (!required) return t.skip('PostgreSQL 17 binaries unavailable')

  const root = mkdtempSync(path.join(os.tmpdir(), 'fastrack-alert-pg17-'))
  const data = path.join(root, 'data')
  const socket = path.join(root, 'socket')
  execFileSync('mkdir', ['-p', socket])
  execFileSync(path.join(pg17, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres'], { stdio: 'ignore' })
  execFileSync(path.join(pg17, 'pg_ctl'), ['-D', data, '-o', `-F -k ${socket} -p 55439`, '-w', 'start'], { stdio: 'ignore' })
  t.after(() => {
    try { execFileSync(path.join(pg17, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' }) } finally { rmSync(root, { recursive: true, force: true }) }
  })
  const env = { ...process.env, PGHOST: socket, PGPORT: '55439', PGDATABASE: 'postgres', PGUSER: 'postgres' }
  const psql = (sql, extra = {}) => execFileSync(path.join(pg17, 'psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-Atqc', sql], { env, encoding: 'utf8', ...extra }).trim()
  const migration = readFileSync(path.join(project, 'db/migrations/0014_funnel_health_alert_state.sql'), 'utf8')
  for (const statement of splitStatements(migration)) psql(statement)
  psql("insert into funnel_health_alert_state(scope) values ('owner')")

  assert.throws(() => psql("insert into funnel_health_alert_state(scope) values ('customer')"))
  assert.throws(() => psql("update funnel_health_alert_state set pending_kind='alert' where scope='owner'"))
  assert.throws(() => psql("update funnel_health_alert_state set claim_token='00000000-0000-0000-0000-000000000001' where scope='owner'"))

  const first = runProcess(path.join(pg17, 'psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-Atqc', `
    begin;
    select pg_advisory_xact_lock(hashtext('fastrack:funnel-health-owner-alert'));
    update funnel_health_alert_state set claim_token='00000000-0000-0000-0000-000000000001', claim_expires_at=now()+interval '10 minutes' where scope='owner' and claim_token is null returning scope;
    select pg_sleep(0.4);
    commit;
  `], { env })
  await new Promise((resolve) => setTimeout(resolve, 75))
  const second = runProcess(path.join(pg17, 'psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-Atqc', `
    begin;
    select pg_advisory_xact_lock(hashtext('fastrack:funnel-health-owner-alert'));
    update funnel_health_alert_state set claim_token='00000000-0000-0000-0000-000000000002', claim_expires_at=now()+interval '10 minutes' where scope='owner' and (claim_expires_at is null or claim_expires_at <= now()) returning scope;
    commit;
  `], { env })
  const [firstResult, secondResult] = await Promise.all([first, second])
  assert.match(firstResult.stdout, /owner/)
  assert.doesNotMatch(secondResult.stdout, /owner/)
  assert.equal(psql("select claim_token::text from funnel_health_alert_state where scope='owner'"), '00000000-0000-0000-0000-000000000001')
})
