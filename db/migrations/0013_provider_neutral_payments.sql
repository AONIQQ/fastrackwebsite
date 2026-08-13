alter table sales
  add column if not exists provider text default 'stripe',
  add column if not exists provider_payment_id text,
  add column if not exists provider_checkout_id text,
  add column if not exists provider_product_id text,
  add column if not exists attribution_method text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;
-- migrate:split
alter table sales add constraint sales_provider_check check (provider is not null and provider in ('stripe', 'whop')) not valid;
-- migrate:split
alter table sales add constraint sales_attribution_method_check check (
  attribution_method is null or attribution_method in ('signed_exact','email_fallback','ambiguous_email','none')
) not valid;
-- migrate:split
create unique index if not exists sales_provider_payment_unique
  on sales (provider, provider_payment_id) where provider_payment_id is not null;
-- migrate:split
create table if not exists payment_provider_events (
  provider text not null,
  event_id text not null,
  event_type text not null,
  object_id text,
  provider_payment_id text,
  amount_cents integer,
  state text,
  provider_created_at timestamptz not null,
  lifecycle_at timestamptz not null,
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  outcome text not null default 'received',
  is_fixture boolean not null default false,
  primary key (provider, event_id),
  constraint payment_provider_events_provider_check check (provider in ('whop')),
  constraint payment_provider_events_outcome_check check (outcome in ('received', 'applied', 'ignored', 'unmatched')),
  constraint payment_provider_events_amount_check check (amount_cents is null or amount_cents >= 0)
);
-- migrate:split
create index if not exists payment_provider_events_payment_idx
  on payment_provider_events (provider, provider_payment_id, provider_created_at)
  where provider_payment_id is not null;
