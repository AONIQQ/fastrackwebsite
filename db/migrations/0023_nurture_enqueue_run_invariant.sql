alter table nurture_runs
  add column if not exists nurture_enqueued integer,
  add column if not exists nurture_eligible_without_row integer;
-- migrate:split
alter table nurture_runs
  add constraint nurture_runs_nurture_enqueued_check
    check (nurture_enqueued is null or nurture_enqueued >= 0) not valid,
  add constraint nurture_runs_nurture_eligible_without_row_check
    check (nurture_eligible_without_row is null or nurture_eligible_without_row >= 0) not valid;
