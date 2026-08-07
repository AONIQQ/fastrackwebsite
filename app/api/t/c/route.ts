import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

const ALLOWED_HOSTS = new Set(['www.fastrack.school', 'fastrack.school', 'buy.stripe.com'])

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = Buffer.from(searchParams.get('e') ?? '', 'base64url').toString()
  const step = searchParams.get('s') ?? ''
  const dest = searchParams.get('u') ?? 'https://www.fastrack.school'

  let url: URL
  try {
    url = new URL(dest)
  } catch {
    url = new URL('https://www.fastrack.school')
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) url = new URL('https://www.fastrack.school')

  if (email && step) {
    await sql`insert into email_events (email, step, kind, url) values (${email.toLowerCase()}, ${step}, 'click', ${url.href.slice(0, 500)})`.catch(() => {})
  }
  return NextResponse.redirect(url.href, 302)
}
