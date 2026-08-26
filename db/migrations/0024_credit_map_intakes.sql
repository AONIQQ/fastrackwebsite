create table if not exists credit_map_intakes (
  id bigserial primary key,
  sale_id bigint not null unique references sales(id),
  buyer_token_key text unique,
  buyer_token_expires_at timestamptz,
  status text not null default 'awaiting_intake',
  student_grade text,
  current_school_program text,
  graduation_year integer,
  state text,
  dual_enrollment_provider text,
  target_college text,
  intended_major text,
  current_dual_credit text,
  planning_context text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_map_intakes_token_key_check check (
    buyer_token_key is null or buyer_token_key ~ '^[A-Za-z0-9_-]{43}$'
  ),
  constraint credit_map_intakes_token_pair_check check (
    (buyer_token_key is null) = (buyer_token_expires_at is null)
  ),
  constraint credit_map_intakes_status_check check (
    status in ('awaiting_intake', 'submitted', 'in_progress', 'delivered')
  ),
  constraint credit_map_intakes_grade_check check (
    student_grade is null or student_grade in ('9', '10', '11', '12', 'graduated')
  ),
  constraint credit_map_intakes_school_length check (
    current_school_program is null or length(current_school_program) between 2 and 240
  ),
  constraint credit_map_intakes_graduation_year_check check (
    graduation_year is null or graduation_year between 2000 and 2100
  ),
  constraint credit_map_intakes_state_check check (
    state is null or state in (
      'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA',
      'MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX',
      'UT','VT','VA','WA','WV','WI','WY','DC'
    )
  ),
  constraint credit_map_intakes_target_college_length check (
    target_college is null or length(target_college) between 2 and 240
  ),
  constraint credit_map_intakes_provider_length check (
    dual_enrollment_provider is null or length(dual_enrollment_provider) between 2 and 240
  ),
  constraint credit_map_intakes_major_length check (
    intended_major is null or length(intended_major) between 2 and 160
  ),
  constraint credit_map_intakes_current_credit_length check (
    current_dual_credit is null or length(current_dual_credit) between 1 and 2000
  ),
  constraint credit_map_intakes_context_length check (
    planning_context is null or length(planning_context) between 1 and 2000
  ),
  constraint credit_map_intakes_submission_check check (
    (status = 'awaiting_intake' and submitted_at is null)
    or (
      status in ('submitted', 'in_progress', 'delivered')
      and submitted_at is not null
      and student_grade is not null
      and current_school_program is not null
      and graduation_year is not null
      and state is not null
      and dual_enrollment_provider is not null
      and target_college is not null
      and intended_major is not null
      and current_dual_credit is not null
    )
  )
);
-- migrate:split
create index if not exists credit_map_intakes_status_idx
  on credit_map_intakes (status, submitted_at, created_at);
