create table if not exists capture_reporting_buckets (
  bucket_start timestamptz not null,
  event_type text not null,
  reason_code text not null,
  attribution_validity text not null,
  traffic_class text not null,
  event_count bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (bucket_start, event_type, reason_code, attribution_validity, traffic_class),
  constraint capture_reporting_bucket_hour_check check (bucket_start = date_trunc('hour', bucket_start)),
  constraint capture_reporting_event_check check (event_type in ('attempt', 'accepted', 'deduplicated', 'rejected', 'persistence_unconfirmed', 'result_displayed')),
  constraint capture_reporting_reason_check check (reason_code in ('none', 'stable_replay', 'invalid_json', 'invalid_body', 'honeypot', 'invalid_capture_id', 'invalid_email', 'invalid_state', 'invalid_residency', 'invalid_college', 'invalid_phone', 'invalid_consent', 'invalid_attribution', 'invalid_referrer', 'payload_too_large', 'risk_identity_missing', 'capture_mismatch', 'global_limit', 'network_limit', 'email_limit', 'phone_limit', 'database_or_response_unconfirmed')),
  constraint capture_reporting_attribution_check check (attribution_validity in ('direct', 'external_referrer', 'valid_utm', 'valid_click_id', 'invalid', 'unknown')),
  constraint capture_reporting_traffic_check check (traffic_class in ('genuine', 'fixture', 'unknown')),
  constraint capture_reporting_count_check check (event_count between 1 and 9223372036854775807)
);
-- migrate:split
alter table leads
  add column if not exists attribution_validity text,
  add column if not exists result_displayed_at timestamptz;
-- migrate:split
alter table leads
  add constraint leads_capture_state_check check (state is null or state::text in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY')) not valid,
  add constraint leads_capture_residency_check check (residency is null or residency in ('inState', 'outOfState')) not valid,
  add constraint leads_capture_hash_check check (capture_request_hash is null or capture_request_hash ~ '^[0-9a-f]{64}$') not valid,
  add constraint leads_capture_attribution_validity_check check (attribution_validity is null or attribution_validity in ('direct', 'external_referrer', 'valid_utm', 'valid_click_id')) not valid,
  add constraint leads_capture_attribution_bounds_check check (
    (utm_source is null or length(utm_source) <= 64) and
    (utm_medium is null or length(utm_medium) <= 64) and
    (utm_campaign is null or length(utm_campaign) <= 128) and
    (utm_content is null or length(utm_content) <= 128) and
    (utm_term is null or length(utm_term) <= 128) and
    (gclid is null or length(gclid) <= 256) and
    (fbclid is null or length(fbclid) <= 256) and
    (normalized_referrer is null or length(normalized_referrer) <= 512)
  ) not valid,
  add constraint leads_capture_utm_shape_check check (capture_id is null or utm is null or jsonb_typeof(utm) = 'object') not valid,
  add constraint leads_capture_consent_relationship_check check (
    capture_id is null or sms_consent = false or (
      normalized_phone ~ '^\\+1[0-9]{10}$' and
      sms_consent_at is not null and
      length(sms_consent_version) between 1 and 64
    )
  ) not valid,
  add constraint leads_capture_lifecycle_check check (
    capture_id is null or (
      capture_request_hash is not null and college_id is not null and
      capture_risk_decision_id is not null and capture_risk_accepted_at is not null and
      capture_risk_policy_version is not null and attribution_validity is not null and
      is_fixture is not null
    )
  ) not valid,
  add constraint leads_result_display_relationship_check check (result_displayed_at is null or capture_id is not null) not valid,
  add constraint leads_nurture_stage_check check (nurture_stage between 0 and 4) not valid,
  add constraint leads_capture_college_fk foreign key (college_id) references colleges (id) not valid,
  add constraint leads_capture_risk_fk foreign key (capture_risk_decision_id) references capture_risk_decisions (id) not valid;
-- migrate:split
create index if not exists capture_reporting_bucket_idx on capture_reporting_buckets (bucket_start, event_type);
-- migrate:split
create index if not exists leads_capture_reporting_idx on leads (created_at, is_fixture, attribution_validity) where capture_id is not null;
