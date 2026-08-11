export const RESERVED_FIXTURE_RESULT_QUARANTINE_SQL = `
  with transaction_gate as materialized (
    select pg_advisory_xact_lock(hashtext('fastrack:fixture-result-quarantine'))
  ), locked_messages as materialized (
    select m.id, m.lead_id, m.kind, m.status, m.claim_token, m.claim_expires_at,
      m.attempt_count, m.next_attempt_at, m.rollout_dispatch_eligible,
      m.is_fixture as message_is_fixture, m.provider, m.provider_message_id,
      m.accepted_at, m.failure_category, m.provider_delivery_state,
      l.capture_id, l.is_fixture as lead_is_fixture, l.unsubscribed_at,
      lower(btrim(l.email)) as normalized_recipient
    from email_messages m
    join leads l on l.id = m.lead_id
    cross join transaction_gate
    for update of m, l
  ), target_matches as materialized (
    select * from locked_messages
    where capture_id = $1::uuid and kind = 'results'
  ), safety as materialized (
    select
      count(*)::int as target_message_count,
      count(*) filter (
        where message_is_fixture and lead_is_fixture
          and normalized_recipient = any($2::text[])
          and attempt_count > 0 and failure_category is not null
          and provider is null and provider_message_id is null and accepted_at is null
          and provider_delivery_state is null
          and (
            (status = 'retryable' and claim_token is null and claim_expires_at is null)
            or (status = 'claimed' and claim_expires_at <= now())
          )
      )::int as actionable_count,
      count(*) filter (
        where message_is_fixture and lead_is_fixture
          and normalized_recipient = any($2::text[])
          and attempt_count > 0 and failure_category is not null
          and provider is null and provider_message_id is null and accepted_at is null
          and provider_delivery_state is null
          and status = 'terminal' and rollout_dispatch_eligible = false
          and claim_token is null and claim_expires_at is null and unsubscribed_at is not null
      )::int as already_count,
      count(*) filter (where status = 'claimed' and claim_expires_at > now())::int as active_claim_count
    from target_matches
  ), candidate as materialized (
    select target.id, target.lead_id
    from target_matches target cross join safety
    where safety.target_message_count = 1
      and safety.actionable_count = 1
      and safety.already_count = 0
      and safety.active_claim_count = 0
  ), quarantined_message as (
    update email_messages message set
      status = 'terminal', terminal_at = coalesce(message.terminal_at, now()),
      rollout_dispatch_eligible = false, claim_token = null, claim_expires_at = null,
      updated_at = now()
    from candidate
    where message.id = candidate.id
    returning message.lead_id
  ), suppressed_lead as (
    update leads lead set unsubscribed_at = coalesce(lead.unsubscribed_at, now())
    where lead.id in (select lead_id from quarantined_message)
    returning lead.id as lead_id
  ), already_quarantined as (
    select target.lead_id
    from target_matches target cross join safety
    where safety.target_message_count = 1
      and safety.actionable_count = 0
      and safety.already_count = 1
      and safety.active_claim_count = 0
  )
  select count(*)::int as quarantined
  from (select lead_id from suppressed_lead union all select lead_id from already_quarantined) outcome
`
