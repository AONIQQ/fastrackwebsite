-- First ordered migration. The runner records every applied file and checksum
-- here in the same transaction as its SQL statements.
create table if not exists fastrack_schema_migrations (
  version text primary key,
  name text not null,
  checksum text not null,
  applied_at timestamptz not null default now()
);
