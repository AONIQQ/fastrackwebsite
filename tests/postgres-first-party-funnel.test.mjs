import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { splitStatements } from '../scripts/lib/migrations.mjs'
import { FIRST_PARTY_FUNNEL_REPORT_SQL } from '../lib/first-party-funnel-report.mjs'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pg17 = '/opt/homebrew/opt/postgresql@17/bin'
const binaries = ['initdb', 'pg_ctl', 'psql'].map((name) => path.join(pg17, name))
const available = binaries.every((binary) => spawnSync(binary, ['--version'], { stdio: 'ignore' }).status === 0)

const runProcess = (file, args, options) => new Promise((resolve, reject) => {
  const child = spawn(file, args, options); let stdout = ''; let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk }); child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('error', reject); child.on('close', (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || `exit ${code}`)))
})

test('PostgreSQL 17 freezes attribution, deduplicates concurrent stages, bounds ingest, and reports QA separately', {
  skip: available ? false : 'PostgreSQL 17 binaries unavailable', timeout: 40_000,
}, async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-funnel-pg17-')); const data = path.join(root, 'data'); const socket = mkdtempSync('/tmp/ft-funnel-')
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  const env = { ...process.env, PGHOST: socket, PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' }
  const psql = (sql, succeeds = true) => {
    const result = spawnSync(binaries[2], ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], { env, encoding: 'utf8' })
    if (succeeds) assert.equal(result.status, 0, result.stderr); else assert.notEqual(result.status, 0)
    return result.stdout.trim()
  }
  execFileSync(binaries[0], ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', 'postgres'], { stdio: 'ignore' })
  execFileSync(binaries[1], ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-w', 'start'], { stdio: 'ignore' })
  t.after(() => { spawnSync(binaries[1], ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' }); rmSync(root, { recursive: true, force: true }); rmSync(socket, { recursive: true, force: true }) })
  for (const filename of ['0015_first_party_funnel_events.sql', '0016_creator_attribution_sources.sql', '0017_referral_attribution_source.sql']) {
    const migration = readFileSync(path.join(project, 'db/migrations', filename), 'utf8')
    for (const statement of splitStatements(migration)) psql(statement)
  }

  const digest = 'a'.repeat(64)
  const network = 'e'.repeat(64)
  const recordSql = ({ session, event, source = 'reddit', pause = false }) => `
    begin;
    select pg_advisory_xact_lock(hashtext('fastrack:first-party-funnel-admission'));
    with known_session as (select 1 from calculator_funnel_sessions where session_digest='${session}'),
    capacity_ok as (
      select 1 where not exists(select 1 from known_session)
      and coalesce((select session_count from calculator_funnel_ingest_windows where scope='global' and key_digest=repeat('0',64) and window_start=date_trunc('hour',now())),0)<500
      and coalesce((select session_count from calculator_funnel_ingest_windows where scope='network' and key_digest='${network}' and window_start=date_trunc('hour',now())),0)<10
    ),
    global_capacity as (
      insert into calculator_funnel_ingest_windows(scope,key_digest,window_start,session_count,expires_at)
      select 'global',repeat('0',64),date_trunc('hour',now()),1,date_trunc('hour',now())+interval '2 days' where exists(select 1 from capacity_ok)
      on conflict(scope,key_digest,window_start) do update set session_count=calculator_funnel_ingest_windows.session_count+1 where calculator_funnel_ingest_windows.session_count<500 returning 1
    ), network_capacity as (
      insert into calculator_funnel_ingest_windows(scope,key_digest,window_start,session_count,expires_at)
      select 'network','${network}',date_trunc('hour',now()),1,date_trunc('hour',now())+interval '2 days' where exists(select 1 from capacity_ok) and exists(select 1 from global_capacity)
      on conflict(scope,key_digest,window_start) do update set session_count=calculator_funnel_ingest_windows.session_count+1 where calculator_funnel_ingest_windows.session_count<10 returning 1
    ), session_write as (
      insert into calculator_funnel_sessions(session_digest,utm_source,utm_medium,utm_campaign,utm_content,traffic_class)
      select '${session}','${source}','organic','agent-20260814',null,'business' where not exists(select 1 from known_session) and exists(select 1 from global_capacity) and exists(select 1 from network_capacity) returning 1
    ), accepted_session as (select 1 from known_session union all select 1 from session_write limit 1),
    event_write as (insert into calculator_funnel_events(session_digest,event_name) select '${session}','${event}' where exists(select 1 from accepted_session) on conflict(session_digest,event_name) do nothing returning 1)
    select exists(select 1 from accepted_session)||'|'||exists(select 1 from event_write);
    ${pause ? 'select pg_sleep(.3);' : ''}
    commit;`
  const first = runProcess(binaries[2], ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', recordSql({ session: digest, event: 'Calculator Intent', pause: true })], { env })
  await new Promise((resolve) => setTimeout(resolve, 50))
  const second = runProcess(binaries[2], ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', recordSql({ session: digest, event: 'Calculator Modal Opened', source: 'facebook' })], { env })
  await Promise.all([first, second])
  assert.equal(psql(`select count(*)||'|'||utm_source from calculator_funnel_sessions group by utm_source`), '1|reddit')
  assert.equal(psql(`select count(*) from calculator_funnel_events where session_digest='${digest}'`), '2')
  assert.equal(psql(`select scope||'|'||session_count from calculator_funnel_ingest_windows order by scope`), 'global|1\nnetwork|1')
  assert.match(psql(recordSql({ session: digest, event: 'Calculator Intent', source: 'facebook' })), /true\|false/)
  psql(recordSql({ session: digest, event: 'Capture Submission Attempted' })); psql(recordSql({ session: digest, event: 'Lead Captured' }))
  const qaDigest = 'b'.repeat(64)
  psql(`insert into calculator_funnel_sessions(session_digest,utm_source,utm_medium,utm_campaign,utm_content,traffic_class) values('${qaDigest}','direct','direct','direct','qa-t230','qa'); insert into calculator_funnel_events(session_digest,event_name) values('${qaDigest}','Calculator Intent'),('${qaDigest}','Calculator Modal Opened')`)
  assert.equal(psql(`select traffic_class||'|'||count(*) from calculator_funnel_sessions group by traffic_class order by traffic_class`), 'business|1\nqa|1')
  assert.throws(() => psql(`insert into calculator_funnel_sessions(session_digest,utm_source,utm_medium,utm_campaign,utm_content,traffic_class) values('${'c'.repeat(64)}','email','partner','agent-20260814','person-5551234567','business')`))
  assert.throws(() => psql(`insert into calculator_funnel_sessions(session_digest,utm_source,utm_medium,utm_campaign,traffic_class) values('${'d'.repeat(64)}','reddit','organic','qa-hostile','business')`))
  psql(`insert into calculator_funnel_sessions(session_digest,utm_source,utm_medium,utm_campaign,utm_content,traffic_class) values('${'9'.repeat(64)}','tiktok','organic','creator-20260820','calculator','qa'),('${'8'.repeat(64)}','instagram','organic','creator-20260820','calculator','qa')`)
  assert.equal(psql(`select string_agg(utm_source,',' order by utm_source) from calculator_funnel_sessions where utm_campaign='creator-20260820'`), 'instagram,tiktok')
  assert.throws(() => psql(`insert into calculator_funnel_sessions(session_digest,utm_source,utm_medium,utm_campaign,traffic_class) values('${'7'.repeat(64)}','snapchat','organic','creator-20260820','qa')`))
  psql(`insert into calculator_funnel_sessions(session_digest,utm_source,utm_medium,utm_campaign,utm_content,traffic_class) values('${'6'.repeat(64)}','referral','referral','agent-20260820','calculator','business'); insert into calculator_funnel_events(session_digest,event_name) values('${'6'.repeat(64)}','Calculator Intent')`)
  assert.equal(psql(`select utm_source||'|'||utm_medium||'|'||utm_campaign||'|'||utm_content from calculator_funnel_sessions where session_digest='${'6'.repeat(64)}'`), 'referral|referral|agent-20260820|calculator')

  psql(`delete from calculator_funnel_ingest_windows; insert into calculator_funnel_ingest_windows(scope,key_digest,window_start,session_count,expires_at) values('global',repeat('0',64),date_trunc('hour',now()),498,date_trunc('hour',now())+interval '2 days'),('network','${network}',date_trunc('hour',now()),9,date_trunc('hour',now())+interval '2 days')`)
  const results = await Promise.all([
    runProcess(binaries[2], ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', recordSql({ session: 'f'.repeat(64), event: 'Calculator Intent' })], { env }),
    runProcess(binaries[2], ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', recordSql({ session: '1'.repeat(64), event: 'Calculator Intent' })], { env }),
  ])
  assert.equal(results.filter((result) => result.stdout.includes('true|true')).length, 1)
  assert.equal(results.filter((result) => result.stdout.includes('false|false')).length, 1)
  assert.equal(psql(`select session_count from calculator_funnel_ingest_windows where scope='network'`), '10')
  assert.equal(psql(`select session_count from calculator_funnel_ingest_windows where scope='global'`), '499')
  for (let index = 0; index < 3; index += 1) {
    assert.match(psql(recordSql({ session: `${index + 2}`.repeat(64), event: 'Calculator Intent' })), /false\|false/)
  }
  assert.equal(psql(`select session_count from calculator_funnel_ingest_windows where scope='global'`), '499')

  assert.equal(psql(`select s.traffic_class||'|'||s.utm_source||'|'||count(*) filter(where e.event_name='Calculator Intent')||'|'||count(*) filter(where e.event_name='Lead Captured') from calculator_funnel_events e join calculator_funnel_sessions s using(session_digest) group by s.traffic_class,s.utm_source order by s.traffic_class,s.utm_source`), 'business|reddit|2|1\nbusiness|referral|1|0\nqa|direct|1|0')

  const report = spawnSync(binaries[2], ['-X', '-v', 'ON_ERROR_STOP=1', '-P', 'footer=off', '-F', '|', '-A', '-c', FIRST_PARTY_FUNNEL_REPORT_SQL], { env, encoding: 'utf8' })
  assert.equal(report.status, 0, report.stderr)
  const reportLines = report.stdout.trimEnd().split('\n')
  assert.equal(reportLines[0], 'window|traffic_class|source|medium|campaign|intent|modal_opened|submission_attempted|lead_captured|capture_failed|modal_per_intent|attempt_per_modal|captured_per_intent|captured_per_attempt')
  assert.deepEqual(reportLines.slice(1), [
    '7d|business|reddit|organic|agent-20260814|2|1|1|1|0|0.5|1|0.5|1',
    '7d|business|referral|referral|agent-20260820|1|0|0|0|0|0||0|',
    '7d|qa|direct|direct|direct|1|1|0|0|0|1|0|0|',
    '30d|business|reddit|organic|agent-20260814|2|1|1|1|0|0.5|1|0.5|1',
    '30d|business|referral|referral|agent-20260820|1|0|0|0|0|0||0|',
    '30d|qa|direct|direct|direct|1|1|0|0|0|1|0|0|',
  ])
})
