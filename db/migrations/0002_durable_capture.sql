alter table leads
  add column if not exists capture_id uuid,
  add column if not exists capture_request_hash text,
  add column if not exists college_id bigint,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists gclid text,
  add column if not exists fbclid text,
  add column if not exists normalized_referrer text,
  add column if not exists sms_consent_at timestamptz,
  add column if not exists sms_consent_version text,
  add column if not exists normalized_phone text,
  add column if not exists is_fixture boolean;
-- migrate:split
create unique index if not exists leads_capture_id_unique on leads (capture_id) where capture_id is not null;
-- migrate:split
create table if not exists capture_delivery_claims (
  lead_id bigint primary key,
  capture_id uuid not null unique,
  claimed_at timestamptz not null default now()
);
-- migrate:split
create table if not exists capture_events (
  id bigserial primary key,
  capture_id uuid,
  lead_id bigint,
  event_type text not null,
  detail_code text,
  is_fixture boolean not null default false,
  created_at timestamptz not null default now(),
  constraint capture_events_type_check check (event_type in ('accepted', 'replayed', 'rejected')),
  constraint capture_events_detail_length check (detail_code is null or length(detail_code) <= 64)
);
-- migrate:split
create index if not exists capture_events_created_type_idx on capture_events (created_at, event_type);
