import { NextResponse } from 'next/server'
import { getCollegeById, getCollegeByName } from '@/lib/db'
import { computeRoi, type Residency } from '@/lib/roi'

export const revalidate = 86400

/**
 * One call for a full result.
 *
 * The original calculator made three sequential round trips — colleges, then
 * collegeDetails, then costOfLiving — each waterfalled on the last, each with
 * `cache: 'no-store'`. This replaces the last two with a single cached request
 * and moves the arithmetic server-side, so the numbers can't drift between what
 * the page renders and what gets written to the leads table.
 *
 *   GET /api/roi?college=Temple%20University&residency=inState
 *   GET /api/roi?id=216339&residency=outOfState
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const name = searchParams.get('college')
  const residencyParam = searchParams.get('residency')

  if (!id && !name) {
    return NextResponse.json({ error: 'Either id or college is required' }, { status: 400 })
  }

  if (residencyParam !== 'inState' && residencyParam !== 'outOfState') {
    return NextResponse.json(
      { error: "residency must be 'inState' or 'outOfState'" },
      { status: 400 },
    )
  }
  const residency: Residency = residencyParam

  try {
    const college = id ? await getCollegeById(Number(id)) : await getCollegeByName(name!)

    if (!college) {
      return NextResponse.json({ error: 'College not found' }, { status: 404 })
    }

    return NextResponse.json(computeRoi(college, residency))
  } catch (error) {
    console.error('[/api/roi]', error)
    return NextResponse.json({ error: 'Failed to compute ROI' }, { status: 500 })
  }
}
