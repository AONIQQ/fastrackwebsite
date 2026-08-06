import { NextResponse } from 'next/server'
import { getCollegeNamesByState, getCollegesByState } from '@/lib/db'

// Reference data changes only when scripts/load-colleges.mjs runs.
export const revalidate = 86400

/**
 *  GET /api/colleges?state=PA         -> string[]  (legacy shape, still supported)
 *  GET /api/colleges?state=PA&full=1  -> { id, name, city, student_size }[]
 *
 * The `full` shape carries the id, so the calculator can resolve a school by
 * primary key instead of by name. Name lookup is ambiguous — several states have
 * multiple campuses sharing a name.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const state = searchParams.get('state')
  const full = searchParams.get('full')

  if (!state) {
    return NextResponse.json({ error: 'State parameter is required' }, { status: 400 })
  }

  if (!/^[A-Za-z]{2}$/.test(state)) {
    return NextResponse.json({ error: 'State must be a 2-letter code' }, { status: 400 })
  }

  try {
    if (full) {
      return NextResponse.json(await getCollegesByState(state))
    }
    return NextResponse.json(await getCollegeNamesByState(state))
  } catch (error) {
    console.error('Error fetching colleges:', error)
    return NextResponse.json({ error: 'Failed to fetch colleges' }, { status: 500 })
  }
}
