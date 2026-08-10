import { neon } from '@neondatabase/serverless';
import { CAPTURE_ABUSE_CLEANUP_BATCH_SIZE } from './capture-abuse-cleanup.mjs';
import { boundedCaptureReportEvent } from './capture-reporting.mjs';

// HTTP driver rather than a TCP pool. In serverless functions a pool either leaks
// connections across invocations or pays a handshake on every cold start; the HTTP
// driver does neither, and this workload never needs a transaction.
// Lazy init: `neon()` throws on a missing/empty URL, and the URL is only present in
// the deployed environment, a module-scope call breaks local `next build`.
let _sql: ReturnType<typeof neon> | null = null;
function client() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
  return _sql;
}
export const sql: ReturnType<typeof neon> = new Proxy(function () {} as never, {
  apply: (_t, _this, args) => (client() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => (client() as never)[prop],
}) as unknown as ReturnType<typeof neon>;


export type CollegeRow = {
  id: number;
  name: string;
  city: string | null;
  state: string;
  ownership: number | null;
  tuition_in: number | null;
  tuition_out: number | null;
  net_price: number | null;
  earnings_6yr: number | null;
  earnings_10yr: number | null;
};

/**
 * A college is only offered in the dropdown if we can actually compute a result
 * for it. The loader intentionally ingests every operating institution, around
 * 6,500, including certificate schools, and this is where that gets narrowed.
 */
const COMPUTABLE = `
  coalesce(net_price, tuition_in, tuition_out) is not null
  and (earnings_6yr is not null or earnings_10yr is not null)
`;

/** States that actually have selectable colleges, with their cost-of-living figure. */
export async function getStates() {
  return (await sql`
    select c.state, count(*)::int as college_count, col.annual_cost
    from colleges c
    join cost_of_living col on col.state = c.state
    where ${sql.unsafe(COMPUTABLE)}
    group by c.state, col.annual_cost
    having count(*) > 0
    order by c.state
  `) as { state: string; college_count: number; annual_cost: number }[];
}

/** College names for a state. Matches the old endpoint's bare string[] shape. */
export async function getCollegeNamesByState(state: string): Promise<string[]> {
  const rows = (await sql`
    select distinct name
    from colleges
    where state = ${state.toUpperCase()} and ${sql.unsafe(COMPUTABLE)}
    order by name
  `) as { name: string }[];
  return rows.map((r) => r.name);
}

/** Fuller payload for the rewritten picker: id, city and enrollment for disambiguation. */
export async function getCollegesByState(state: string) {
  return (await sql`
    select id, name, city, student_size
    from colleges
    where state = ${state.toUpperCase()} and ${sql.unsafe(COMPUTABLE)}
    order by student_size desc nulls last, name
  `) as { id: number; name: string; city: string | null; student_size: number | null }[];
}

const COLLEGE_FIELDS = `
  c.id, c.name, c.city, c.state, c.ownership,
  c.tuition_in, c.tuition_out, c.net_price,
  c.earnings_6yr, c.earnings_10yr,
  col.annual_cost as cost_of_living
`;

export async function getCollegeByName(name: string) {
  const rows = (await sql`
    select ${sql.unsafe(COLLEGE_FIELDS)}
    from colleges c
    left join cost_of_living col on col.state = c.state
    where lower(c.name) = lower(${name})
    order by c.student_size desc nulls last
    limit 1
  `) as (CollegeRow & { cost_of_living: number | null })[];
  return rows[0] ?? null;
}

export async function getCollegeById(id: number) {
  const rows = (await sql`
    select ${sql.unsafe(COLLEGE_FIELDS)}
    from colleges c
    left join cost_of_living col on col.state = c.state
    where c.id = ${id}
  `) as (CollegeRow & { cost_of_living: number | null })[];
  return rows[0] ?? null;
}

export async function getCostOfLiving(state: string): Promise<number | null> {
  const rows = (await sql`
    select annual_cost from cost_of_living where state = ${state.toUpperCase()}
  `) as { annual_cost: number }[];
  return rows[0]?.annual_cost ?? null;
}

type CaptureRiskKeys = {
  global: string;
  network: string;
  email: string;
  phone: string | null;
};

type CaptureRatePolicy = { windowSeconds: number; limit: number };

export async function claimCaptureRisk(input: {
  captureId: string;
  requestHash: string;
  collegeId: number;
  state: string;
  residency: 'inState' | 'outOfState';
  policyVersion: string;
  keys: CaptureRiskKeys;
  policies: Record<'global' | 'network' | 'email' | 'phone', CaptureRatePolicy>;
  smsConsentRequested: boolean;
  now?: Date;
  retentionDays: number;
}) {
  const now = input.now ?? new Date();
  const bucket = (seconds: number) => new Date(Math.floor(now.getTime() / (seconds * 1000)) * seconds * 1000);
  const expires = (seconds: number) => new Date(bucket(seconds).getTime() + (seconds * 1000) + 86_400_000);
  const decisionExpires = new Date(now.getTime() + input.retentionDays * 86_400_000);
  const globalPolicy = input.policies.global;
  const networkPolicy = input.policies.network;
  const emailPolicy = input.policies.email;
  const phonePolicy = input.policies.phone;

  // The lock and decision query must be separate commands in one READ COMMITTED
  // transaction. A statement that waits inside ON CONFLICT keeps its original
  // snapshot and cannot reliably see the winner's decision afterward. The
  // second command receives a fresh snapshot after the transaction-scoped lock,
  // so one capture UUID consumes rate windows once and every identical replay
  // observes the stable decision.
  const database = client();
  if (typeof database.transaction !== 'function') throw new Error('capture risk transaction unavailable');
  const transaction = await database.transaction((txn) => [
    txn`select pg_advisory_xact_lock(hashtextextended(${input.captureId}, 0))`,
    txn`
    with known as (
      select id, request_hash from capture_risk_decisions where capture_id = ${input.captureId}::uuid
    ), global_window as (
      insert into capture_rate_windows (
        scope, key_digest, window_start, window_seconds, attempt_count, expires_at
      )
      select 'global', ${input.keys.global}, ${bucket(globalPolicy.windowSeconds)},
        ${globalPolicy.windowSeconds}, 1, ${expires(globalPolicy.windowSeconds)}
      where not exists (select 1 from known)
      on conflict (scope, key_digest, window_start) do update
        set attempt_count = capture_rate_windows.attempt_count + 1
        where capture_rate_windows.attempt_count < ${globalPolicy.limit}
      returning 1
    ), network_window as (
      insert into capture_rate_windows (
        scope, key_digest, window_start, window_seconds, attempt_count, expires_at
      )
      select 'network', ${input.keys.network}, ${bucket(networkPolicy.windowSeconds)},
        ${networkPolicy.windowSeconds}, 1, ${expires(networkPolicy.windowSeconds)}
      where not exists (select 1 from known) and exists (select 1 from global_window)
      on conflict (scope, key_digest, window_start) do update
        set attempt_count = capture_rate_windows.attempt_count + 1
        where capture_rate_windows.attempt_count < ${networkPolicy.limit}
      returning 1
    ), valid_business_identity as (
      select 1
      from colleges
      where id = ${input.collegeId} and state = ${input.state}
        and ${input.residency} in ('inState', 'outOfState')
        and coalesce(net_price, tuition_in, tuition_out) is not null
        and (earnings_6yr is not null or earnings_10yr is not null)
    ), email_window as (
      insert into capture_rate_windows (
        scope, key_digest, window_start, window_seconds, attempt_count, expires_at
      )
      select 'email', ${input.keys.email}, ${bucket(emailPolicy.windowSeconds)},
        ${emailPolicy.windowSeconds}, 1, ${expires(emailPolicy.windowSeconds)}
      where not exists (select 1 from known) and exists (select 1 from network_window)
        and exists (select 1 from valid_business_identity)
      on conflict (scope, key_digest, window_start) do update
        set attempt_count = capture_rate_windows.attempt_count + 1
        where capture_rate_windows.attempt_count < ${emailPolicy.limit}
      returning 1
    ), phone_window as (
      insert into capture_rate_windows (
        scope, key_digest, window_start, window_seconds, attempt_count, expires_at
      )
      select 'phone', ${input.keys.phone}, ${bucket(phonePolicy.windowSeconds)},
        ${phonePolicy.windowSeconds}, 1, ${expires(phonePolicy.windowSeconds)}
      where ${input.keys.phone} is not null and not exists (select 1 from known)
        and exists (select 1 from email_window)
      on conflict (scope, key_digest, window_start) do update
        set attempt_count = capture_rate_windows.attempt_count + 1
        where capture_rate_windows.attempt_count < ${phonePolicy.limit}
      returning 1
    ), decision_write as (
      insert into capture_risk_decisions (
        capture_id, request_hash, policy_version, decision, reason_code,
        validation_code, sms_consent_requested, sms_eligible, accepted_at, expires_at
      )
      select ${input.captureId}::uuid, ${input.requestHash}, ${input.policyVersion},
        case when exists (select 1 from global_window)
          and exists (select 1 from network_window)
          and exists (select 1 from valid_business_identity)
          and exists (select 1 from email_window)
          and (${input.keys.phone} is null or exists (select 1 from phone_window))
          then 'accepted' else 'rejected' end,
        case
          when not exists (select 1 from global_window) then 'global_limit'
          when not exists (select 1 from network_window) then 'network_limit'
          when not exists (select 1 from valid_business_identity) then 'email_limit'
          when not exists (select 1 from email_window) then 'email_limit'
          when ${input.keys.phone} is not null and not exists (select 1 from phone_window) then 'phone_limit'
          else 'accepted' end,
        case when not exists (select 1 from valid_business_identity) then 'invalid_college' else null end,
        ${input.smsConsentRequested}, false,
        case when exists (select 1 from global_window)
          and exists (select 1 from network_window)
          and exists (select 1 from valid_business_identity)
          and exists (select 1 from email_window)
          and (${input.keys.phone} is null or exists (select 1 from phone_window))
          then ${now} else null end,
        ${decisionExpires}
      where not exists (select 1 from known) and exists (select 1 from global_window)
      on conflict (capture_id) do update set capture_id = excluded.capture_id
        where capture_risk_decisions.request_hash = excluded.request_hash
      returning id, decision, reason_code, validation_code, sms_eligible, accepted_at, policy_version
    )
    select id, decision, reason_code, validation_code, sms_eligible, accepted_at, policy_version
    from decision_write
    union all
    select id, decision, reason_code, validation_code, sms_eligible, accepted_at, policy_version
    from capture_risk_decisions
    where capture_id = ${input.captureId}::uuid
      and request_hash = ${input.requestHash}
      and not exists (select 1 from decision_write)
    union all
    select 0, 'rejected', 'global_limit', null, false, null, ${input.policyVersion}
    where not exists (select 1 from known)
      and not exists (select 1 from global_window)
      and not exists (select 1 from decision_write)
    limit 1
  `,
  ], { isolationLevel: 'ReadCommitted' });
  const rows = transaction[1] as {
    id: number;
    decision: 'accepted' | 'rejected';
    reason_code: string;
    validation_code: string | null;
    sms_eligible: boolean;
    accepted_at: string | null;
    policy_version: string;
  }[];
  return rows[0] ?? null;
}

export async function cleanupCaptureAbuseState() {
  const rows = (await sql`
    with expired_windows as (
      select ctid from capture_rate_windows where expires_at < now() order by expires_at limit ${CAPTURE_ABUSE_CLEANUP_BATCH_SIZE}
    ), deleted_windows as (
      delete from capture_rate_windows where ctid in (select ctid from expired_windows) returning 1
    ), expired_decisions as (
      select ctid from capture_risk_decisions where expires_at < now() order by expires_at limit ${CAPTURE_ABUSE_CLEANUP_BATCH_SIZE}
    ), deleted_decisions as (
      delete from capture_risk_decisions where ctid in (select ctid from expired_decisions) returning 1
    )
    select
      (select count(*)::int from deleted_windows) as deleted_windows,
      (select count(*)::int from deleted_decisions) as deleted_decisions,
      greatest(0, (select count(*)::int from capture_rate_windows where expires_at < now())
        - (select count(*)::int from deleted_windows)) as remaining_windows,
      greatest(0, (select count(*)::int from capture_risk_decisions where expires_at < now())
        - (select count(*)::int from deleted_decisions)) as remaining_decisions
  `) as {
    deleted_windows: number;
    deleted_decisions: number;
    remaining_windows: number;
    remaining_decisions: number;
  }[];
  if (!rows[0]) throw new Error('capture abuse cleanup did not return aggregate state');
  return rows[0];
}

export async function insertLead(lead: {
  captureId: string;
  captureRequestHash: string;
  email: string;
  phone?: string | null;
  state?: string | null;
  residency?: string | null;
  college?: string | null;
  snapshot?: unknown;
  userAgent?: string | null;
  smsConsent?: boolean;
  referrer?: string | null;
  utm?: Record<string, string> | null;
  collegeId?: number | null;
  normalizedReferrer?: string | null;
  normalizedPhone?: string | null;
  smsConsentVersion?: string | null;
  smsConsentAt?: Date | null;
  isFixture?: boolean;
  riskDecisionId: number;
  attributionValidity: 'direct' | 'external_referrer' | 'valid_utm' | 'valid_click_id';
}) {
  const rows = (await sql`
    with eligible_risk as (
      select id, accepted_at, policy_version
      from capture_risk_decisions
      where id = ${lead.riskDecisionId} and capture_id = ${lead.captureId}::uuid
        and request_hash = ${lead.captureRequestHash} and decision = 'accepted'
    ), captured as (
      insert into leads (
        email, phone, state, residency, college, snapshot, user_agent,
        sms_consent, referrer, utm, capture_id, capture_request_hash, college_id,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        gclid, fbclid, normalized_referrer, normalized_phone,
        sms_consent_at, sms_consent_version, is_fixture,
        capture_risk_decision_id, capture_risk_accepted_at, capture_risk_policy_version,
        capture_risk_decision,
        phone_verified_at, sms_eligible, attribution_validity
      ) select
        ${lead.email}, ${lead.phone ?? null}, ${lead.state ? lead.state.toUpperCase().slice(0, 2) : null},
        ${lead.residency ?? null}, ${lead.college ?? null}, ${JSON.stringify(lead.snapshot ?? {})}::jsonb,
        ${lead.userAgent ?? null}, ${lead.smsConsent ?? false}, ${lead.referrer ?? null},
        ${lead.utm ? JSON.stringify(lead.utm) : null}::jsonb, ${lead.captureId}::uuid,
        ${lead.captureRequestHash}, ${lead.collegeId ?? null}, ${lead.utm?.utm_source ?? null},
        ${lead.utm?.utm_medium ?? null}, ${lead.utm?.utm_campaign ?? null},
        ${lead.utm?.utm_content ?? null}, ${lead.utm?.utm_term ?? null},
        ${lead.utm?.gclid ?? null}, ${lead.utm?.fbclid ?? null},
        ${lead.normalizedReferrer ?? null}, ${lead.normalizedPhone ?? null},
        ${lead.smsConsentAt ?? null}, ${lead.smsConsentVersion ?? null}, ${lead.isFixture ?? false},
        eligible_risk.id, eligible_risk.accepted_at, eligible_risk.policy_version, 'accepted',
        null, false, ${lead.attributionValidity}
      from eligible_risk
      on conflict (capture_id) where capture_id is not null do update
        set capture_id = excluded.capture_id
        where leads.capture_request_hash = excluded.capture_request_hash
      returning id, created_at, snapshot, is_fixture, sms_eligible
    ), message_work as (
      insert into email_messages (
        lead_id, kind, logical_key, provider_idempotency_key, is_fixture
      ) select id, 'results', 'lead:' || id || ':results', 'ft-lead-' || id || '-results',
        coalesce(is_fixture, false)
      from captured
      on conflict (logical_key) do nothing
      returning lead_id
    ), attempt_report as (
      insert into capture_reporting_buckets (
        bucket_start, event_type, reason_code, attribution_validity, traffic_class, event_count
      ) select date_trunc('hour', now()), 'attempt', 'none', ${lead.attributionValidity},
        case when coalesce(captured.is_fixture, false) then 'fixture' else 'genuine' end, 1
      from captured
      on conflict (bucket_start, event_type, reason_code, attribution_validity, traffic_class)
      do update set event_count = capture_reporting_buckets.event_count + 1, updated_at = now()
      returning 1
    ), outcome_report as (
      insert into capture_reporting_buckets (
        bucket_start, event_type, reason_code, attribution_validity, traffic_class, event_count
      ) select date_trunc('hour', now()),
        case when message_work.lead_id is not null then 'accepted' else 'deduplicated' end,
        case when message_work.lead_id is not null then 'none' else 'stable_replay' end,
        ${lead.attributionValidity},
        case when coalesce(captured.is_fixture, false) then 'fixture' else 'genuine' end, 1
      from captured
      left join message_work on message_work.lead_id = captured.id
      on conflict (bucket_start, event_type, reason_code, attribution_validity, traffic_class)
      do update set event_count = capture_reporting_buckets.event_count + 1, updated_at = now()
      returning 1
    )
    select captured.id, captured.created_at, captured.snapshot,
      (message_work.lead_id is not null) as delivery_claimed, captured.sms_eligible
    from captured
    left join message_work on message_work.lead_id = captured.id
    cross join attempt_report
    cross join outcome_report
  `) as { id: number; created_at: string; snapshot: Record<string, unknown>; delivery_claimed: boolean; sms_eligible: boolean }[];
  return rows[0];
}

export type CaptureReportEvent = {
  eventType: 'attempt' | 'accepted' | 'deduplicated' | 'rejected' | 'persistence_unconfirmed' | 'result_displayed';
  reasonCode: string;
  attributionValidity: 'direct' | 'external_referrer' | 'valid_utm' | 'valid_click_id' | 'invalid' | 'unknown';
  trafficClass: 'genuine' | 'fixture' | 'unknown';
};

/**
 * Records only fixed aggregate classifications. This function accepts no request
 * identity or free-form detail, so it cannot persist a visitor address, target,
 * referrer, token, body, or other unbounded value.
 */
export async function recordCaptureReportingEvents(events: CaptureReportEvent[]) {
  const bounded = events.map(boundedCaptureReportEvent);
  if (bounded.length < 1 || bounded.length > 2) throw new TypeError('capture reporting batch must contain one or two events');
  const rows = (await sql.query(`
    insert into capture_reporting_buckets (
      bucket_start, event_type, reason_code, attribution_validity, traffic_class, event_count
    )
    select date_trunc('hour', now()), event_type, reason_code, attribution_validity, traffic_class, count(*)::bigint
    from unnest($1::text[], $2::text[], $3::text[], $4::text[])
      as incoming(event_type, reason_code, attribution_validity, traffic_class)
    group by event_type, reason_code, attribution_validity, traffic_class
    on conflict (bucket_start, event_type, reason_code, attribution_validity, traffic_class)
    do update set event_count = capture_reporting_buckets.event_count + excluded.event_count, updated_at = now()
    returning event_count
  `, [
    bounded.map((event) => event.eventType),
    bounded.map((event) => event.reasonCode),
    bounded.map((event) => event.attributionValidity),
    bounded.map((event) => event.trafficClass),
  ])) as { event_count: number }[];
  if (rows.length < 1) throw new Error('capture reporting event was not recorded');
}

/** A display acknowledgement is idempotent at the lead transition, not the bucket. */
export async function acknowledgeCaptureResultDisplay(captureId: string) {
  const rows = (await sql`
    with displayed as (
      update leads set result_displayed_at = now()
      where capture_id = ${captureId}::uuid and result_displayed_at is null
      returning is_fixture, attribution_validity
    ), report as (
      insert into capture_reporting_buckets (
        bucket_start, event_type, reason_code, attribution_validity, traffic_class, event_count
      ) select date_trunc('hour', now()), 'result_displayed', 'none', attribution_validity,
        case when coalesce(is_fixture, false) then 'fixture' else 'genuine' end, 1
      from displayed
      on conflict (bucket_start, event_type, reason_code, attribution_validity, traffic_class)
      do update set event_count = capture_reporting_buckets.event_count + 1, updated_at = now()
      returning 1
    )
    select exists(select 1 from displayed) as first_display,
      (exists(select 1 from displayed) or exists(
        select 1 from leads where capture_id = ${captureId}::uuid and result_displayed_at is not null
      )) as acknowledged,
      (select count(*)::int from report) as report_rows
  `) as { first_display: boolean; acknowledged: boolean; report_rows: number }[];
  return rows[0] ?? { first_display: false, acknowledged: false, report_rows: 0 };
}

export async function captureOperationsReport(days = 30) {
  const safeDays = Math.max(1, Math.min(90, Math.trunc(days)));
  const events = (await sql`
    select event_type, reason_code, attribution_validity, traffic_class,
      sum(event_count)::int as count
    from capture_reporting_buckets
    where bucket_start >= date_trunc('hour', now() - (${safeDays}::text || ' days')::interval)
    group by event_type, reason_code, attribution_validity, traffic_class
    order by event_type, reason_code, attribution_validity, traffic_class
  `) as { event_type: string; reason_code: string; attribution_validity: string; traffic_class: string; count: number }[];
  const leads = (await sql`
    with risk_bound as (
      select
        case
          when leads.snapshot ? '_legacy_mongo_id' then 'retired'
          when coalesce(leads.is_fixture, false)
            or (leads.capture_id is null and (
              coalesce(leads.utm->>'utm_campaign', '') ~* '(^|[-_])(test|verify|e2e)([-_]|$)'
              or coalesce(leads.referrer, '') ~* '(^|[?&/_-])(test|verify|e2e)([=&/_-]|$)'
              or split_part(lower(leads.email), '@', 1) ~ '(^|[._+-])(test|verify|e2e)([._+-]|$)'
            )) then 'test'
          when accepted_risk.id is not null then 'genuine'
          else 'unclassified'
        end as classification,
        lower(coalesce(leads.utm_source, leads.utm->>'utm_source',
          case when leads.normalized_referrer is not null then 'referral' else 'direct' end)) as raw_source
      from leads
      left join capture_risk_decisions accepted_risk
        on accepted_risk.id = leads.capture_risk_decision_id
        and accepted_risk.capture_id = leads.capture_id
        and accepted_risk.request_hash = leads.capture_request_hash
        and accepted_risk.decision = 'accepted'
        and accepted_risk.accepted_at = leads.capture_risk_accepted_at
        and accepted_risk.policy_version = leads.capture_risk_policy_version
      where leads.created_at >= now() - (${safeDays}::text || ' days')::interval
    ), classified as (
      select classification,
        case
          when classification = 'test' then 'fixture'
          when raw_source in ('direct', 'referral', 'google', 'reddit', 'facebook', 'forum', 'email', 'youtube')
            then raw_source
          else 'other'
        end as source
      from risk_bound
    )
    select classification, source, count(*)::int as count
    from classified group by classification, source order by classification, source
  `) as { classification: 'genuine' | 'test' | 'retired' | 'unclassified'; source: string; count: number }[];
  return { window_days: safeDays, durable_leads: leads, capture_events: events };
}

export async function listLeads(limit = 500, offset = 0) {
  return (await sql`
    select id, email, phone, state, residency, college, snapshot, created_at,
      coalesce(is_fixture, false) as is_fixture
    from leads
    order by created_at desc
    limit ${limit} offset ${offset}
  `) as {
    id: number;
    email: string;
    phone: string | null;
    state: string | null;
    residency: string | null;
    college: string | null;
    snapshot: Record<string, unknown> | null;
    created_at: string;
    is_fixture: boolean;
  }[];
}

export async function leadStats() {
  const rows = (await sql`
    select
      count(*)::int                                              as total,
      count(distinct lower(email))::int                          as unique_emails,
      count(*) filter (where created_at > now() - interval '30 days')::int as last_30d,
      count(*) filter (where phone is not null and phone <> '')::int       as with_phone,
      (select count(*)::int from leads where coalesce(is_fixture, false))  as fixture_count
    from leads
    where coalesce(is_fixture, false) = false
  `) as { total: number; unique_emails: number; last_30d: number; with_phone: number; fixture_count: number }[];
  return rows[0];
}

export async function insertSignup(s: {
  schoolDistrict?: string | null;
  state?: string | null;
  attendeeNames?: string | null;
  attendeeEmails?: string | null;
  attendeeCount?: string | null;
  pocName?: string | null;
  pocEmail?: string | null;
  userAgent?: string | null;
}) {
  const rows = (await sql`
    insert into signups (
      school_district, state, attendee_names, attendee_emails,
      attendee_count, poc_name, poc_email, user_agent
    )
    values (
      ${s.schoolDistrict ?? null},
      ${s.state ? String(s.state).toUpperCase().slice(0, 2) : null},
      ${s.attendeeNames ?? null},
      ${s.attendeeEmails ?? null},
      ${s.attendeeCount ?? null},
      ${s.pocName ?? null},
      ${s.pocEmail ?? null},
      ${s.userAgent ?? null}
    )
    returning id, created_at
  `) as { id: number; created_at: string }[];
  return rows[0];
}

export async function markSignupNotified(id: number) {
  await sql`update signups set notified_at = now() where id = ${id}`;
}

export async function listSignups(limit = 500) {
  return (await sql`
    select id, school_district, state, attendee_names, attendee_emails,
           attendee_count, poc_name, poc_email, notified_at, created_at
    from signups
    order by created_at desc
    limit ${limit}
  `) as Record<string, unknown>[];
}

/** Largest computable colleges in a state with the figures the savings pages render. */
export async function getTopCollegesForState(state: string, limit = 20) {
  return (await sql`
    select id, name, city, ownership, net_price, tuition_in, student_size
    from colleges
    where state = ${state.toUpperCase()} and ${sql.unsafe(COMPUTABLE)}
    order by student_size desc nulls last, name
    limit ${limit}
  `) as {
    id: number; name: string; city: string | null; ownership: number | null;
    net_price: number | null; tuition_in: number | null; student_size: number | null;
  }[];
}

/** Per-state aggregates for the savings pages. */
export async function getStateSavingsStats(state: string) {
  const rows = (await sql`
    select
      count(*)::int as college_count,
      round(avg(net_price))::int as avg_net_price
    from colleges
    where state = ${state.toUpperCase()} and ${sql.unsafe(COMPUTABLE)} and net_price is not null
  `) as { college_count: number; avg_net_price: number | null }[];
  return rows[0] ?? null;
}

/** Every selectable college, for the sitemap. */
export async function getAllComputableColleges() {
  return (await sql`
    select id, name from colleges where ${sql.unsafe(COMPUTABLE)} order by id
  `) as { id: number; name: string }[];
}

/** Funnel view: where leads come from, how deep the drip has taken them, and sales. */
export async function funnelStats() {
  const bySource = (await sql`
    with classified as (
      select case
        when lower(coalesce(utm_source, utm->>'utm_source',
          case when normalized_referrer is not null then 'referral' else 'direct' end))
          in ('direct', 'referral', 'google', 'reddit', 'facebook', 'forum', 'email', 'youtube')
        then lower(coalesce(utm_source, utm->>'utm_source',
          case when normalized_referrer is not null then 'referral' else 'direct' end))
        else 'other' end as source
      from leads
      where created_at >= '2026-08-06' and coalesce(is_fixture, false) = false
    )
    select source, count(*)::int as leads
    from classified group by source order by leads desc
  `) as { source: string; leads: number }[];
  const byStage = (await sql`
    select nurture_stage, count(*)::int as leads
    from leads where created_at >= '2026-08-06' and coalesce(is_fixture, false) = false
    group by 1 order by 1
  `) as { nurture_stage: number; leads: number }[];
  const sales = (await sql`
    select
      count(*) filter (where paid_at is not null)::int as count,
      coalesce(sum(
        case when paid_at is not null and coalesce(dispute_state, '') not in ('open', 'lost')
          then greatest(coalesce(amount_cents, 0) - coalesce(refunded_cents, 0), 0) else 0 end
      ),0)::int as cents
    from sales
    where coalesce(sales.is_fixture, false) = false
      and not exists (
      select 1 from leads where leads.id = sales.lead_id and coalesce(leads.is_fixture, false)
    )
      and not exists (
        select 1 from email_messages
        where email_messages.id = sales.email_message_id and email_messages.is_fixture
      )
  `) as { count: number; cents: number }[];
  const emailPerf = (await sql`
    select step,
      count(distinct email_message_id) filter (where event_type = 'open')::int as opens,
      count(distinct email_message_id) filter (where event_type = 'click')::int as clicks
    from email_engagement_events
    join email_messages on email_messages.id = email_engagement_events.email_message_id
    where email_messages.is_fixture = false
    group by step order by step
  `) as { step: string; opens: number; clicks: number }[];
  return { bySource, byStage, sales: sales[0], emailPerf };
}
