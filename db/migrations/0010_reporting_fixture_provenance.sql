alter table sales
  add column if not exists is_fixture boolean default false;
-- migrate:split
alter table leads
  add constraint leads_capture_complete_risk_binding_check check (
    capture_id is null or (
      capture_risk_decision_id is not null and
      capture_request_hash is not null and
      capture_risk_decision is not null and
      capture_risk_accepted_at is not null and
      capture_risk_policy_version is not null and
      capture_risk_decision = 'accepted'
    )
  ) not valid;
-- migrate:split
alter table sales
  add constraint sales_fixture_provenance_check check (is_fixture is not null) not valid;
