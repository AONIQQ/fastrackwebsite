import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
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

const runProcess = (file, args, options) => new Promise((resolve, reject) => {
  const child = spawn(file, args, options)
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  child.on('error', reject)
  child.on('close', (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || `exit ${code}`)))
})

test('PostgreSQL 17 enforces one retryable owner alert per submitted intake', {
  skip: available ? false : 'PostgreSQL 17 binaries unavailable', timeout: 40_000,
}, async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-pg-credit-map-owner-'))
  const data = path.join(root, 'data')
  const socket = mkdtempSync('/tmp/ft-cmo-')
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
    run("create table sales(id bigserial primary key,provider text,paid_at timestamptz,is_fixture boolean,payment_state text,refunded_cents integer,dispute_state text); insert into sales(provider,paid_at,is_fixture,payment_state,refunded_cents,dispute_state) values('stripe',now(),false,'paid',0,null),('stripe',now(),false,'refunded',49700,null),('stripe',now(),false,'partially_refunded',1000,null),('stripe',now(),false,'paid',0,'open'),('stripe',now(),false,'paid',0,'lost');")
    for (const filename of ['0024_credit_map_intakes.sql', '0025_credit_map_owner_notifications.sql']) {
      const migration = readFileSync(path.join(project, 'db/migrations', filename), 'utf8')
      for (const statement of splitStatements(migration)) run(statement)
    }
    run("insert into credit_map_intakes(sale_id,status,submitted_at,student_grade,current_school_program,graduation_year,state,dual_enrollment_provider,target_college,intended_major,current_dual_credit) select id,'submitted',now(),'11','Home program',2027,'FL','Not enrolled yet','Florida State University','Undecided','None' from sales")
    const key = '10000000-0000-4000-8000-000000000001'
    run(`insert into credit_map_owner_notifications(intake_id,provider_idempotency_key) values(1,'${key}')`)
    run("insert into credit_map_owner_notifications(intake_id,provider_idempotency_key) values(1,'20000000-0000-4000-8000-000000000002')", false)
    run("insert into credit_map_owner_notifications(intake_id,provider_idempotency_key) values(2,'20000000-0000-4000-8000-000000000002'),(3,'30000000-0000-4000-8000-000000000003'),(4,'40000000-0000-4000-8000-000000000004'),(5,'50000000-0000-4000-8000-000000000005')")
    const claimSql = (token, delay = '') => `
      begin;
      select pg_advisory_xact_lock(hashtext('fastrack:credit-map-owner-alert'));
      with candidate as (
        select notification.intake_id from credit_map_owner_notifications notification
        join credit_map_intakes intake on intake.id=notification.intake_id
        join sales sale on sale.id=intake.sale_id
        where notification.sent_at is null and (notification.status='pending'
          or (notification.status='claimed' and notification.claim_expires_at<=now()))
          and intake.status in ('submitted','in_progress','delivered') and intake.submitted_at is not null
          and sale.provider='stripe' and sale.paid_at is not null and coalesce(sale.is_fixture,false)=false
          and sale.payment_state='paid' and coalesce(sale.refunded_cents,0)=0
          and coalesce(sale.dispute_state,'') not in ('open','lost')
        order by notification.created_at,notification.intake_id limit 1 for update of notification
      )
      update credit_map_owner_notifications notification set status='claimed',
        message_subject=coalesce(notification.message_subject,'Credit Map intake ready'),
        message_text=coalesce(notification.message_text,'Review in protected admin'),
        claim_token='${token}',claim_expires_at=now()+interval '10 minutes',
        attempt_count=notification.attempt_count+1,last_attempt_at=now(),updated_at=now()
      from candidate where notification.intake_id=candidate.intake_id returning notification.intake_id;
      ${delay}
      commit;`
    const first = runProcess(binaries[2], ['-X', '-v', 'ON_ERROR_STOP=1', '-Atqc', claimSql('30000000-0000-4000-8000-000000000003', 'select pg_sleep(0.4);')], { env })
    await new Promise((resolve) => setTimeout(resolve, 75))
    const second = runProcess(binaries[2], ['-X', '-v', 'ON_ERROR_STOP=1', '-Atqc', claimSql('40000000-0000-4000-8000-000000000004')], { env })
    const [firstResult, secondResult] = await Promise.all([first, second])
    assert.match(firstResult.stdout, /1/)
    assert.doesNotMatch(secondResult.stdout, /1/)
    assert.equal(run("select claim_token::text from credit_map_owner_notifications where intake_id=1"), '30000000-0000-4000-8000-000000000003')
    assert.equal(run("select string_agg(intake_id::text,',' order by intake_id) from credit_map_owner_notifications where status='pending'"), '2,3,4,5')
    run("update credit_map_owner_notifications set status='pending',claim_token=null,claim_expires_at=null where intake_id=1")
    run(`update credit_map_owner_notifications set status='claimed',message_subject='Credit Map intake ready',message_text='Review in protected admin',claim_token='30000000-0000-4000-8000-000000000003',claim_expires_at=now()+interval '10 minutes',attempt_count=attempt_count+1 where intake_id=1`)
    assert.equal(run("select status||'|'||attempt_count||'|'||provider_idempotency_key::text from credit_map_owner_notifications where intake_id=1"), `claimed|2|${key}`)
    run("update credit_map_owner_notifications set status='sent' where intake_id=1", false)
    run("update credit_map_owner_notifications set status='pending',claim_token=null,claim_expires_at=null where intake_id=1")
    run(`update credit_map_owner_notifications set status='claimed',claim_token='40000000-0000-4000-8000-000000000004',claim_expires_at=now()+interval '10 minutes',attempt_count=attempt_count+1 where intake_id=1`)
    run("update credit_map_owner_notifications set status='sent',provider_message_id='provider-message-1',sent_at=now(),claim_token=null,claim_expires_at=null where intake_id=1")
    assert.equal(run("select status||'|'||attempt_count||'|'||(sent_at is not null)::text from credit_map_owner_notifications where intake_id=1"), 'sent|3|true')
    run("update credit_map_owner_notifications set status='pending',sent_at=null,provider_message_id=null where intake_id=1")
    run(`insert into credit_map_owner_notifications(intake_id,provider_idempotency_key,status,claim_token,claim_expires_at) values(6,'60000000-0000-4000-8000-000000000006','claimed',null,null)`, false)
  } finally {
    spawnSync(binaries[1], ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(root, { recursive: true, force: true })
    rmSync(socket, { recursive: true, force: true })
  }
})
