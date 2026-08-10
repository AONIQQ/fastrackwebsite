create table if not exists email_message_identities (
  email_message_id bigint primary key references email_messages(id),
  tracking_id uuid not null unique,
  created_at timestamptz not null default now()
);
-- migrate:split
create table if not exists email_engagement_events (
  id bigserial primary key,
  email_message_id bigint not null references email_messages(id),
  step text not null,
  event_type text not null,
  destination_key text,
  created_at timestamptz not null default now(),
  constraint email_engagement_step_check check (step in ('results', 'n1', 'n2', 'n3', 'n4')),
  constraint email_engagement_type_check check (event_type in ('open', 'click')),
  constraint email_engagement_destination_check check (
    (event_type = 'open' and destination_key is null) or
    (event_type = 'click' and destination_key in ('home', 'calculator', 'credit_map', 'checkout'))
  )
);
-- migrate:split
create index if not exists email_engagement_message_idx
  on email_engagement_events (email_message_id, event_type, created_at);
-- migrate:split
alter table sales
  add column if not exists email_message_id bigint references email_messages(id),
  add column if not exists attribution_outcome text,
  add constraint sales_attribution_outcome_check check (
    attribution_outcome is null or attribution_outcome in (
      'attributed', 'unattributed', 'invalid_token', 'invalid_identity', 'forwarded_unattributed'
    )
  );
-- migrate:split
create index if not exists sales_email_message_idx
  on sales (email_message_id) where email_message_id is not null;
