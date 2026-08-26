export const NURTURE_ENQUEUE_LOCK_SQL = `
  select pg_advisory_xact_lock(hashtext('fastrack:nurture-enqueue'))
`

const NURTURE_ELIGIBLE_SQL = `
  select l.id as lead_id, l.nurture_stage + 1 as stage, l.is_fixture
  from leads l
  where $1::boolean
    and l.created_at >= '2026-08-06'
    and l.nurture_stage < 4 and l.unsubscribed_at is null
    and exists (
      select 1 from email_messages r
      where r.lead_id = l.id and r.kind = 'results' and r.status in ('accepted', 'terminal')
    )
    and extract(epoch from (coalesce($2::timestamptz, now()) - l.created_at)) / 86400 >=
      case l.nurture_stage + 1 when 1 then 2 when 2 then 5 when 3 then 8 when 4 then 12 end
`

export const NURTURE_ENQUEUE_SQL = `
  with eligible as (
    ${NURTURE_ELIGIBLE_SQL}
  ), inserted as (
    insert into email_messages (
      lead_id, kind, nurture_stage, logical_key, provider_idempotency_key, is_fixture,
      rollout_dispatch_eligible
    ) select lead_id, 'nurture', stage, 'lead:' || lead_id || ':nurture:' || stage,
      'ft-lead-' || lead_id || '-n' || stage, coalesce(is_fixture, false), true
    from eligible on conflict (logical_key) do nothing returning id
  ) select count(*)::int as enqueued from inserted
`

export const NURTURE_ELIGIBLE_WITHOUT_ROW_SQL = `
  with eligible as (
    ${NURTURE_ELIGIBLE_SQL}
  )
  select count(*)::int as eligible_without_row
  from eligible
  where not exists (
      select 1 from email_messages n
      where n.lead_id = eligible.lead_id and n.kind = 'nurture'
        and n.nurture_stage = eligible.stage
    )
`
