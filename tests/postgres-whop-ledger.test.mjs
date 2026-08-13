import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { splitStatements } from '../scripts/lib/migrations.mjs'
import { WHOP_EVENT_SQL, WHOP_PAYMENT_SQL, WHOP_RECONCILE_SQL } from '../lib/whop-store.mjs'
import { PAYMENT_BY_PROVIDER_SOURCE_SQL, PAYMENT_TOTALS_SQL, PROVIDER_PAYMENT_TOTALS_SQL } from '../lib/payment-reporting.mjs'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pg17 = '/opt/homebrew/opt/postgresql@17/bin'
const binaries = ['initdb', 'pg_ctl', 'psql'].map((name) => path.join(pg17, name))
const available = binaries.every((binary) => spawnSync(binary, ['--version'], { stdio: 'ignore' }).status === 0)

test('exact production Whop SQL runs on PostgreSQL 17 with duplicate and reverse-order safety', {
  skip: available ? false : 'PostgreSQL 17 binaries unavailable', timeout: 40_000,
}, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fastrack-pg-whop-'))
  const data = path.join(root, 'data'); const socket = mkdtempSync('/tmp/ft-whop-')
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  const env = { ...process.env, PGHOST: socket, PGPORT: String(port), PGDATABASE: 'postgres' }
  const run = (sql, succeeds = true) => {
    const result = spawnSync(binaries[2], ['-v', 'ON_ERROR_STOP=1', '-X', '-qAt', '-c', sql], { env, encoding: 'utf8' })
    if (succeeds) assert.equal(result.status, 0, result.stderr); else assert.notEqual(result.status, 0)
    return result.stdout.trim()
  }
  try {
    execFileSync(binaries[0], ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' })
    execFileSync(binaries[1], ['-D', data, '-o', `-k ${socket} -p ${port} -h ''`, '-w', 'start'], { stdio: 'ignore' })
    run(`create table leads(id bigserial primary key,email text not null,is_fixture boolean default false,created_at timestamptz default now(),utm_source text,utm jsonb,normalized_referrer text);
      create table email_messages(id bigserial primary key,lead_id bigint references leads(id),kind text,nurture_stage integer,is_fixture boolean default false);
      create table email_message_identities(email_message_id bigint primary key references email_messages(id),tracking_id uuid unique not null);
      create table sales(
        id bigserial primary key,stripe_event_id text,checkout_session_id text,payment_intent text,email text,
        amount_cents integer,client_reference_id text,email_message_id bigint references email_messages(id),lead_id bigint references leads(id),touch_ref text,
        attribution_outcome text,payment_state text,paid_at timestamptz,refunded_cents integer default 0,
        dispute_state text,disputed_cents integer default 0,is_fixture boolean default false,raw jsonb,
        created_at timestamptz default now(),updated_at timestamptz
      );`)
    const migration = readFileSync(path.join(project, 'db/migrations/0013_provider_neutral_payments.sql'), 'utf8')
    for (const statement of splitStatements(migration)) run(statement)
    const eventSql = (args) => `prepare whop_event(text,text,text,text,integer,text,timestamptz,timestamptz,text,boolean) as ${WHOP_EVENT_SQL}; execute whop_event(${args});`
    const paymentSql = (args) => `prepare whop_payment(text,text,text,text,integer,timestamptz,timestamptz,boolean,uuid,text,integer,text,text,text,text,text,text,text,timestamptz) as ${WHOP_PAYMENT_SQL}; execute whop_payment(${args});`
    const reconcileSql = (paymentId) => `prepare whop_reconcile(text) as ${WHOP_RECONCILE_SQL}; execute whop_reconcile('${paymentId}');`

    // Official-shaped updated events can share object-created time; the signed
    // envelope lifecycle time and update-event tie priority must win.
    run(eventSql("'msg_refund_new','refund_updated','rf_one','pay_fixture',4700,'succeeded','2027-01-15 08:00Z','2027-01-15 08:03Z','received',false"))
    run(reconcileSql('pay_fixture'))
    run(eventSql("'msg_refund_old','refund_created','rf_one','pay_fixture',1000,'pending','2027-01-15 08:00Z','2027-01-15 08:02Z','received',false"))
    run(eventSql("'msg_dispute_new','dispute_updated','dspt_one','pay_fixture',4700,'won','2027-01-15 08:00Z','2027-01-15 08:04Z','received',false"))
    run(eventSql("'msg_dispute_old','dispute_created','dspt_one','pay_fixture',4700,'open','2027-01-15 08:00Z','2027-01-15 08:03Z','received',false"))
    run(reconcileSql('pay_fixture'))
    assert.equal(run("select count(*)||'|'||count(*) filter(where outcome='received') from payment_provider_events"), '4|4')

    // Non-contract aliases and SQL wildcard near-matches must never project
    // revenue state, even if a future/manual row bypasses the normalizer.
    run(eventSql("'msg_legacy_dot','refund.created','rf_legacy','pay_fixture',4700,'succeeded','2027-01-15 08:00Z','2027-01-15 08:04Z','received',false"))
    run(eventSql("'msg_near_match','disputeXcreated','dspt_near','pay_fixture',4700,'lost','2027-01-15 08:00Z','2027-01-15 08:04Z','received',false"))

    // Reverse order: payment arrives after refund/dispute. Exact production SQL
    // creates one sale, then applies all prior lifecycle events.
    run(paymentSql("'msg_payment','payment_succeeded','pay_fixture','pay_fixture',4700,'2027-01-15 08:00Z','2027-01-15 08:05Z',false,null,null,null,'buyer@example.test',null,'ch_fixture','prod_fixture',null,null,null,'2027-01-15 08:01Z'"))
    run(reconcileSql('pay_fixture'))
    assert.equal(run("select payment_state||'|'||refunded_cents||'|'||dispute_state||'|'||disputed_cents||'|'||attribution_method||'|'||to_char(paid_at at time zone 'UTC','HH24:MI') from sales"), 'refunded|4700|won|4700|none|08:01')
    assert.equal(run("select count(*)||'|'||count(*) filter(where outcome='applied') from payment_provider_events"), '7|5')
    assert.equal(run("select count(*) from payment_provider_events where event_id in('msg_legacy_dot','msg_near_match') and outcome='received'"), '2')

    // New delivery ID for the same payment and duplicate delivery ID cannot
    // duplicate or regress the refunded sale.
    const duplicatePayment = "'msg_payment_2','payment_succeeded','pay_fixture','pay_fixture',4700,'2027-01-15 08:00Z','2027-01-15 08:06Z',false,null,null,null,'buyer@example.test',null,'ch_fixture','prod_fixture',null,null,null,'2027-01-15 08:01Z'"
    run(paymentSql(duplicatePayment)); run(paymentSql(duplicatePayment)); run(reconcileSql('pay_fixture'))
    assert.equal(run("select count(*)||'|'||payment_state||'|'||refunded_cents from sales group by payment_state,refunded_cents"), '1|refunded|4700')
    assert.equal(run("select count(*) from payment_provider_events where event_id='msg_payment_2'"), '1')

    // Same lifecycle timestamp uses updated over created, never lexicographic
    // event-ID accident.
    run(eventSql("'msg_same_z','refund_created','rf_same','pay_fixture',2000,'pending','2027-01-15 08:00Z','2027-01-15 08:07Z','received',false"))
    run(eventSql("'msg_same_a','refund_updated','rf_same','pay_fixture',2000,'succeeded','2027-01-15 08:00Z','2027-01-15 08:07Z','received',false"))
    run(reconcileSql('pay_fixture'))
    assert.equal(run("select refunded_cents from sales"), '6700')

    // Multiple dispute objects are reduced conservatively. A newer won object
    // must not hide a distinct older open/lost object or its disputed amount.
    run(eventSql("'msg_dispute_two','dispute_created','dspt_two','pay_fixture',1000,'open','2027-01-15 08:00Z','2027-01-15 08:08Z','received',false"))
    run(reconcileSql('pay_fixture'))
    assert.equal(run("select dispute_state||'|'||disputed_cents from sales"), 'open|5700')

    // Exact production aggregate SQL counts each provider sale once, reports
    // source separately, nets reversals, and excludes every fixture path.
    run(`insert into leads(id,email,is_fixture,created_at,utm_source,utm) values
        (1,'genuine@example.test',false,now(),'google','{}'),(2,'fixture@example.test',true,now(),'reddit','{}');
      insert into email_messages(id,lead_id,kind,is_fixture) values(1,1,'results',true);
      insert into sales(provider,provider_payment_id,amount_cents,paid_at,refunded_cents,dispute_state,is_fixture,lead_id,raw)
        values('stripe','pi_real',49700,now(),9700,null,false,1,'{}'),
          ('stripe','pi_fixture',49700,now(),0,null,true,null,'{}'),
          ('stripe','pi_fixture_lead',49700,now(),0,null,false,2,'{}');
      insert into sales(provider,provider_payment_id,amount_cents,paid_at,refunded_cents,dispute_state,is_fixture,email_message_id,raw)
        values('stripe','pi_fixture_message',49700,now(),0,null,false,1,'{}');
      insert into sales(provider,provider_payment_id,amount_cents,paid_at,refunded_cents,dispute_state,is_fixture,utm_source,raw)
        values('whop','pay_clean',4700,now(),0,null,false,'email','{}');`)
    assert.equal(run(PAYMENT_TOTALS_SQL), '3|44700')
    assert.equal(run(PAYMENT_BY_PROVIDER_SOURCE_SQL), 'stripe|google|1|40000\nwhop|email|1|4700\nwhop|direct|1|0')
    assert.equal(run(`prepare provider_totals(text) as ${PROVIDER_PAYMENT_TOTALS_SQL}; execute provider_totals('whop');`), '2|1|1|0|9400|6700|4700')
    run("insert into sales(provider,provider_payment_id) values('whop','pay_fixture')", false)
    run("insert into sales(provider,provider_payment_id) values('other','pay_other')", false)
  } finally {
    spawnSync(binaries[1], ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' })
    rmSync(root, { recursive: true, force: true }); rmSync(socket, { recursive: true, force: true })
  }
})
