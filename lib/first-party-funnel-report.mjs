export const FIRST_PARTY_FUNNEL_REPORT_SQL = `
  with windows(label, since) as (
    values ('7d'::text, now() - interval '7 days'), ('30d'::text, now() - interval '30 days')
  ), counts as (
    select w.label as report_window, s.traffic_class, s.utm_source as source,
      s.utm_medium as medium, s.utm_campaign as campaign, s.utm_content as content,
      count(*) filter (where e.event_name = 'Calculator Intent')::int as intent,
      count(*) filter (where e.event_name = 'Calculator Modal Opened')::int as modal_opened,
      count(*) filter (where e.event_name = 'Capture Submission Attempted')::int as submission_attempted,
      count(*) filter (where e.event_name = 'Lead Captured')::int as lead_captured,
      count(*) filter (where e.event_name = 'Capture Failed')::int as capture_failed
    from windows w join calculator_funnel_events e on e.occurred_at >= w.since
    join calculator_funnel_sessions s on s.session_digest = e.session_digest
    group by w.label, s.traffic_class, s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content
  )
  select report_window as "window", traffic_class, source, medium, campaign, content, intent, modal_opened,
    submission_attempted, lead_captured, capture_failed,
    round(modal_opened::numeric / nullif(intent, 0), 4)::float8 as modal_per_intent,
    round(submission_attempted::numeric / nullif(modal_opened, 0), 4)::float8 as attempt_per_modal,
    round(lead_captured::numeric / nullif(intent, 0), 4)::float8 as captured_per_intent,
    round(lead_captured::numeric / nullif(submission_attempted, 0), 4)::float8 as captured_per_attempt
  from counts
  order by case report_window when '7d' then 1 else 2 end, traffic_class, intent desc, source, campaign, content nulls first
`
