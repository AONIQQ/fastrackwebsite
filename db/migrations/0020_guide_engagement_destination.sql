alter table email_engagement_events
  drop constraint if exists email_engagement_destination_check;

-- migrate:split
alter table email_engagement_events
  add constraint email_engagement_destination_check check (
    (event_type = 'open' and destination_key is null)
    or (
      event_type = 'click'
      and destination_key in ('home', 'calculator', 'guide', 'credit_map', 'checkout')
    )
  );
