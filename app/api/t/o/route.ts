import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = Buffer.from(searchParams.get('e') ?? '', 'base64url').toString()
  const step = searchParams.get('s') ?? ''
  if (email && step) {
    sql`insert into email_events (email, step, kind) values (${email.toLowerCase()}, ${step}, 'open')`.catch(() => {})
  }
  return new Response(PIXEL, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' },
  })
}
