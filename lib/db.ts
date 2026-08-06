import { neon } from '@neondatabase/serverless';

// HTTP driver rather than a TCP pool. In serverless functions a pool either leaks
// connections across invocations or pays a handshake on every cold start; the HTTP
// driver does neither, and this workload never needs a transaction.
export const sql = neon(process.env.DATABASE_URL!);

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
 * for it. The loader intentionally ingests every operating institution — around
 * 6,500, including certificate schools — and this is where that gets narrowed.
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
}) {
  const rows = (await sql`
    insert into leads (
      email, phone, state, residency, college, snapshot, user_agent,
      sms_consent, referrer, utm
    )
    values (
      ${lead.email},
      ${lead.phone ?? null},
      ${lead.state ? lead.state.toUpperCase().slice(0, 2) : null},
      ${lead.residency ?? null},
      ${lead.college ?? null},
      ${JSON.stringify(lead.snapshot ?? {})}::jsonb,
      ${lead.userAgent ?? null},
      ${lead.smsConsent ?? false},
      ${lead.referrer ?? null},
      ${lead.utm ? JSON.stringify(lead.utm) : null}::jsonb
    )
    returning id, created_at
  `) as { id: number; created_at: string }[];
  return rows[0];
}

export async function markResultsEmailSent(id: number) {
  await sql`update leads set results_email_sent_at = now() where id = ${id}`;
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
