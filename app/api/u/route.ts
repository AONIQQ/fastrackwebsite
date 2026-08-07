import { sql } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** One-click unsubscribe. GET renders a confirmation page; POST (RFC 8058
 *  List-Unsubscribe-Post, sent automatically by Gmail/Yahoo) unsubscribes directly. */
async function unsubscribe(email: string) {
  if (!email) return
  await sql`update leads set unsubscribed_at = now() where lower(email) = ${email.toLowerCase()}`
}

function emailFrom(request: Request): string {
  const { searchParams } = new URL(request.url)
  try {
    return Buffer.from(searchParams.get('e') ?? '', 'base64url').toString()
  } catch {
    return ''
  }
}

export async function POST(request: Request) {
  await unsubscribe(emailFrom(request))
  return new Response('unsubscribed', { status: 200 })
}

export async function GET(request: Request) {
  const email = emailFrom(request)
  await unsubscribe(email)
  return new Response(
    `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f4f8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
      <div style="background:#fff;border-radius:12px;padding:40px;max-width:420px;text-align:center;">
        <h1 style="color:#080b53;font-size:22px;">You are unsubscribed</h1>
        <p style="color:#5a5a78;">${email ? email : 'This address'} will not receive further emails from Fastrack.</p>
      </div>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  )
}
