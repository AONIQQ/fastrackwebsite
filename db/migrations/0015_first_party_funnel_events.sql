create table if not exists calculator_funnel_sessions (
  session_digest text primary key,
  utm_source text not null,
  utm_medium text not null,
  utm_campaign text not null,
  utm_content text,
  traffic_class text not null,
  created_at timestamptz not null default now(),
  constraint calculator_funnel_sessions_digest_check check (session_digest ~ '^[0-9a-f]{64}$'),
  constraint calculator_funnel_sessions_source_check check (utm_source in ('direct','reddit','facebook','forum','email','youtube','google','bing')),
  constraint calculator_funnel_sessions_medium_check check (utm_medium in ('direct','organic','partner','nurture','email','cpc','referral')),
  constraint calculator_funnel_sessions_campaign_check check (utm_campaign ~ '^(agent-[0-9]{8}|qa-[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?|validation|direct)$'),
  constraint calculator_funnel_sessions_content_check check (utm_content is null or utm_content in ('partner-email','partner-form','community-reply','seo-page','homepage','calculator','qa-t230')),
  constraint calculator_funnel_sessions_direct_check check ((utm_source = 'direct') = (utm_medium = 'direct') and (utm_source = 'direct') = (utm_campaign = 'direct')),
  constraint calculator_funnel_sessions_traffic_class_check check (traffic_class in ('business','qa')),
  constraint calculator_funnel_sessions_qa_check check (traffic_class = 'qa' or (utm_campaign <> 'validation' and utm_campaign not like 'qa-%'))
);

-- migrate:split
create table if not exists calculator_funnel_events (
  id bigint generated always as identity primary key,
  session_digest text not null references calculator_funnel_sessions(session_digest),
  event_name text not null,
  occurred_at timestamptz not null default now(),
  constraint calculator_funnel_events_event_name_check check (event_name in ('Calculator Intent','Calculator Modal Opened','Capture Submission Attempted','Lead Captured','Capture Failed')),
  constraint calculator_funnel_events_session_event_key unique (session_digest, event_name)
);

-- migrate:split
create table if not exists calculator_funnel_ingest_windows (
  scope text not null,
  key_digest text not null,
  window_start timestamptz not null,
  session_count integer not null,
  expires_at timestamptz not null,
  primary key (scope, key_digest, window_start),
  constraint calculator_funnel_ingest_windows_scope_check check (scope in ('global','network')),
  constraint calculator_funnel_ingest_windows_digest_check check (key_digest ~ '^[0-9a-f]{64}$'),
  constraint calculator_funnel_ingest_windows_bucket_check check (window_start = date_trunc('hour', window_start)),
  constraint calculator_funnel_ingest_windows_count_check check (session_count between 1 and 500),
  constraint calculator_funnel_ingest_windows_expiry_check check (expires_at >= window_start + interval '1 hour')
);

-- migrate:split
create index calculator_funnel_events_reporting_idx on calculator_funnel_events (occurred_at desc, event_name, session_digest);

-- migrate:split
create index calculator_funnel_ingest_windows_expiry_idx on calculator_funnel_ingest_windows (expires_at);
