export const FIRST_PARTY_FUNNEL_REPORT_SQL = `
  with windows(label, since) as (
    values ('7d'::text, now() - interval '7 days'), ('30d'::text, now() - interval '30 days')
  ), event_counts as (
    select w.label as report_window, s.traffic_class, s.utm_source as source,
      s.utm_medium as medium, s.utm_campaign as campaign, s.utm_content as content,
      count(*) filter (where e.event_name = 'Calculator Intent')::int as intent,
      count(*) filter (where e.event_name = 'Calculator Modal Opened')::int as modal_opened,
      count(*) filter (where e.event_name = 'Capture Submission Attempted')::int as submission_attempted,
      count(*) filter (where e.event_name = 'Lead Captured')::int as capture_acknowledged,
      count(*) filter (where e.event_name = 'Capture Failed')::int as capture_failed
    from windows w join calculator_funnel_events e on e.occurred_at >= w.since
    join calculator_funnel_sessions s on s.session_digest = e.session_digest
    group by w.label, s.traffic_class, s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content
  ), normalized_leads as (
    select created_at, 'business'::text as traffic_class,
      case when raw_source in ('direct','reddit','facebook','forum','email','youtube','google','bing','instagram','tiktok','referral','podcast')
        then raw_source else 'unclassified' end as source,
      case when raw_medium in ('direct','organic','partner','nurture','email','cpc','referral')
        then raw_medium else 'unclassified' end as medium,
      case when raw_campaign = 'direct' or raw_campaign = 'validation'
          or raw_campaign ~ '^agent-[0-9]{8}$' or raw_campaign ~ '^creator-[0-9]{8}$'
          or raw_campaign ~ '^qa-[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$'
        then raw_campaign else 'unclassified' end as campaign,
      case when raw_content in ('partner-email','partner-form','community-reply','seo-page','homepage','calculator')
          or raw_content ~ '^partner-p[0-9]{4}$'
        then raw_content else null end as content
    from (
      select created_at,
        lower(coalesce(nullif(trim(utm_source),''), nullif(trim(utm->>'utm_source'),''), 'direct')) as raw_source,
        lower(coalesce(nullif(trim(utm_medium),''), nullif(trim(utm->>'utm_medium'),''), 'direct')) as raw_medium,
        lower(coalesce(nullif(trim(utm_campaign),''), nullif(trim(utm->>'utm_campaign'),''), 'direct')) as raw_campaign,
        lower(coalesce(nullif(trim(utm_content),''), nullif(trim(utm->>'utm_content'),''))) as raw_content
      from leads
      where not coalesce(is_fixture, false) and capture_risk_decision = 'accepted'
    ) accepted
  ), lead_counts as (
    select w.label as report_window, l.traffic_class, l.source, l.medium, l.campaign, l.content,
      count(*)::int as durable_leads
    from windows w join normalized_leads l on l.created_at >= w.since
    group by w.label, l.traffic_class, l.source, l.medium, l.campaign, l.content
  ), report_keys as (
    select report_window, traffic_class, source, medium, campaign, content from event_counts
    union
    select report_window, traffic_class, source, medium, campaign, content from lead_counts
  ), combined as (
    select k.report_window, k.traffic_class, k.source, k.medium, k.campaign, k.content,
      coalesce(e.intent, 0)::int as intent,
      coalesce(e.modal_opened, 0)::int as modal_opened,
      coalesce(e.submission_attempted, 0)::int as submission_attempted,
      coalesce(l.durable_leads, 0)::int as lead_captured,
      coalesce(e.capture_acknowledged, 0)::int as capture_acknowledged,
      coalesce(e.capture_failed, 0)::int as capture_failed
    from report_keys k
    left join event_counts e on e.report_window = k.report_window and e.traffic_class = k.traffic_class
      and e.source = k.source and e.medium = k.medium and e.campaign = k.campaign
      and e.content is not distinct from k.content
    left join lead_counts l on l.report_window = k.report_window and l.traffic_class = k.traffic_class
      and l.source = k.source and l.medium = k.medium and l.campaign = k.campaign
      and l.content is not distinct from k.content
  )
  select report_window as "window", traffic_class, source, medium, campaign, content,
    intent, modal_opened, submission_attempted, lead_captured, capture_acknowledged, capture_failed,
    round(modal_opened::numeric / nullif(intent, 0), 4)::float8 as modal_per_intent,
    round(submission_attempted::numeric / nullif(modal_opened, 0), 4)::float8 as attempt_per_modal,
    round(lead_captured::numeric / nullif(intent, 0), 4)::float8 as captured_per_intent,
    round(lead_captured::numeric / nullif(submission_attempted, 0), 4)::float8 as captured_per_attempt
  from combined
  order by case report_window when '7d' then 1 else 2 end, traffic_class, intent desc, source, campaign, content nulls first
`
