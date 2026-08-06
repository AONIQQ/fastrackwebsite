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

/** College names for a state, ordered. Matches the old endpoint's string[] shape. */
export async function getCollegeNamesByState(state: string): Promise<string[]> {
  const rows = (await sql`
    select name
    from colleges
    where state = ${state.toUpperCase()}
    order by name
  `) as { name: string }[];
  return rows.map((r) => r.name);
}

export async function getCollegeByName(name: string): Promise<CollegeRow | null> {
  const rows = (await sql`
    select id, name, city, state, ownership,
           tuition_in, tuition_out, net_price,
           earnings_6yr, earnings_10yr
    from colleges
    where lower(name) = lower(${name})
    order by student_size desc nulls last
    limit 1
  `) as CollegeRow[];
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
}) {
  const rows = (await sql`
    insert into leads (email, phone, state, residency, college, snapshot, user_agent)
    values (
      ${lead.email},
      ${lead.phone ?? null},
      ${lead.state ? lead.state.toUpperCase().slice(0, 2) : null},
      ${lead.residency ?? null},
      ${lead.college ?? null},
      ${JSON.stringify(lead.snapshot ?? {})}::jsonb,
      ${lead.userAgent ?? null}
    )
    returning id, created_at
  `) as { id: number; created_at: string }[];
  return rows[0];
}
