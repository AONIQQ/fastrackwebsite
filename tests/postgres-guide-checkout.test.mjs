import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { splitStatements } from '../scripts/lib/migrations.mjs'
import { GUIDE_CHECKOUT_CLAIM_SQL, GUIDE_CHECKOUT_COMPLETE_SQL, GUIDE_CHECKOUT_RELEASE_SQL } from '../lib/guide-checkout.mjs'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pg17 = '/opt/homebrew/opt/postgresql@17/bin'
const binaries = ['initdb', 'pg_ctl', 'psql'].map((name) => path.join(pg17, name))
const available = binaries.every((binary) => spawnSync(binary, ['--version'], { stdio: 'ignore' }).status === 0)

test('exact guide checkout SQL is typed, scoped, idempotent, and privacy bounded on PostgreSQL 17', {
  skip: available ? false : 'PostgreSQL 17 binaries unavailable', timeout: 30_000,
}, (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-guide-checkout-'))
  const data = path.join(root, 'data')
  const socket = mkdtempSync('/tmp/ft-guide-')
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  const env = { ...process.env, PGHOST: socket, PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' }
  const run = (sql, succeeds = true) => {
    const result = spawnSync(binaries[2], ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], { env, encoding: 'utf8' })
    if (succeeds) assert.equal(result.status, 0, result.stderr); else assert.notEqual(result.status, 0)
    return result.stdout.trim()
  }
  execFileSync(binaries[0], ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', 'postgres'], { stdio: 'ignore' })
  execFileSync(binaries[1], ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-w', 'start'], { stdio: 'ignore' })
  t.after(() => { spawnSync(binaries[1], ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' }); rmSync(root, { recursive: true, force: true }); rmSync(socket, { recursive: true, force: true }) })
  run(`create table leads(id bigint primary key,is_fixture boolean not null default false,unsubscribed_at timestamptz);
    create table email_messages(id bigint primary key,lead_id bigint references leads(id),kind text,nurture_stage integer,is_fixture boolean not null default false);
    create table email_message_identities(email_message_id bigint primary key references email_messages(id),tracking_id uuid not null unique);`)
  const migration = readFileSync(path.join(project, 'db/migrations/0022_guide_checkout_sessions.sql'), 'utf8')
  for (const statement of splitStatements(migration)) run(statement)
  const tracking = '123e4567-e89b-42d3-a456-426614174000'
  const claim = '223e4567-e89b-42d3-a456-426614174000'
  run(`insert into leads values(1,false,null),(2,true,null),(3,false,now());
    insert into email_messages values(1,1,'nurture',2,false),(2,2,'nurture',2,true),(3,3,'nurture',2,false);
    insert into email_message_identities values(1,'${tracking}'),(2,'323e4567-e89b-42d3-a456-426614174000'),(3,'423e4567-e89b-42d3-a456-426614174000');`)
  const executeClaim = (trackingId, claimId) => run(`prepare claim(uuid,uuid) as ${GUIDE_CHECKOUT_CLAIM_SQL}; execute claim('${trackingId}','${claimId}')`)
  assert.equal(executeClaim(tracking, claim), '|claimed')
  assert.equal(executeClaim(tracking, '523e4567-e89b-42d3-a456-426614174000'), '|pending')
  assert.equal(run(`prepare complete(uuid,uuid,text,text) as ${GUIDE_CHECKOUT_COMPLETE_SQL}; execute complete('${tracking}','${claim}','ch_exact123','https://whop.com/checkout/ch_exact123/')`), 'https://whop.com/checkout/ch_exact123/')
  assert.equal(executeClaim(tracking, '623e4567-e89b-42d3-a456-426614174000'), 'https://whop.com/checkout/ch_exact123/|ready')
  assert.equal(executeClaim('323e4567-e89b-42d3-a456-426614174000', '723e4567-e89b-42d3-a456-426614174000'), '')
  assert.equal(executeClaim('423e4567-e89b-42d3-a456-426614174000', '823e4567-e89b-42d3-a456-426614174000'), '')
  run(`prepare release(uuid,uuid) as ${GUIDE_CHECKOUT_RELEASE_SQL}`)
  assert.equal(run(`select count(*)||'|'||count(*) filter(where purchase_url is not null) from guide_checkout_sessions`), '1|1')
  assert.doesNotMatch(migration + GUIDE_CHECKOUT_COMPLETE_SQL, /\bemail\s+text|\blead_id\b|phone\b|recipient\b|payload\b|raw\b/i)
})
