alter table capture_risk_decisions
  add column if not exists validation_code text
    constraint capture_risk_decisions_validation_code_check
      check (validation_code is null or validation_code = 'invalid_college');
