import { NextResponse } from 'next/server'
import { getCollegeNamesByState } from '@/lib/db'

// Reference data changes only when scripts/load-colleges.mjs runs.
export const revalidate = 86400

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const state = searchParams.get('state')

  if (!state) {
    return NextResponse.json({ error: 'State parameter is required' }, { status: 400 })
  }

  if (!/^[A-Za-z]{2}$/.test(state)) {
    return NextResponse.json({ error: 'State must be a 2-letter code' }, { status: 400 })
  }

  try {
    // Same shape as the old Atlas endpoint: a bare array of college names.
    return NextResponse.json(await getCollegeNamesByState(state))
  } catch (error) {
    console.error('Error fetching colleges:', error)
    return NextResponse.json({ error: 'Failed to fetch colleges' }, { status: 500 })
  }
}
