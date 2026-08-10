import { NextResponse } from 'next/server'
import { listLeads } from '@/lib/db'
import { isAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

/** RFC 4180 quoting, plus a guard against spreadsheet formula injection. */
function csvCell(value: unknown): string {
  if (value == null) return ''
  // The pg driver hands back timestamptz as a Date; String() would render
  // "Thu Aug 06 2026 14:35:22 GMT-0400", which no spreadsheet sorts correctly.
  let s = value instanceof Date ? value.toISOString() : String(value)
  // A cell starting with = + - @ is executed as a formula by Excel and Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export async function GET() {
  if (!isAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const leads = await listLeads(100_000)

  const headers = [
    'id', 'created_at', 'record_class', 'email', 'phone', 'state', 'residency', 'college',
    'annual_cost', 'standard_total', 'fastrack_total', 'savings', 'years_to_recoup',
  ]

  const rows = leads.map((l) => {
    const s = (l.snapshot ?? {}) as Record<string, unknown>
    // Snapshots span three generations now: the original snake_case Mongo docs,
    // the camelCase ones, and the current server-computed shape. Check all three.
    const pick = (...keys: string[]) => keys.map((k) => s[k]).find((v) => v != null) ?? ''
    return [
      l.id,
      l.created_at,
      l.is_fixture ? 'fixture' : 'lead',
      l.email,
      l.phone,
      l.state,
      l.residency,
      l.college,
      pick('annualCost'),
      pick('standardTotal', 'inStateTuition', 'latest_cost_tuition_in_state'),
      pick('fastrackTotal'),
      pick('savings', 'potentialSavingsInState', 'potential_savings_in_state'),
      pick('yearsToRecoup', 'timeToRecoupInState', 'time_to_recoup_funds_in_state'),
    ].map(csvCell).join(',')
  })

  const csv = [headers.join(','), ...rows].join('\r\n')
  const stamp = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="fastrack-leads-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
