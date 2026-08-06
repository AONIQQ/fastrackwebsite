#!/usr/bin/env node
/**
 * Pull fresh College Scorecard data straight into Postgres.
 *
 *   DATA_GOV_API_KEY=... DATABASE_URL=... node scripts/load-colleges.mjs
 *
 * Replaces the old two-step dance (getschooldata.py -> JSON file -> rework.py -> Mongo).
 * Idempotent: re-run any time to refresh. Upserts on id.
 *
 * Get a fresh key at https://api.data.gov/signup/ — do not reuse the one committed
 * in the old getschooldata.py.
 */

import { neon } from '@neondatabase/serverless';

const API_KEY = process.env.DATA_GOV_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!API_KEY) throw new Error('DATA_GOV_API_KEY is required');
if (!DATABASE_URL) throw new Error('DATABASE_URL is required (run `vercel env pull`)');

const sql = neon(DATABASE_URL);

const BASE = 'https://api.data.gov/ed/collegescorecard/v1/schools.json';

const FIELDS = [
  'id',
  'school.name',
  'school.city',
  'school.state',
  'school.ownership',
  'latest.student.size',
  'latest.cost.tuition.in_state',
  'latest.cost.tuition.out_of_state',
  'latest.cost.avg_net_price.public',
  'latest.cost.avg_net_price.private',
  'latest.earnings.6_yrs_after_entry.median',
  'latest.earnings.10_yrs_after_entry.median',
];

const PER_PAGE = 100;

async function fetchPage(page) {
  const params = new URLSearchParams({
    api_key: API_KEY,
    _fields: FIELDS.join(','),
    _per_page: String(PER_PAGE),
    _page: String(page),
    // Currently operating institutions only.
    //
    // Deliberately NOT filtered by predominant degree type. Filtering to
    // bachelor's-predominant would drop community colleges, and those are where
    // dual credit is actually taken — the whole premise of the product. The
    // /api/colleges route decides what is selectable; the loader's job is to
    // never lose a row that was previously available.
    'school.operating': '1',
  });

  const res = await fetch(`${BASE}?${params}`);
  if (!res.ok) {
    throw new Error(`Scorecard API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * The old pipeline dropped any school missing ANY of four fields, which silently
 * threw away a large share of institutions. Keep anything we can identify, and
 * let the UI decide what it can render.
 */
function normalize(r) {
  const netPublic = r['latest.cost.avg_net_price.public'];
  const netPrivate = r['latest.cost.avg_net_price.private'];

  return {
    id: r.id,
    name: r['school.name'],
    city: r['school.city'] ?? null,
    state: r['school.state'],
    ownership: r['school.ownership'] ?? null,
    tuition_in: r['latest.cost.tuition.in_state'] ?? null,
    tuition_out: r['latest.cost.tuition.out_of_state'] ?? null,
    net_price: netPublic ?? netPrivate ?? null,
    earnings_6yr: r['latest.earnings.6_yrs_after_entry.median'] ?? null,
    earnings_10yr: r['latest.earnings.10_yrs_after_entry.median'] ?? null,
    student_size: r['latest.student.size'] ?? null,
  };
}

async function upsertBatch(rows) {
  if (!rows.length) return;

  // Unnest-based bulk upsert: one round trip per page instead of one per row.
  await sql`
    insert into colleges (
      id, name, city, state, ownership,
      tuition_in, tuition_out, net_price,
      earnings_6yr, earnings_10yr, student_size, updated_at
    )
    select * from unnest(
      ${rows.map((r) => r.id)}::integer[],
      ${rows.map((r) => r.name)}::text[],
      ${rows.map((r) => r.city)}::text[],
      ${rows.map((r) => r.state)}::char(2)[],
      ${rows.map((r) => r.ownership)}::smallint[],
      ${rows.map((r) => r.tuition_in)}::integer[],
      ${rows.map((r) => r.tuition_out)}::integer[],
      ${rows.map((r) => r.net_price)}::integer[],
      ${rows.map((r) => r.earnings_6yr)}::integer[],
      ${rows.map((r) => r.earnings_10yr)}::integer[],
      ${rows.map((r) => r.student_size)}::integer[]
    ) as t(
      id, name, city, state, ownership,
      tuition_in, tuition_out, net_price,
      earnings_6yr, earnings_10yr, student_size
    ), lateral (select now()) as u(updated_at)
    on conflict (id) do update set
      name          = excluded.name,
      city          = excluded.city,
      state         = excluded.state,
      ownership     = excluded.ownership,
      tuition_in    = excluded.tuition_in,
      tuition_out   = excluded.tuition_out,
      net_price     = excluded.net_price,
      earnings_6yr  = excluded.earnings_6yr,
      earnings_10yr = excluded.earnings_10yr,
      student_size  = excluded.student_size,
      updated_at    = now()
  `;
}

async function main() {
  let page = 0;
  let totalPages = Infinity;
  let inserted = 0;
  const missing = { tuition_in: 0, net_price: 0, earnings_6yr: 0, earnings_10yr: 0 };

  while (page < totalPages) {
    const result = await fetchPage(page);

    if (page === 0) {
      totalPages = Math.ceil(result.metadata.total / PER_PAGE);
      console.log(`${result.metadata.total} institutions across ${totalPages} pages`);
    }

    const rows = result.results
      .map(normalize)
      .filter((r) => r.id && r.name && r.state);

    for (const r of rows) {
      for (const k of Object.keys(missing)) if (r[k] == null) missing[k]++;
    }

    await upsertBatch(rows);
    inserted += rows.length;
    console.log(`page ${page + 1}/${totalPages} — ${inserted} rows`);
    page++;
  }

  await sql`
    insert into data_sources (key, source_url, fetched_at, row_count, notes)
    values ('college_scorecard', ${BASE}, now(), ${inserted},
            ${'fields: ' + FIELDS.join(',')})
    on conflict (key) do update set
      source_url = excluded.source_url,
      fetched_at = now(),
      row_count  = excluded.row_count,
      notes      = excluded.notes
  `;

  console.log(`\nDone. ${inserted} institutions loaded.`);
  console.log('Null-field counts (these are why the old tool showed blanks):');
  console.table(missing);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
