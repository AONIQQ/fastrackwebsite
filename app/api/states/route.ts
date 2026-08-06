import { NextResponse } from 'next/server'
import { getStates } from '@/lib/db'

export const revalidate = 86400

/**
 * States that actually have selectable colleges.
 *
 * The calculator previously hardcoded a 50-element array, which meant DC and
 * Puerto Rico were in the data but unreachable, and any state whose data went
 * missing still appeared and then silently returned nothing.
 */
export async function GET() {
  try {
    return NextResponse.json(await getStates())
  } catch (error) {
    console.error('[/api/states]', error)
    return NextResponse.json({ error: 'Failed to fetch states' }, { status: 500 })
  }
}
