import { NextResponse } from 'next/server'
import { sendMail } from '@/lib/mail'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Daily community reply pack, fully self-contained: a search-grounded model
 * (Perplexity Sonar via the Vercel AI Gateway) finds fresh threads and drafts
 * answers; the digest ships through the same tracked mail path as everything
 * else. No external schedulers, no scrapeable-site dependencies.
 */
const PROMPT = `For each thread found, output exactly this format:

THREAD: <title>
URL: <direct link>
FORUM: <subreddit or forum name>
REPLY: <a 120-180 word reply that answers the actual question first with specifics, sounds like a knowledgeable parent rather than a marketer, and only mentions the free calculator at fastrack.school/calculator or the state pages at fastrack.school/savings when genuinely relevant to the question. Never mention any paid product. No em dashes. Plain text.>

Separate threads with a line containing only: ---

If you cannot find any genuinely recent threads, output NONE and then two evergreen post ideas in the same REPLY format.`



/** GPT-5.6 Luna with its native web-search tool, via the gateway's Responses API. */
async function luna(prompt: string, maxTokens: number): Promise<string> {
  const r = await fetch('https://ai-gateway.vercel.sh/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY ?? ''}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-5.6-luna',
      tools: [{ type: 'web_search' }],
      max_output_tokens: maxTokens,
      input: prompt,
    }),
  })
  if (!r.ok) throw new Error(`luna: ${r.status}`)
  const d = await r.json()
  const texts: string[] = []
  for (const o of d.output ?? []) {
    if (o.type === 'message') {
      for (const c of o.content ?? []) {
        if (c.type === 'output_text') texts.push(c.text)
      }
    }
  }
  return texts.join('\n')
}

async function draftPack(): Promise<{ ok: boolean; text: string; model: string }> {
  try {
    const text = await luna(
      `Search the web for 4 to 6 forum threads posted in the LAST 2 DAYS where parents or students discuss: dual enrollment, AP vs dual credit, CLEP, college being unaffordable, or graduating college early. Reddit (r/ApplyingToCollege, r/homeschool, r/Parenting, r/personalfinance and similar) and College Confidential. Use only threads you actually found with working URLs.\n\n${PROMPT}`,
      4000,
    )
    if (text.length > 100) return { ok: true, text, model: 'gpt-5.6-luna' }
    return { ok: false, text: '', model: 'none' }
  } catch {
    return { ok: false, text: '', model: 'none' }
  }
}

function toDigest(text: string): { html: string; count: number } {
  const blocks = text.split(/\n---\n?/).map((b) => b.trim()).filter(Boolean)
  let count = 0
  const cards = blocks
    .map((b) => {
      const title = b.match(/THREAD:\s*(.+)/)?.[1]
      const url = b.match(/URL:\s*(\S+)/)?.[1]
      const forum = b.match(/FORUM:\s*(.+)/)?.[1] ?? ''
      const reply = b.match(/REPLY:\s*([\s\S]+)/)?.[1]?.trim()
      if (!reply) return ''
      count += 1
      const head = url
        ? `<a href="${url}">${title ?? url}</a>`
        : (title ?? 'Post idea')
      return `<div style="border:1px solid #e6e6ef;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 4px;"><strong>${forum}</strong> ${head}</p>
        <p style="white-space:pre-wrap;background:#f7f7fb;border-radius:6px;padding:12px;margin:8px 0 0;">${reply}</p>
      </div>`
    })
    .join('')
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#26263a;">
    <h2 style="color:#080b53;">Today's reply pack</h2>
    <p>Paste, tweak one sentence so it sounds like you, submit.</p>
    ${cards || `<p style="white-space:pre-wrap;">${text}</p>`}
  </div>`
  return { html, count }
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const draft = await draftPack()
  if (!draft.ok) {
    await sendMail({
      to: 'info@fastrack.school',
      subject: 'Reply pack failed to generate today',
      text: 'The AI gateway call failed on all models. Check Vercel AI Gateway credits and the AI_GATEWAY_API_KEY env var.',
      replyTo: 'info@fastrack.school',
    })
    return NextResponse.json({ ok: false, reason: 'model unavailable' }, { status: 502 })
  }

  const { html, count } = toDigest(draft.text)
  await sendMail({
    to: 'info@fastrack.school',
    subject: `Reply pack: ${count || 'post ideas'} for today`,
    html,
    text: draft.text,
    replyTo: 'info@fastrack.school',
  })
  return NextResponse.json({ ok: true, threads: count, model: draft.model })
}
