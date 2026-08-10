alter table leads
  add column if not exists capture_risk_decision text;
-- migrate:split
create unique index if not exists capture_risk_decisions_binding_idx
  on capture_risk_decisions (id, capture_id, request_hash, decision, accepted_at, policy_version);
-- migrate:split
alter table leads
  add constraint leads_capture_risk_decision_check check (
    capture_id is null or capture_risk_decision = 'accepted'
  ) not valid,
  add constraint leads_capture_risk_binding_fk foreign key (
    capture_risk_decision_id, capture_id, capture_request_hash,
    capture_risk_decision, capture_risk_accepted_at, capture_risk_policy_version
  ) references capture_risk_decisions (
    id, capture_id, request_hash, decision, accepted_at, policy_version
  ) not valid;
