#!/usr/bin/env node
/**
 * Seed the cost_of_living table from the existing JSON.
 *
 *   DATABASE_URL=... node scripts/load-cost-of-living.mjs ../new\ fastrack\ stuff/ROItool/cost_living_data_modified.json
 *
 * Note on which file to use: the ROItool folder has three variants.
 *   cost_living_data.json          - full state names, e.g. { state: 'Mississippi', cost_of_living: 45906 }
 *   cost_living_data_modified.json - two-letter codes, same values  <-- use this one
 *   cost_living_data_reduced.json  - two-letter codes, LOWER values (MS 32134 vs 45906)
 *
 * The "reduced" numbers are roughly 70% of the others and there is no note anywhere
 * explaining why. Do not ship them until you know what they represent — the whole
 * "years to recoup" output is divided by this number, so a 30% error here moves
 * every headline figure on the page.
 */

import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required (run `vercel env pull`)');

const path = process.argv[2];
if (!path) throw new Error('usage: node scripts/load-cost-of-living.mjs <path-to-json>');

const sql = neon(DATABASE_URL);

const STATE_CODES = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
  Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH',
  Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
  'District of Columbia': 'DC', 'Puerto Rico': 'PR',
};

const raw = JSON.parse(await readFile(path, 'utf8'));

const rows = raw
  .map((r) => ({
    state: r.state.length === 2 ? r.state.toUpperCase() : STATE_CODES[r.state],
    annual_cost: r.cost_of_living,
  }))
  .filter((r) => r.state && Number.isFinite(r.annual_cost));

await sql`
  insert into cost_of_living (state, annual_cost, updated_at)
  select * from unnest(
    ${rows.map((r) => r.state)}::char(2)[],
    ${rows.map((r) => r.annual_cost)}::integer[]
  ) as t(state, annual_cost), lateral (select now()) as u(updated_at)
  on conflict (state) do update set
    annual_cost = excluded.annual_cost,
    updated_at  = now()
`;

console.log(`Loaded ${rows.length} states.`);

// The old calculator hardcoded a 50-state dropdown, so DC and PR were in the data
// but unreachable in the UI. Flag whichever states have colleges but no COL figure.
const gaps = await sql`
  select distinct c.state
  from colleges c
  left join cost_of_living col on col.state = c.state
  where col.state is null
  order by 1
`;
if (gaps.length) {
  console.log('States with colleges but no cost-of-living figure:', gaps.map((g) => g.state).join(', '));
}
