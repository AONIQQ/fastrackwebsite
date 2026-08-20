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

test('PostgreSQL 17 persists guide clicks while preserving the bounded destination constraint', {
  skip: available ? false : 'PostgreSQL 17 binaries unavailable', timeout: 30_000,
}, (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-guide-click-pg17-'))
  const data = path.join(root, 'data')
  const socket = mkdtempSync('/tmp/ft-guide-click-')
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  const env = { ...process.env, PGHOST: socket, PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' }
  const psql = (sql, succeeds = true) => {
    const result = spawnSync(binaries[2], ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], { env, encoding: 'utf8' })
    if (succeeds) assert.equal(result.status, 0, result.stderr)
    else assert.notEqual(result.status, 0)
    return result.stdout.trim()
  }

  execFileSync(binaries[0], ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', 'postgres'], { stdio: 'ignore' })
  execFileSync(binaries[1], ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-w', 'start'], { stdio: 'ignore' })
  t.after(() => {
    spawnSync(binaries[1], ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(root, { recursive: true, force: true })
    rmSync(socket, { recursive: true, force: true })
  })

  psql(`
    create table email_messages(id bigint primary key);
    create table email_engagement_events(
      id bigint generated always as identity primary key,
      email_message_id bigint not null references email_messages(id),
      step text not null,
      event_type text not null,
      destination_key text,
      created_at timestamptz not null default now(),
      constraint email_engagement_step_check check(step in ('results','n1','n2','n3','n4')),
      constraint email_engagement_type_check check(event_type in ('open','click')),
      constraint email_engagement_destination_check check(
        (event_type='open' and destination_key is null)
        or (event_type='click' and destination_key in ('home','calculator','credit_map','checkout'))
      )
    );
    insert into email_messages(id) values(1);
  `)
  psql("insert into email_engagement_events(email_message_id,step,event_type,destination_key) values(1,'n2','click','guide')", false)

  const migration = readFileSync(path.join(project, 'db/migrations/0020_guide_engagement_destination.sql'), 'utf8')
  for (const statement of splitStatements(migration)) psql(statement)

  psql("insert into email_engagement_events(email_message_id,step,event_type,destination_key) values(1,'n2','click','guide')")
  assert.equal(psql("select step||'|'||event_type||'|'||destination_key from email_engagement_events"), 'n2|click|guide')
  psql("insert into email_engagement_events(email_message_id,step,event_type,destination_key) values(1,'n2','click','external')", false)
  psql("insert into email_engagement_events(email_message_id,step,event_type,destination_key) values(1,'n2','open','guide')", false)
  psql("insert into email_engagement_events(email_message_id,step,event_type,destination_key) values(1,'n2','open',null)")
  assert.equal(psql('select count(*) from email_engagement_events'), '2')
})
