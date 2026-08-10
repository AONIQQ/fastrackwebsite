alter table email_messages
  add column if not exists rollout_dispatch_eligible boolean default true;
-- migrate:split
create index if not exists email_messages_rollout_dispatch_idx
  on email_messages (kind, rollout_dispatch_eligible, status, next_attempt_at, claim_expires_at);
