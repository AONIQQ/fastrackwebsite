import { sql } from '@/lib/db'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe.mjs'

export const dynamic = 'force-dynamic'

const secret = () => process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || ''
const tokenFrom = (request: Request) => new URL(request.url).searchParams.get('t') || ''

async function unsubscribe(email: string) {
  await sql`update leads set unsubscribed_at = coalesce(unsubscribed_at, now()) where lower(email) = ${email}`
}

export async function POST(request: Request) {
  const token = tokenFrom(request)
  const email = verifyUnsubscribeToken(token, secret())
  if (!email) return new Response('invalid preference link', { status: 400 })
  const body = await request.text()
  const oneClick = body === 'List-Unsubscribe=One-Click'
  const browserConfirmation = body === 'confirm=unsubscribe'
  if (!oneClick && !browserConfirmation) return new Response('invalid request', { status: 400 })
  await unsubscribe(email)
  return new Response('unsubscribed', { status: 200 })
}

export async function GET(request: Request) {
  const token = tokenFrom(request)
  if (!verifyUnsubscribeToken(token, secret())) return new Response('Invalid preference link', { status: 400 })
  const action = `/api/u?t=${encodeURIComponent(token)}`
  return new Response(
    `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f4f8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
      <div style="background:#fff;border-radius:12px;padding:40px;max-width:420px;text-align:center;">
        <h1 style="color:#080b53;font-size:22px;">Stop Fastrack emails?</h1>
        <p style="color:#5a5a78;">Confirm below. Merely opening this page does not change your preferences.</p>
        <form method="post" action="${action}">
          <button name="confirm" value="unsubscribe" style="background:#080b53;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-weight:600;">Unsubscribe</button>
        </form>
      </div>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )
}
