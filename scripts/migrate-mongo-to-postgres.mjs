#!/usr/bin/env node
/**
 * One-time migration: MongoDB Atlas (ROItool) -> Neon Postgres.
 *
 *   MONGODB_URI=... DATABASE_URL=... node scripts/migrate-mongo-to-postgres.mjs
 *
 * Moves three collections:
 *   CollegeInfo  -> colleges
 *   CostOfLiving -> cost_of_living
 *   Emails       -> leads
 *
 * Idempotent — safe to re-run. Writes a raw JSON backup of every collection
 * before touching Postgres.
 *
 * The Emails collection has two document generations: an older snake_case shape
 * and a newer camelCase one. Both are normalised into structured columns plus a
 * jsonb snapshot, so nothing is lost either way.
 */

import { MongoClient } from 'mongodb';
import { neon } from '@neondatabase/serverless';
import { mkdir, writeFile } from 'node:fs/promises';

const { MONGODB_URI, DATABASE_URL } = process.env;
if (!MONGODB_URI) throw new Error('MONGODB_URI is required');
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const sql = neon(DATABASE_URL);
const mongo = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
await mongo.connect();
const db = mongo.db('ROItool');

await mkdir('./migration-backup', { recursive: true });

async function dump(name) {
  const docs = await db.collection(name).find({}).toArray();
  await writeFile(`./migration-backup/${name}.json`, JSON.stringify(docs, null, 2));
  console.log(`  backed up ${docs.length} docs from ${name}`);
  return docs;
}

const int = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
};

// ---------------------------------------------------------------- colleges
console.log('\nCollegeInfo -> colleges');
const collegeDocs = await dump('CollegeInfo');

// The unique (lower(name), state) index means duplicates would abort the whole
// insert. Collapse them here and report, rather than failing halfway through.
const seen = new Map();
let dupes = 0;
for (const d of collegeDocs) {
  if (!d.id || !d.school_name || !d.school_state) continue;
  const key = `${String(d.school_name).toLowerCase()}|${d.school_state}`;
  if (seen.has(key)) { dupes++; continue; }
  seen.set(key, d);
}
const colleges = [...seen.values()];
if (dupes) console.log(`  collapsed ${dupes} duplicate name+state rows`);

const CHUNK = 500;
for (let i = 0; i < colleges.length; i += CHUNK) {
  const batch = colleges.slice(i, i + CHUNK);
  await sql`
    insert into colleges (id, name, state, tuition_in, tuition_out, earnings_6yr, earnings_10yr)
    select * from unnest(
      ${batch.map((d) => int(d.id))}::integer[],
      ${batch.map((d) => String(d.school_name))}::text[],
      ${batch.map((d) => String(d.school_state).toUpperCase().slice(0, 2))}::char(2)[],
      ${batch.map((d) => int(d.latest_cost_tuition_in_state))}::integer[],
      ${batch.map((d) => int(d.latest_cost_tuition_out_of_state))}::integer[],
      ${batch.map((d) => int(d.latest_earnings_6_yrs_after_entry_median))}::integer[],
      ${batch.map((d) => int(d.latest_earnings_10_yrs_after_entry_median))}::integer[]
    ) as t(id, name, state, tuition_in, tuition_out, earnings_6yr, earnings_10yr)
    on conflict (id) do update set
      name = excluded.name, state = excluded.state,
      tuition_in = excluded.tuition_in, tuition_out = excluded.tuition_out,
      earnings_6yr = excluded.earnings_6yr, earnings_10yr = excluded.earnings_10yr,
      updated_at = now()
  `;
  console.log(`  ${Math.min(i + CHUNK, colleges.length)}/${colleges.length}`);
}

// ---------------------------------------------------------- cost_of_living
console.log('\nCostOfLiving -> cost_of_living');
const colDocs = await dump('CostOfLiving');
const colRows = colDocs
  .filter((d) => d.state && d.cost_of_living != null)
  .map((d) => ({ state: String(d.state).toUpperCase().slice(0, 2), annual_cost: int(d.cost_of_living) }));

await sql`
  insert into cost_of_living (state, annual_cost)
  select * from unnest(
    ${colRows.map((r) => r.state)}::char(2)[],
    ${colRows.map((r) => r.annual_cost)}::integer[]
  ) as t(state, annual_cost)
  on conflict (state) do update set
    annual_cost = excluded.annual_cost, updated_at = now()
`;
console.log(`  ${colRows.length} states`);

// ------------------------------------------------------------------- leads
console.log('\nEmails -> leads');
const emailDocs = await dump('Emails');

const STRUCTURED = new Set(['_id', 'email', 'phone', 'state', 'residency', 'college', 'timestamp']);

const leads = emailDocs
  .filter((d) => d.email && String(d.email).includes('@'))
  .map((d) => {
    const snapshot = {};
    for (const [k, v] of Object.entries(d)) if (!STRUCTURED.has(k)) snapshot[k] = v;

    // Preserve the original insert time where we have one; fall back to the
    // ObjectId-style hex _id, whose first 4 bytes are a unix timestamp.
    let createdAt = null;
    if (d.timestamp) {
      const t = new Date(d.timestamp);
      if (!Number.isNaN(t.getTime())) createdAt = t.toISOString();
    }
    if (!createdAt && typeof d._id === 'string' && /^[0-9a-f]{24}$/i.test(d._id)) {
      createdAt = new Date(parseInt(d._id.slice(0, 8), 16) * 1000).toISOString();
    }

    return {
      email: String(d.email).trim().toLowerCase(),
      phone: d.phone ? String(d.phone) : null,
      state: d.state ? String(d.state).toUpperCase().slice(0, 2) : null,
      residency: d.residency ? String(d.residency) : null,
      college: d.college ? String(d.college) : null,
      snapshot,
      createdAt,
      legacyId: typeof d._id === 'string' ? d._id : String(d._id),
    };
  });

// Re-running must not duplicate leads. Key on the original Mongo _id, stashed in
// the snapshot, so this stays idempotent without adding a column.
const existing = (await sql`
  select snapshot->>'_legacy_mongo_id' as id from leads where snapshot ? '_legacy_mongo_id'
`).map((r) => r.id);
const existingSet = new Set(existing);
const fresh = leads.filter((l) => !existingSet.has(l.legacyId));

console.log(`  ${leads.length} valid, ${leads.length - fresh.length} already migrated, inserting ${fresh.length}`);

for (const l of fresh) {
  await sql`
    insert into leads (email, phone, state, residency, college, snapshot, created_at)
    values (
      ${l.email}, ${l.phone}, ${l.state}, ${l.residency}, ${l.college},
      ${JSON.stringify({ ...l.snapshot, _legacy_mongo_id: l.legacyId })}::jsonb,
      ${l.createdAt ?? new Date().toISOString()}
    )
  `;
}

await sql`
  insert into data_sources (key, source_url, fetched_at, row_count, notes)
  values ('mongo_migration', 'mongodb-atlas://ROItool', now(),
          ${colleges.length + colRows.length + leads.length},
          ${'one-time migration of CollegeInfo, CostOfLiving, Emails from Atlas'})
  on conflict (key) do update set
    fetched_at = now(), row_count = excluded.row_count, notes = excluded.notes
`;

const [counts] = await sql`
  select
    (select count(*) from colleges)       as colleges,
    (select count(*) from cost_of_living) as cost_of_living,
    (select count(*) from leads)          as leads
`;
console.log('\nPostgres row counts:', counts);

await mongo.close();
console.log('Done. Raw backups in ./migration-backup/');
