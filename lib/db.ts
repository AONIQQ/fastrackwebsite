import { neon } from '@neondatabase/serverless';

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
}) {
  const rows = (await sql`
    with captured as (
      insert into leads (
        email, phone, state, residency, college, snapshot, user_agent,
        sms_consent, referrer, utm, capture_id, capture_request_hash, college_id,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        gclid, fbclid, normalized_referrer, normalized_phone,
        sms_consent_at, sms_consent_version, is_fixture
      ) values (
        ${lead.email}, ${lead.phone ?? null}, ${lead.state ? lead.state.toUpperCase().slice(0, 2) : null},
        ${lead.residency ?? null}, ${lead.college ?? null}, ${JSON.stringify(lead.snapshot ?? {})}::jsonb,
        ${lead.userAgent ?? null}, ${lead.smsConsent ?? false}, ${lead.referrer ?? null},
        ${lead.utm ? JSON.stringify(lead.utm) : null}::jsonb, ${lead.captureId}::uuid,
        ${lead.captureRequestHash}, ${lead.collegeId ?? null}, ${lead.utm?.utm_source ?? null},
        ${lead.utm?.utm_medium ?? null}, ${lead.utm?.utm_campaign ?? null},
        ${lead.utm?.utm_content ?? null}, ${lead.utm?.utm_term ?? null},
        ${lead.utm?.gclid ?? null}, ${lead.utm?.fbclid ?? null},
        ${lead.normalizedReferrer ?? null}, ${lead.normalizedPhone ?? null},
        ${lead.smsConsentAt ?? null}, ${lead.smsConsentVersion ?? null}, ${lead.isFixture ?? false}
      )
      on conflict (capture_id) where capture_id is not null do update
        set capture_id = excluded.capture_id
        where leads.capture_request_hash = excluded.capture_request_hash
      returning id, created_at, snapshot, is_fixture
    ), message_work as (
      insert into email_messages (
        lead_id, kind, logical_key, provider_idempotency_key, is_fixture
      ) select id, 'results', 'lead:' || id || ':results', 'ft-lead-' || id || '-results',
        coalesce(is_fixture, false)
      from captured
      on conflict (logical_key) do nothing
      returning lead_id
    ), event_record as (
      insert into capture_events (capture_id, lead_id, event_type, is_fixture)
      select ${lead.captureId}::uuid, captured.id,
        case when message_work.lead_id is not null then 'accepted' else 'replayed' end,
        coalesce(captured.is_fixture, false)
      from captured
      left join message_work on message_work.lead_id = captured.id
      returning id
    )
    select captured.id, captured.created_at, captured.snapshot,
      (message_work.lead_id is not null) as delivery_claimed
    from captured
    left join message_work on message_work.lead_id = captured.id
    cross join event_record
  `) as { id: number; created_at: string; snapshot: Record<string, unknown>; delivery_claimed: boolean }[];
  return rows[0];
}

export async function listLeads(limit = 500, offset = 0) {
  return (await sql`
    select id, email, phone, state, residency, college, snapshot, created_at
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
  }[];
}

export async function leadStats() {
  const rows = (await sql`
    select
      count(*)::int                                              as total,
      count(distinct lower(email))::int                          as unique_emails,
      count(*) filter (where created_at > now() - interval '30 days')::int as last_30d,
      count(*) filter (where phone is not null and phone <> '')::int       as with_phone
    from leads
  `) as { total: number; unique_emails: number; last_30d: number; with_phone: number }[];
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
    select coalesce(utm->>'utm_source', case when referrer <> '' then 'referral' else 'direct' end) as source,
           count(*)::int as leads
    from leads
    where created_at >= '2026-08-06'
    group by 1 order by leads desc limit 10
  `) as { source: string; leads: number }[];
  const byStage = (await sql`
    select nurture_stage, count(*)::int as leads
    from leads where created_at >= '2026-08-06'
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
  `) as { count: number; cents: number }[];
  const emailPerf = (await sql`
    select step,
      count(distinct email_message_id) filter (where event_type = 'open')::int as opens,
      count(distinct email_message_id) filter (where event_type = 'click')::int as clicks
    from email_engagement_events
    group by step order by step
  `) as { step: string; opens: number; clicks: number }[];
  return { bySource, byStage, sales: sales[0], emailPerf };
}
