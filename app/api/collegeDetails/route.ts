import { NextResponse } from 'next/server'
import { getCollegeByName } from '@/lib/db'

export const revalidate = 86400

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const college = searchParams.get('college')

  if (!college) {
    return NextResponse.json({ error: 'College parameter is required' }, { status: 400 })
  }

  try {
    const row = await getCollegeByName(college)

    if (!row) {
      return NextResponse.json({ error: 'College not found' }, { status: 404 })
    }

    // Field names deliberately match the old Mongo documents so app/calculator
    // keeps working untouched. The id and net-price fields are additive — the
    // current client ignores them; the rewritten one should lead with net price.
    return NextResponse.json({
      id: row.id,
      school_name: row.name,
      school_state: row.state,
      latest_cost_tuition_in_state: row.tuition_in,
      latest_cost_tuition_out_of_state: row.tuition_out,
      latest_earnings_6_yrs_after_entry_median: row.earnings_6yr,
      latest_earnings_10_yrs_after_entry_median: row.earnings_10yr,
      latest_cost_avg_net_price: row.net_price,
    })
  } catch (error) {
    console.error('Error fetching college details:', error)
    return NextResponse.json({ error: 'Failed to fetch college details' }, { status: 500 })
  }
}
