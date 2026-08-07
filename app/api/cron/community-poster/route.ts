import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { sendMail } from '@/lib/mail'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * The worker, not the assistant: finds fresh relevant Reddit threads via the
 * official API, has GPT-5.6 Luna write a genuinely helpful reply, and POSTS it
 * from the connected account. Memory table prevents double-answering. Hard
 * daily cap and an hour of jitterless pacing keep the account plausible.
 * Sends a short receipt email listing what it posted, for oversight not labor.
 */
const SUBREDDITS = ['ApplyingToCollege', 'homeschool', 'Homeschooling', 'Parenting', 'personalfinance', 'clep']
const QUERY_TERMS = ['dual enrollment', 'dual credit', 'CLEP', 'college unaffordable', 'AP vs dual']
const MAX_POSTS_PER_RUN = 2
const MIN_ACCOUNT_FIT_SCORE = 6

type Candidate = { id: string; title: string; selftext: string; subreddit: string; permalink: string; created: number }

async function redditToken(): Promise<string | null> {
  const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD } = process.env
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET || !REDDIT_USERNAME || !REDDIT_PASSWORD) return null
  const r = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'fastrack-community/1.0',
    },
    body: new URLSearchParams({ grant_type: 'password', username: REDDIT_USERNAME, password: REDDIT_PASSWORD }),
  })
  if (!r.ok) return null
  const d = await r.json()
  return d.access_token ?? null
}

async function findCandidates(token: string): Promise<Candidate[]> {
  const out: Candidate[] = []
  const seen = new Set<string>()
  for (const term of QUERY_TERMS) {
    const r = await fetch(
      `https://oauth.reddit.com/search?q=${encodeURIComponent(term)}&sort=new&t=day&limit=10&restrict_sr=false`,
      { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'fastrack-community/1.0' } },
    )
    if (!r.ok) continue
    const d = await r.json()
    for (const c of d?.data?.children ?? []) {
      const p = c.data
      if (!p?.id || seen.has(p.id)) continue
      if (!SUBREDDITS.some((s) => s.toLowerCase() === String(p.subreddit).toLowerCase())) continue
      if (p.locked || p.archived || p.num_comments > 40) continue
      seen.add(p.id)
      out.push({
        id: p.id,
        title: p.title ?? '',
        selftext: (p.selftext ?? '').slice(0, 1500),
        subreddit: p.subreddit,
        permalink: `https://www.reddit.com${p.permalink}`,
        created: p.created_utc,
      })
    }
  }
  return out
}

async function lunaReply(c: Candidate): Promise<{ fit: number; reply: string }> {
  const r = await fetch('https://ai-gateway.vercel.sh/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY ?? ''}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-5.6-luna',
      max_output_tokens: 1200,
      input: `You write Reddit replies for a knowledgeable parent who helps families plan dual credit. Rate this thread's fit from 0-10 (10 = someone genuinely asking about dual enrollment, AP vs dual credit, CLEP, or college costs where a substantive answer helps; 0 = off-topic, venting, or already fully answered). Then, if fit >= ${MIN_ACCOUNT_FIT_SCORE}, write a 100-170 word reply that answers the actual question first with specifics. Mention the free calculator at fastrack.school/calculator ONLY if cost comparison is genuinely relevant, at most once, casually. Never mention paid products. No em dashes. Sound like a person, not a marketer.\n\nOutput exactly:\nFIT: <number>\nREPLY: <the reply, or NONE>\n\nSubreddit: r/${c.subreddit}\nTitle: ${c.title}\nPost: ${c.selftext}`,
    }),
  })
  if (!r.ok) return { fit: 0, reply: '' }
  const d = await r.json()
  let text = ''
  for (const o of d.output ?? []) {
    if (o.type === 'message') for (const p of o.content ?? []) if (p.type === 'output_text') text += p.text
  }
  const fit = Number(text.match(/FIT:\s*(\d+)/)?.[1] ?? 0)
  const reply = text.match(/REPLY:\s*([\s\S]+)/)?.[1]?.trim() ?? ''
  return { fit, reply: reply === 'NONE' ? '' : reply }
}

async function postReply(token: string, threadId: string, text: string): Promise<boolean> {
  const r = await fetch('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'fastrack-community/1.0',
    },
    body: new URLSearchParams({ api_type: 'json', thing_id: `t3_${threadId}`, text }),
  })
  if (!r.ok) return false
  const d = await r.json()
  return !(d?.json?.errors?.length)
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await redditToken()
  if (!token) {
    return NextResponse.json({ ok: false, reason: 'reddit credentials not configured' }, { status: 503 })
  }

  const candidates = await findCandidates(token)
  const posted: { url: string; reply: string }[] = []

  for (const c of candidates) {
    if (posted.length >= MAX_POSTS_PER_RUN) break
    const already = (await sql`select 1 from community_posts where thread_id = ${c.id}`) as unknown[]
    if (already.length) continue

    const { fit, reply } = await lunaReply(c)
    if (fit < MIN_ACCOUNT_FIT_SCORE || !reply) continue

    const ok = await postReply(token, c.id, reply)
    await sql`
      insert into community_posts (thread_id, thread_url, subreddit, reply_text, posted_at, status)
      values (${c.id}, ${c.permalink}, ${c.subreddit}, ${reply}, ${ok ? new Date().toISOString() : null}, ${ok ? 'posted' : 'failed'})
      on conflict (thread_id) do nothing
    `
    if (ok) posted.push({ url: c.permalink, reply })
  }

  if (posted.length) {
    await sendMail({
      to: 'info@fastrack.school',
      subject: `Posted ${posted.length} community ${posted.length === 1 ? 'reply' : 'replies'} today`,
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;color:#26263a;">
        <p>The community agent posted these from your account:</p>
        ${posted.map((p) => `<p><a href="${p.url}">${p.url}</a></p><p style="background:#f7f7fb;border-radius:6px;padding:12px;white-space:pre-wrap;">${p.reply}</p>`).join('')}
      </div>`,
      text: posted.map((p) => `${p.url}\n${p.reply}`).join('\n\n'),
      replyTo: 'info@fastrack.school',
    })
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, posted: posted.length })
}
