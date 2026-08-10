create table if not exists email_provider_events (
  provider_event_id text primary key,
  email_message_id bigint references email_messages(id),
  provider_message_id text not null,
  event_type text not null,
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  failure_category text,
  outcome text not null,
  is_fixture boolean not null default false,
  constraint email_provider_events_type_check check (
    event_type in ('sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'suppressed', 'failed')
  ),
  constraint email_provider_events_outcome_check check (outcome in ('matched', 'unmatched')),
  constraint email_provider_events_failure_length check (
    failure_category is null or length(failure_category) <= 64
  )
);
-- migrate:split
create index if not exists email_provider_events_message_idx
  on email_provider_events (email_message_id, provider_created_at);
-- migrate:split
create index if not exists email_provider_events_operations_idx
  on email_provider_events (is_fixture, received_at, event_type, outcome);
-- migrate:split
alter table email_messages
  add column if not exists provider_delivery_state text,
  add column if not exists provider_state_at timestamptz,
  add column if not exists provider_failure_category text,
  add constraint email_messages_provider_delivery_state_check check (
    provider_delivery_state is null or provider_delivery_state in (
      'sent', 'delivery_delayed', 'delivered', 'bounced', 'complained', 'suppressed', 'failed'
    )
  ),
  add constraint email_messages_provider_failure_length check (
    provider_failure_category is null or length(provider_failure_category) <= 64
  );
