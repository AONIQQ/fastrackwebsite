import { NextResponse } from 'next/server'
import { getCostOfLiving } from '@/lib/db'

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
    const cost = await getCostOfLiving(state)

    if (cost === null) {
      return NextResponse.json({ error: 'No cost of living data for that state' }, { status: 404 })
    }

    // app/calculator asserts `typeof costOfLiving === 'number'`, so return a bare
    // number exactly as the old endpoint did.
    return NextResponse.json(cost)
  } catch (error) {
    console.error('Error fetching cost of living data:', error)
    return NextResponse.json({ error: 'Failed to fetch cost of living data' }, { status: 500 })
  }
}
