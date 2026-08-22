alter table calculator_funnel_sessions
  drop constraint if exists calculator_funnel_sessions_content_check;

-- migrate:split
alter table calculator_funnel_sessions
  add constraint calculator_funnel_sessions_content_check
  check (
    utm_content is null
    or utm_content in (
      'partner-email', 'partner-form', 'community-reply', 'seo-page',
      'homepage', 'calculator', 'qa-t230'
    )
    or (
      utm_content ~ '^partner-p[0-9]{4}$'
      and utm_source <> 'direct'
      and utm_medium in ('partner', 'referral')
    )
    or (
      utm_content ~ '^alexis-v[0-9]{3}$'
      and utm_source in ('instagram', 'tiktok', 'facebook', 'youtube')
      and utm_medium = 'organic'
      and utm_campaign ~ '^creator-[0-9]{8}$'
    )
  );
