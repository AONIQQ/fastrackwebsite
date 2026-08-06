# Database

The ROI calculator and lead capture run on **Neon Postgres**, provisioned through the
Vercel Marketplace (`fastrack-database-neon`, Free plan, `us-east-1` — same region as
the project's functions).

## Why this changed

The calculator previously called MongoDB Atlas App Services HTTP endpoints at
`https://us-east-1.aws.data.mongodb-api.com/app/roitoolapp-jnjed/endpoint/*`.
Atlas App Services reached end of life, and every one of those endpoints now
returns:

```
410 {"error":"Atlas App Services and Device Sync have reached EOL"}
```

That silently broke both the calculator **and** `insertEmailDocument`, so anyone
who used the tool after the cutoff saw no results and had their email dropped.

## Schema

`db/schema.sql` — four tables:

| Table            | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `colleges`       | College Scorecard reference data, keyed on UNITID          |
| `cost_of_living` | One annual figure per state                                |
| `leads`          | Calculator email capture, with a `jsonb` result snapshot   |
| `data_sources`   | Provenance, so data staleness is always visible            |

Apply it from the Vercel dashboard (Storage → `fastrack-database-neon` → Query),
or:

```bash
psql "$DATABASE_URL_UNPOOLED" -f db/schema.sql
```

## Environment

Vercel injects these automatically once the Neon resource is connected to the
project. Locally:

```bash
vercel env pull .env.local
```

Use `DATABASE_URL` (pooled, via pgbouncer) from application code. Use
`DATABASE_URL_UNPOOLED` for migrations and DDL, which need a direct connection.

## Scripts

```bash
# One-time Atlas -> Postgres migration. Idempotent; writes ./migration-backup/ first.
MONGODB_URI=... DATABASE_URL=... node scripts/migrate-mongo-to-postgres.mjs

# Refresh college data from College Scorecard. Safe to re-run any time.
DATA_GOV_API_KEY=... DATABASE_URL=... node scripts/load-colleges.mjs
```

Get a free College Scorecard key at <https://api.data.gov/signup/>. Do **not**
reuse the key committed in the old `getschooldata.py`.

## Known data gaps

- `net_price` is null for every row migrated from Mongo — the old pipeline never
  fetched it. `scripts/load-colleges.mjs` does. Until it runs, the calculator
  falls back to published tuition, which overstates real cost for most families.
- Nine territories and DC have colleges but no cost-of-living figure: `AS`, `DC`,
  `FM`, `GU`, `MH`, `MP`, `PR`, `PW`, `VI`. `/api/costOfLiving` returns 404 for
  these. The old 50-state hardcoded dropdown hid the gap by making them
  unreachable.
- Eight duplicate `(name, state)` pairs in the Mongo export were collapsed
  (3,242 documents → 3,234 rows).
