alter table calculator_funnel_sessions
  drop constraint if exists calculator_funnel_sessions_source_check;

-- migrate:split
alter table calculator_funnel_sessions
  add constraint calculator_funnel_sessions_source_check
  check (utm_source in (
    'direct', 'reddit', 'facebook', 'forum', 'email', 'youtube', 'google', 'bing',
    'instagram', 'tiktok', 'referral'
  ));
