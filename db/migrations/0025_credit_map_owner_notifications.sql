create table if not exists credit_map_owner_notifications (
  intake_id bigint primary key references credit_map_intakes(id),
  provider_idempotency_key uuid not null unique,
  status text not null default 'pending',
  message_subject text,
  message_text text,
  claim_token uuid,
  claim_expires_at timestamptz,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_map_owner_notifications_status_check check (
    status in ('pending', 'claimed', 'sent')
  ),
  constraint credit_map_owner_notifications_attempt_count_check check (
    attempt_count >= 0
  ),
  constraint credit_map_owner_notifications_message_pair_check check (
    (message_subject is null) = (message_text is null)
    and (message_subject is null or (length(message_subject) between 1 and 160 and length(message_text) between 1 and 1200))
  ),
  constraint credit_map_owner_notifications_claim_pair_check check (
    (claim_token is null) = (claim_expires_at is null)
  ),
  constraint credit_map_owner_notifications_provider_message_check check (
    provider_message_id is null or length(provider_message_id) between 1 and 255
  ),
  constraint credit_map_owner_notifications_state_shape_check check (
    (status = 'pending' and claim_token is null and sent_at is null and provider_message_id is null)
    or (status = 'claimed' and claim_token is not null and sent_at is null and provider_message_id is null)
    or (status = 'sent' and claim_token is null and sent_at is not null and provider_message_id is not null)
  )
);
-- migrate:split
create index if not exists credit_map_owner_notifications_dispatch_idx
  on credit_map_owner_notifications (status, claim_expires_at, created_at)
  where sent_at is null;
