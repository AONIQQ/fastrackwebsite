import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { splitStatements } from '../scripts/lib/migrations.mjs'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pg17 = '/opt/homebrew/opt/postgresql@17/bin'
const binaries = ['initdb', 'pg_ctl', 'psql'].map((name) => path.join(pg17, name))
const available = binaries.every((binary) => spawnSync(binary, ['--version'], { stdio: 'ignore' }).status === 0)

test('PostgreSQL 17 enforces one intake per paid sale and complete immutable submission shape', {
  skip: available ? false : 'PostgreSQL 17 binaries unavailable', timeout: 40_000,
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-pg-credit-map-'))
  const data = path.join(root, 'data')
  const socket = mkdtempSync('/tmp/ft-cm-')
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  const env = { ...process.env, PGHOST: socket, PGPORT: String(port), PGDATABASE: 'postgres' }
  const run = (sql, succeeds = true) => {
    const result = spawnSync(binaries[2], ['-v', 'ON_ERROR_STOP=1', '-X', '-qAt', '-c', sql], { env, encoding: 'utf8' })
    if (succeeds) assert.equal(result.status, 0, result.stderr)
    else assert.notEqual(result.status, 0)
    return result.stdout.trim()
  }
  try {
    execFileSync(binaries[0], ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' })
    execFileSync(binaries[1], ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-w', 'start'], { stdio: 'ignore' })
    run('create table sales(id bigserial primary key); insert into sales default values;')
    const migration = readFileSync(path.join(project, 'db/migrations/0024_credit_map_intakes.sql'), 'utf8')
    for (const statement of splitStatements(migration)) run(statement)
    run("insert into credit_map_intakes(sale_id,buyer_token_key,buyer_token_expires_at) values(1,repeat('A',43),now()+interval '1 hour')")
    run("insert into credit_map_intakes(sale_id) values(1)", false)
    run("update credit_map_intakes set status='submitted',submitted_at=now() where sale_id=1", false)
    run(`update credit_map_intakes set status='submitted',submitted_at=now(),
      student_grade='11',current_school_program='Fastrack Homeschool',graduation_year=2027,state='FL',
      dual_enrollment_provider='Not enrolled yet',target_college='Florida State University',
      intended_major='Undecided',current_dual_credit='None' where sale_id=1`)
    assert.equal(run("select status||'|'||state||'|'||graduation_year||'|'||(planning_context is null)::text from credit_map_intakes where sale_id=1"), 'submitted|FL|2027|true')
    run("update credit_map_intakes set state='XX' where sale_id=1", false)
    run("update credit_map_intakes set graduation_year=1999 where sale_id=1", false)
  } finally {
    spawnSync(binaries[1], ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(root, { recursive: true, force: true })
    rmSync(socket, { recursive: true, force: true })
  }
})
