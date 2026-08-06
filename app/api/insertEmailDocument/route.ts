import { NextResponse } from 'next/server'
import { insertLead } from '@/lib/db'

// Never cache a write.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const { email, phone, state, residency, college, ...snapshot } = body ?? {}

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    const lead = await insertLead({
      email: email.trim().toLowerCase(),
      phone: typeof phone === 'string' && phone.trim() ? phone.trim() : null,
      state: typeof state === 'string' && state.trim() ? state : null,
      residency: typeof residency === 'string' && residency.trim() ? residency : null,
      college: typeof college === 'string' && college.trim() ? college : null,
      snapshot,
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true, id: lead.id })
  } catch (error) {
    console.error('Error inserting lead:', error)
    return NextResponse.json({ error: 'Failed to insert email document' }, { status: 500 })
  }
}
