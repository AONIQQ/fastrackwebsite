import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assertAdditiveSql,
  loadMigrations,
  parseMigration,
  reconcileMigrations,
  splitStatements,
} from '../scripts/lib/migrations.mjs'

test('migration statements use an explicit stable delimiter', () => {
  assert.deepEqual(
    splitStatements('select 1;\n-- migrate:split\nselect 2;\n'),
    ['select 1;', 'select 2;'],
  )
})

test('destructive and transaction-owning SQL is rejected', () => {
  assert.throws(() => assertAdditiveSql('drop table leads;'), /not additive/)
  assert.throws(() => assertAdditiveSql('begin; select 1; commit;'), /transaction boundary/)
  assert.throws(() => assertAdditiveSql('create index concurrently x on y (z);'), /migration transaction/)
})

test('row-changing DML is rejected', () => {
  assert.throws(() => assertAdditiveSql('insert into leads (email) values (\'fixture@example.invalid\');'), /row-changing DML/)
  assert.throws(() => assertAdditiveSql('update leads set nurture_stage = 0;'), /row-changing DML/)
  assert.throws(() => assertAdditiveSql('delete from leads;'), /row-changing DML/)
  assert.throws(() => assertAdditiveSql('merge into leads using staged_leads on false when not matched then insert default values;'), /row-changing DML/)
})

test('backward-incompatible ALTER operations are rejected', () => {
  assert.throws(() => assertAdditiveSql('alter table leads rename column utm to attribution;'), /backward-incompatible/)
  assert.throws(() => assertAdditiveSql('alter index leads_email_idx rename to leads_email_lookup_idx;'), /backward-incompatible/)
  assert.throws(() => assertAdditiveSql('alter table leads alter column state type text;'), /backward-incompatible/)
  assert.throws(() => assertAdditiveSql('alter table leads alter column email set not null;'), /backward-incompatible/)
  assert.throws(() => assertAdditiveSql('alter table leads add column capture_id text not null;'), /must remain nullable/)
})

test('only the exact reviewed attribution widenings may replace their check constraints', () => {
  assert.doesNotThrow(() => parseMigration(
    '0016_creator_attribution_sources.sql',
    'alter table calculator_funnel_sessions drop constraint if exists calculator_funnel_sessions_source_check;\n-- migrate:split\nalter table calculator_funnel_sessions add constraint calculator_funnel_sessions_source_check check (utm_source in (\'direct\',\'tiktok\'));\n',
  ))
  assert.throws(() => parseMigration('0016_creator_attribution_sources.sql', 'alter table leads drop constraint if exists leads_email_key;'), /not additive/)
  assert.throws(() => parseMigration('0017_other.sql', 'alter table calculator_funnel_sessions drop constraint if exists calculator_funnel_sessions_source_check;'), /not additive/)
  assert.doesNotThrow(() => parseMigration(
    '0017_referral_attribution_source.sql',
    "alter table calculator_funnel_sessions drop constraint if exists calculator_funnel_sessions_source_check;\n-- migrate:split\nalter table calculator_funnel_sessions add constraint calculator_funnel_sessions_source_check check (utm_source in ('direct','referral'));\n",
  ))
  assert.throws(() => parseMigration('0017_referral_attribution_source.sql', 'alter table leads drop constraint if exists leads_email_key;'), /not additive/)
  assert.throws(() => parseMigration('0017_referral_attribution_source.sql', 'alter table calculator_funnel_sessions drop constraint if exists calculator_funnel_sessions_campaign_check;'), /not additive/)
  assert.doesNotThrow(() => parseMigration(
    '0018_podcast_attribution_source.sql',
    "alter table calculator_funnel_sessions drop constraint if exists calculator_funnel_sessions_source_check;\n-- migrate:split\nalter table calculator_funnel_sessions add constraint calculator_funnel_sessions_source_check check (utm_source in ('direct','podcast'));\n",
  ))
  assert.throws(() => parseMigration('0018_podcast_attribution_source.sql', 'alter table leads drop constraint if exists leads_email_key;'), /not additive/)
  assert.throws(() => parseMigration('0018_podcast_attribution_source.sql', 'alter table calculator_funnel_sessions drop constraint if exists calculator_funnel_sessions_campaign_check;'), /not additive/)
})

test('required additive nullable columns, constraints, and indexes remain allowed', () => {
  assert.doesNotThrow(() => assertAdditiveSql('alter table leads add column if not exists capture_id text;'))
  assert.doesNotThrow(() => assertAdditiveSql('alter table leads add constraint leads_capture_id_key unique (capture_id);'))
  assert.doesNotThrow(() => assertAdditiveSql('alter table child add constraint child_parent_fk foreign key (parent_id) references parent (id) on update cascade;'))
  assert.doesNotThrow(() => assertAdditiveSql('create index if not exists leads_capture_id_idx on leads (capture_id);'))
  assert.doesNotThrow(() => assertAdditiveSql("alter table leads add column migration_note text default 'update is not DML here'; -- delete is only a comment"))
})

test('checksums detect an edited applied migration', () => {
  const migration = parseMigration('0001_example.sql', 'create table example (id integer);\n')
  const [row] = reconcileMigrations([migration], [{ version: '0001', checksum: 'different' }])
  assert.equal(row.status, 'checksum-mismatch')
})

test('the checked-in migration sequence is ordered and starts with the ledger', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const migrations = await loadMigrations(path.resolve(here, '..', 'db', 'migrations'))
  assert.equal(migrations[0].filename, '0001_migration_ledger.sql')
  assert.deepEqual(migrations.map(({ version }) => version), [...migrations.map(({ version }) => version)].sort())
})

test('apply exits before database access unless the explicit process gate is present', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const script = path.resolve(here, '..', 'scripts', 'migrations.mjs')
  const env = { ...process.env }
  delete env.ALLOW_DATABASE_MIGRATIONS
  delete env.DATABASE_URL
  delete env.DATABASE_URL_UNPOOLED

  const result = spawnSync(process.execPath, [script, 'apply'], { env, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /explicit owner-approved change control/)
  assert.doesNotMatch(result.stderr, /DATABASE_URL/)
})
