create table if not exists email_messages (
  id bigserial primary key,
  lead_id bigint not null references leads(id),
  kind text not null,
  nurture_stage integer,
  logical_key text not null unique,
  status text not null default 'pending',
  claim_token uuid,
  claim_expires_at timestamptz,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider text,
  provider_message_id text,
  provider_idempotency_key text not null unique,
  accepted_at timestamptz,
  terminal_at timestamptz,
  failure_category text,
  is_fixture boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_messages_kind_check check (kind in ('results', 'nurture')),
  constraint email_messages_stage_check check (
    (kind = 'results' and nurture_stage is null) or
    (kind = 'nurture' and nurture_stage between 1 and 4)
  ),
  constraint email_messages_status_check check (status in ('pending', 'claimed', 'accepted', 'retryable', 'terminal')),
  constraint email_messages_failure_length check (failure_category is null or length(failure_category) <= 64)
);
-- migrate:split
create index if not exists email_messages_dispatch_idx
  on email_messages (status, next_attempt_at, claim_expires_at);
-- migrate:split
create index if not exists email_messages_lead_idx on email_messages (lead_id, kind, nurture_stage);
-- migrate:split
create unique index if not exists email_messages_provider_id_unique
  on email_messages (provider, provider_message_id) where provider_message_id is not null;
-- migrate:split
create table if not exists nurture_runs (
  id bigserial primary key,
  run_key uuid not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  considered integer not null default 0,
  claimed integer not null default 0,
  accepted integer not null default 0,
  retried integer not null default 0,
  failed integer not null default 0,
  backlog integer not null default 0,
  failure_category text,
  constraint nurture_runs_failure_length check (failure_category is null or length(failure_category) <= 64)
);
-- migrate:split
alter table sales
  add column if not exists checkout_session_id text,
  add column if not exists lead_id bigint,
  add column if not exists touch_ref text,
  add column if not exists payment_state text,
  add column if not exists paid_at timestamptz,
  add column if not exists refunded_cents integer,
  add column if not exists dispute_state text,
  add column if not exists disputed_cents integer,
  add column if not exists updated_at timestamptz;
-- migrate:split
create unique index if not exists sales_checkout_session_unique
  on sales (checkout_session_id) where checkout_session_id is not null;
-- migrate:split
create index if not exists sales_payment_intent_idx
  on sales (payment_intent) where payment_intent is not null;
-- migrate:split
create table if not exists stripe_events (
  event_id text primary key,
  event_type text not null,
  object_id text,
  payment_intent text,
  amount_cents integer,
  state text,
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  outcome text not null default 'received',
  constraint stripe_events_outcome_check check (outcome in ('received', 'applied', 'ignored', 'unmatched'))
);
