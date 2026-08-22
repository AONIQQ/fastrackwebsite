create table if not exists guide_checkout_sessions (
  tracking_id uuid not null references email_message_identities(tracking_id),
  step text not null,
  claim_token uuid,
  lease_expires_at timestamptz,
  provider_checkout_id text,
  purchase_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tracking_id, step),
  constraint guide_checkout_sessions_step_check check (step = 'n2'),
  constraint guide_checkout_sessions_claim_check check (
    (claim_token is null and lease_expires_at is null)
    or (claim_token is not null and lease_expires_at is not null)
  ),
  constraint guide_checkout_sessions_provider_id_check check (
    provider_checkout_id is null or provider_checkout_id ~ '^ch_[A-Za-z0-9_-]{3,128}$'
  ),
  constraint guide_checkout_sessions_url_check check (
    purchase_url is null or purchase_url ~ '^https://whop\.com/checkout/[A-Za-z0-9_/?=&.-]+$'
  ),
  constraint guide_checkout_sessions_ready_check check (
    (provider_checkout_id is null) = (purchase_url is null)
  ),
  constraint guide_checkout_sessions_provider_id_key unique (provider_checkout_id)
);

-- migrate:split
create index if not exists guide_checkout_sessions_lease_idx
  on guide_checkout_sessions (lease_expires_at)
  where purchase_url is null;
