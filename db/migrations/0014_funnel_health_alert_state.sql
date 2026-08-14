create table if not exists funnel_health_alert_state (
  scope text primary key,
  alerted_fingerprint text,
  pending_kind text,
  pending_fingerprint text,
  pending_message jsonb,
  transition_sequence bigint not null default 0,
  claim_token uuid,
  claim_expires_at timestamptz,
  last_sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint funnel_health_alert_state_scope_check check (scope = 'owner'),
  constraint funnel_health_alert_state_pending_kind_check check (pending_kind is null or pending_kind in ('alert', 'recovery')),
  constraint funnel_health_alert_state_pending_pair_check check (
    (pending_kind is null) = (pending_fingerprint is null)
    and (pending_kind is null) = (pending_message is null)
  ),
  constraint funnel_health_alert_state_message_shape_check check (
    pending_message is null or (
      jsonb_typeof(pending_message) = 'object'
      and jsonb_typeof(pending_message->'subject') = 'string'
      and jsonb_typeof(pending_message->'text') = 'string'
      and length(pending_message->>'subject') between 1 and 160
      and length(pending_message->>'text') between 1 and 4000
      and (pending_message->>'subject') not like '%@%'
      and (pending_message->>'text') not like '%@%'
    )
  ),
  constraint funnel_health_alert_state_claim_pair_check check ((claim_token is null) = (claim_expires_at is null))
);
