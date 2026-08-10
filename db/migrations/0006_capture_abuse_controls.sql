create table if not exists capture_rate_windows (
  scope text not null,
  key_digest text not null,
  window_start timestamptz not null,
  window_seconds integer not null,
  attempt_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (scope, key_digest, window_start),
  constraint capture_rate_windows_scope_check check (scope in ('global', 'network', 'email', 'phone')),
  constraint capture_rate_windows_digest_check check (key_digest ~ '^[0-9a-f]{64}$'),
  constraint capture_rate_windows_window_check check (window_seconds between 60 and 86400),
  constraint capture_rate_windows_attempt_check check (attempt_count between 1 and 100)
);
-- migrate:split
create index if not exists capture_rate_windows_expiry_idx on capture_rate_windows (expires_at);
-- migrate:split
create table if not exists capture_risk_decisions (
  id bigserial primary key,
  capture_id uuid not null unique,
  request_hash text not null,
  policy_version text not null,
  decision text not null,
  reason_code text not null,
  sms_consent_requested boolean not null default false,
  sms_eligible boolean not null default false,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint capture_risk_decisions_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint capture_risk_decisions_policy_length check (length(policy_version) between 1 and 64),
  constraint capture_risk_decisions_decision_check check (decision in ('accepted', 'rejected')),
  constraint capture_risk_decisions_reason_check check (reason_code in ('accepted', 'global_limit', 'network_limit', 'email_limit', 'phone_limit')),
  constraint capture_risk_decisions_acceptance_check check ((decision = 'accepted') = (accepted_at is not null)),
  constraint capture_risk_decisions_sms_check check (sms_eligible = false)
);
-- migrate:split
create index if not exists capture_risk_decisions_expiry_idx on capture_risk_decisions (expires_at);
-- migrate:split
alter table leads
  add column if not exists capture_risk_decision_id bigint,
  add column if not exists capture_risk_accepted_at timestamptz,
  add column if not exists capture_risk_policy_version text
    constraint leads_capture_risk_policy_length check (
      capture_risk_policy_version is null or length(capture_risk_policy_version) between 1 and 64
    ),
  add column if not exists phone_verified_at timestamptz,
  add column if not exists sms_eligible boolean
    constraint leads_sms_eligibility_check check (
      coalesce(sms_eligible = false, true) or (
        sms_consent = true and num_nonnulls(
          normalized_phone, sms_consent_at, sms_consent_version, phone_verified_at,
          capture_risk_decision_id, capture_risk_accepted_at
        ) = 6
      )
    )
;
