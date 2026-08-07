import { NextResponse } from 'next/server'
import { sendMail } from '@/lib/mail'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Daily community reply pack: finds fresh Reddit threads where a Fastrack
 * answer genuinely helps, drafts the answer, and emails a paste-ready digest.
 * The human step shrinks to review-and-paste.
 */
const QUERIES = [
  'dual enrollment worth it',
  'college too expensive help',
  'CLEP credits transfer',
  'graduate college early high school credits',
  'AP vs dual enrollment',
]

type Thread = { title: string; url: string; sub: string; selftext: string }

async function findThreads(): Promise<Thread[]> {
  const seen = new Set<string>()
  const out: Thread[] = []
  for (const q of QUERIES) {
    try {
      const r = await fetch(
        `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&t=day&limit=5`,
        { headers: { 'User-Agent': 'fastrack-reply-pack/1.0' } },
      )
      if (!r.ok) continue
      const d = await r.json()
      for (const c of d?.data?.children ?? []) {
        const p = c.data
        if (!p?.permalink || seen.has(p.permalink)) continue
        seen.add(p.permalink)
        out.push({
          title: p.title ?? '',
          url: `https://www.reddit.com${p.permalink}`,
          sub: p.subreddit_name_prefixed ?? '',
          selftext: (p.selftext ?? '').slice(0, 600),
        })
      }
    } catch {
      // one failed query never kills the pack
    }
  }
  return out.slice(0, 6)
}

async function draftAnswer(t: Thread): Promise<string> {
  const prompt = `You help a parent-focused college planning company answer forum posts. Write a genuinely helpful 120-180 word reply to this post. Answer the actual question first with specifics. If naturally relevant, mention that fastrack.school/calculator is a free tool showing real net prices for 6,000+ colleges, or the free state pages at fastrack.school/savings. Never pitch a paid product. No em dashes. Plain text.\n\nSubreddit: ${t.sub}\nTitle: ${t.title}\nPost: ${t.selftext}`
  try {
    const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.VERCEL_OIDC_TOKEN ?? ''}`,
      },
      body: JSON.stringify({
        model: 'zai/glm-5.2-fast',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
      }),
    })
    if (!r.ok) throw new Error(String(r.status))
    const d = await r.json()
    return d.choices?.[0]?.message?.content ?? ''
  } catch {
    return '(draft unavailable, answer the question directly and link the calculator if relevant)'
  }
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const threads = await findThreads()
  if (threads.length === 0) return NextResponse.json({ threads: 0, sent: false })

  const drafted = await Promise.all(threads.map(async (t) => ({ ...t, answer: await draftAnswer(t) })))

  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#26263a;">
    <h2 style="color:#080b53;">Today's reply pack (${drafted.length} threads)</h2>
    <p>Paste, tweak a sentence so it sounds like you, submit. Ten minutes total.</p>
    ${drafted
      .map(
        (t) => `<div style="border:1px solid #e6e6ef;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 4px;"><strong>${t.sub}</strong>: <a href="${t.url}">${t.title}</a></p>
      <p style="white-space:pre-wrap;background:#f7f7fb;border-radius:6px;padding:12px;margin:8px 0 0;">${t.answer}</p>
    </div>`,
      )
      .join('')}
  </div>`

  await sendMail({
    to: 'info@fastrack.school',
    subject: `Reply pack: ${drafted.length} threads to answer today`,
    html,
    text: drafted.map((t) => `${t.url}\n${t.answer}\n`).join('\n---\n'),
    replyTo: 'info@fastrack.school',
  })
  return NextResponse.json({ threads: drafted.length, sent: true })
}
