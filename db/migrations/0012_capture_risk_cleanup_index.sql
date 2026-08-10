create index if not exists leads_capture_risk_decision_idx
  on leads (capture_risk_decision_id)
  where capture_risk_decision_id is not null;
