# Live Neon schema metadata baseline

Captured read-only on 2026-08-09 from `information_schema` and `pg_indexes`. No
table rows, customer values, secrets, default expressions, or record counts were
selected. Refresh with `npm run db:schema:inventory`; review output before storing
it because future schema names may carry different sensitivity.

This is documentation, not an applyable schema and not migration history.

## Tables and columns

| Table | Columns in ordinal order |
| --- | --- |
| `colleges` | `id int4 not null`, `name text not null`, `city text`, `state bpchar not null`, `ownership int2`, `tuition_in int4`, `tuition_out int4`, `net_price int4`, `earnings_6yr int4`, `earnings_10yr int4`, `student_size int4`, `updated_at timestamptz not null defaulted` |
| `community_posts` | `id int4 not null defaulted`, `platform text not null defaulted`, `thread_id text`, `thread_url text`, `subreddit text`, `reply_text text`, `posted_at timestamptz`, `status text not null defaulted`, `created_at timestamptz not null defaulted` |
| `cost_of_living` | `state bpchar not null`, `annual_cost int4 not null`, `updated_at timestamptz not null defaulted` |
| `data_sources` | `key text not null`, `source_url text`, `fetched_at timestamptz not null defaulted`, `row_count int4`, `notes text` |
| `email_events` | `id int4 not null defaulted`, `email text not null`, `step text not null`, `kind text not null`, `url text`, `created_at timestamptz not null defaulted` |
| `leads` | `id int8 not null defaulted`, `email text not null`, `phone text`, `state bpchar`, `residency text`, `college text`, `snapshot jsonb`, `user_agent text`, `created_at timestamptz not null defaulted`, `sms_consent bool not null defaulted`, `referrer text`, `utm jsonb`, `results_email_sent_at timestamptz`, `nurture_stage int4 not null defaulted`, `nurture_last_at timestamptz`, `unsubscribed_at timestamptz` |
| `sales` | `id int4 not null defaulted`, `stripe_event_id text`, `payment_intent text`, `email text`, `amount_cents int4`, `client_reference_id text`, `raw jsonb`, `created_at timestamptz not null defaulted` |
| `signups` | `id int8 not null defaulted`, `school_district text`, `state bpchar`, `attendee_names text`, `attendee_emails text`, `attendee_count text`, `poc_name text`, `poc_email text`, `notified_at timestamptz`, `user_agent text`, `created_at timestamptz not null defaulted` |

## Keys and indexes

- Primary keys: `colleges.id`, `community_posts.id`, `cost_of_living.state`, `data_sources.key`, `email_events.id`, `leads.id`, `sales.id`, `signups.id`.
- Unique keys: `community_posts.thread_id`, `sales.stripe_event_id`.
- Additional indexes: college lower-name/state lookups; `email_events(step, kind)`; lead created-at, lower-email, and partial SMS-consent lookups; signup created-at lookup.
- No foreign keys were present in the metadata baseline.

## Reconciliation boundary

`db/schema.sql` describes only the historical bootstrap. It omits live
`community_posts`, `email_events`, and `sales`, and it omits the live lead fields
`nurture_stage`, `nurture_last_at`, and `unsubscribed_at`. The first ordered
migration intentionally creates only the migration ledger. T60, T63, and T66 own
their additive application tables, columns, constraints, and behavioral changes.
