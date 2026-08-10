# Ordered database migrations

`db/schema.sql` is a historical bootstrap and is not the live schema or migration
history. All new database changes belong here as immutable, ordered SQL files.

## Convention

- Name files `NNNN_lowercase_name.sql`, starting after the highest checked-in version.
- Make every migration additive and backward-compatible with the currently deployed source.
- Separate multiple SQL statements with a line containing `-- migrate:split`.
- Never edit a file after it has been applied. The runner verifies its SHA-256 checksum.
- Never put customer data, secrets, environment values, or fixture rows in a migration.
- Destructive SQL, caller-owned transactions, and concurrent indexes are rejected by the runner.
- Label fixture/test data in the schema introduced by its owning repair. Do not insert fixtures into production business tables.

The runner executes every file in one transaction with a Postgres advisory lock,
then records its version and checksum in `fastrack_schema_migrations`. A unique
version insert makes a concurrent duplicate attempt roll back rather than partially
apply.

## Commands

Local source-only plan, with no database connection:

```bash
npm run db:migrate:plan
```

Read-only comparison against the configured Neon database:

```bash
npm run db:migrate:status
```

Apply requires the direct `DATABASE_URL_UNPOOLED`, explicit owner-approved change
control, a backup/restore decision, and a deliberate process gate. Do not run this
from an ordinary development or verification task:

```bash
ALLOW_DATABASE_MIGRATIONS=1 npm run db:migrate:apply
```

Read-only verification that every checked-in migration is applied with the exact
recorded checksum:

```bash
npm run db:migrate:verify
```

For production, capture the plan and status output before apply, use one operator,
keep the prior application SHA available, apply additive nullable structures first,
and run verify afterward. Application behavior must remain disabled until its own
implementation and independent verification tasks pass.

`0002_durable_capture.sql` is the backward-compatible calculator capture layer. It
adds nullable lead identity, acquisition, consent, and fixture-classification
fields plus a non-PII event ledger. The capture route has a fail-closed operational
kill switch: setting `CAPTURE_ACK_ENABLED=0` returns 503 while preserving visitor
inputs and withholding results. Leaving it unset enables the acknowledged protocol.

`0006_capture_abuse_controls.sql` adds privacy-minimized durable rate windows and
stable risk decisions. The route fails closed unless `CAPTURE_ABUSE_SECRET` is at
least 32 bytes and the request has a same-origin `Origin` plus a valid
Vercel-provided client address. Store only HMAC digests, never raw network, email,
or phone keys. `CAPTURE_SMS_ENABLED` is disabled unless its value is exactly `1`,
and that switch cannot override the database requirement for accepted risk,
recorded consent, and separately verified phone ownership. Expired windows and
decisions are removed by the separately authorized, bounded daily abuse-cleanup
job, with aggregate deleted and remaining counts. A missing trusted edge header
or exhausted global window can deny a legitimate capture; that deny-over-send
tradeoff is intentional until independent runtime evidence supports a carefully
reviewed threshold change.

`0007_capture_abuse_business_identity.sql` adds a nullable, constrained durable
validation classification so invalid college/state combinations consume broad
global and network capacity without consuming a target's email or phone
allowance. Existing decision values and old-source compatibility are unchanged.
