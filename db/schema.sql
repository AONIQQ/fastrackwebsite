-- Fastrack ROI calculator + lead capture schema (Postgres / Neon)
--
-- Replaces the MongoDB Atlas App Services backend, which reached EOL. Every
-- endpoint under https://us-east-1.aws.data.mongodb-api.com/app/roitoolapp-jnjed/
-- now returns 410, so the live calculator and its email capture have both been
-- silently broken.
--
-- Apply from the Vercel dashboard (Storage > fastrack-db > Query) or:
--   psql "$DATABASE_URL" -f db/schema.sql

create table if not exists colleges (
  id              integer primary key,          -- College Scorecard UNITID
  name            text        not null,
  city            text,
  state           char(2)     not null,
  ownership       smallint,                     -- 1 public, 2 private nonprofit, 3 private for-profit
  tuition_in      integer,                      -- published in-state tuition + fees, per year
  tuition_out     integer,                      -- published out-of-state tuition + fees, per year
  net_price       integer,                      -- average net price: what families actually pay
  earnings_6yr    integer,
  earnings_10yr   integer,
  student_size    integer,
  updated_at      timestamptz not null default now()
);

create index if not exists colleges_state_idx on colleges (state);

-- The calculator looks colleges up by name, not id, so this index carries the
-- hot path. Case-insensitive to survive encoding differences in the old data.
create unique index if not exists colleges_name_state_idx on colleges (lower(name), state);
create index if not exists colleges_name_idx on colleges (lower(name));

create table if not exists cost_of_living (
  state        char(2) primary key,
  annual_cost  integer not null,
  updated_at   timestamptz not null default now()
);

-- Lead capture. Previously insertEmailDocument POSTed into Mongo; those rows are
-- stranded in the old Atlas cluster (see scripts/import-mongo-leads.mjs).
create table if not exists leads (
  id            bigserial primary key,
  email         text not null,
  phone         text,
  state         char(2),
  residency     text,                           -- 'inState' | 'outOfState'
  college       text,
  -- Whatever the calculator was showing at the moment of capture. Kept as jsonb
  -- so a change to the calculator's output shape never drops a lead on the floor.
  snapshot      jsonb,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists leads_email_idx      on leads (lower(email));
create index if not exists leads_created_at_idx on leads (created_at desc);

-- Provenance, so we always know how stale the numbers are. The shipped data was
-- pulled in April 2024 and there was no way to tell from the app.
create table if not exists data_sources (
  key          text primary key,
  source_url   text,
  fetched_at   timestamptz not null default now(),
  row_count    integer,
  notes        text
);
