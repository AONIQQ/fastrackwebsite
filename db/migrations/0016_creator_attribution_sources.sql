alter table calculator_funnel_sessions
  drop constraint if exists calculator_funnel_sessions_source_check;

-- migrate:split
alter table calculator_funnel_sessions
  add constraint calculator_funnel_sessions_source_check
  check (utm_source in (
    'direct', 'reddit', 'facebook', 'forum', 'email', 'youtube', 'google', 'bing',
    'instagram', 'tiktok'
  ));

-- migrate:split
alter table calculator_funnel_sessions
  drop constraint if exists calculator_funnel_sessions_campaign_check;

-- migrate:split
alter table calculator_funnel_sessions
  add constraint calculator_funnel_sessions_campaign_check
  check (utm_campaign ~ '^(agent-[0-9]{8}|creator-[0-9]{8}|qa-[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?|validation|direct)$');
