export const RESERVED_FIXTURE_RESULT_CLAIM_SQL = `
  with transaction_gate as materialized (
    select pg_advisory_xact_lock(hashtext('fastrack:fixture-result-dispatch'))
  ), locked_messages as materialized (
    select m.id, m.lead_id, m.kind, m.status, m.claim_token, m.claim_expires_at,
      m.next_attempt_at, m.rollout_dispatch_eligible, m.is_fixture as message_is_fixture,
      l.capture_id, l.is_fixture as lead_is_fixture, l.unsubscribed_at,
      lower(btrim(l.email)) as normalized_recipient
    from email_messages m
    join leads l on l.id = m.lead_id
    cross join transaction_gate
    for update of m, l
  ), target_matches as materialized (
    select * from locked_messages
    where capture_id = $1::uuid and kind = 'results'
  ), safety as (
    select
      count(*) filter (
        where capture_id = $1::uuid and kind = 'results'
          and message_is_fixture and lead_is_fixture
          and unsubscribed_at is null
          and normalized_recipient = any($4::text[])
          and (
            (status = 'pending'
              and coalesce(rollout_dispatch_eligible, true) = false
              and claim_token is null and claim_expires_at is null)
            or (status = 'retryable'
              and coalesce(rollout_dispatch_eligible, true)
              and next_attempt_at <= now()
              and claim_token is null and claim_expires_at is null)
            or (status = 'claimed'
              and coalesce(rollout_dispatch_eligible, true)
              and claim_expires_at <= now())
          )
      )::int as exact_target_count,
      count(*) filter (
        where capture_id = $1::uuid and kind = 'results'
      )::int as target_message_count,
      count(*) filter (
        where status = 'claimed' and claim_expires_at > now()
      )::int as active_claim_count,
      count(*) filter (
        where capture_id is distinct from $1::uuid
          and coalesce(rollout_dispatch_eligible, true)
          and next_attempt_at <= now()
          and (status in ('pending', 'retryable')
            or (status = 'claimed' and claim_expires_at <= now()))
          and unsubscribed_at is null
      )::int as other_dispatch_candidate_count
    from locked_messages
  ), candidate as (
    select target.id, target.lead_id,
      case target.status
        when 'pending' then 'fixture_pending'
        when 'retryable' then 'fixture_retryable'
        else 'fixture_claimed'
      end::text as claim_origin
    from target_matches target cross join safety
    where safety.exact_target_count = 1
      and safety.target_message_count = 1
      and safety.active_claim_count = 0
      and safety.other_dispatch_candidate_count = 0
  ), identity as (
    insert into email_message_identities (email_message_id, tracking_id)
    select id, $3::uuid from candidate
    on conflict (email_message_id) do update
      set tracking_id = email_message_identities.tracking_id
    returning email_message_id, tracking_id
  ), claimed as (
    update email_messages m set
      rollout_dispatch_eligible = true,
      status = 'claimed', claim_token = $2::uuid,
      claim_expires_at = now() + interval '10 minutes',
      attempt_count = attempt_count + 1, updated_at = now()
    from candidate join identity on identity.email_message_id = candidate.id
    where m.id = candidate.id
      and (
        (m.status = 'pending'
          and coalesce(m.rollout_dispatch_eligible, true) = false
          and m.claim_token is null and m.claim_expires_at is null)
        or (m.status = 'retryable'
          and coalesce(m.rollout_dispatch_eligible, true)
          and m.next_attempt_at <= now()
          and m.claim_token is null and m.claim_expires_at is null)
        or (m.status = 'claimed'
          and coalesce(m.rollout_dispatch_eligible, true)
          and m.claim_expires_at <= now())
      )
    returning m.*, identity.tracking_id, candidate.claim_origin
  )
  select claimed.id, claimed.lead_id, claimed.kind, claimed.nurture_stage,
    claimed.provider_idempotency_key, claimed.claim_token, claimed.attempt_count,
    claimed.tracking_id, claimed.claim_origin, claimed.is_fixture,
    leads.email, leads.college, leads.residency, leads.snapshot
  from claimed join leads on leads.id = claimed.lead_id
`
