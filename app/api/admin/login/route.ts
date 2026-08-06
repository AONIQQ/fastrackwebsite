import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { timingSafeEqual } from 'node:crypto'

export const dynamic = 'force-dynamic'

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export async function POST(request: Request) {
  const expected = process.env.ADMIN_TOKEN

  if (!expected) {
    return NextResponse.json(
      { error: 'ADMIN_TOKEN is not configured on this deployment' },
      { status: 503 },
    )
  }

  const form = await request.formData()
  const supplied = String(form.get('token') ?? '')

  if (!safeEqual(supplied, expected)) {
    return NextResponse.redirect(new URL('/admin/leads?error=1', request.url), 303)
  }

  cookies().set('fastrack_admin', expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  })

  return NextResponse.redirect(new URL('/admin/leads', request.url), 303)
}
