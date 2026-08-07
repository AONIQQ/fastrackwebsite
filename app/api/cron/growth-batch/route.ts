import { NextResponse } from 'next/server'
import { sendMail } from '@/lib/mail'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Weekly distribution batch: communities, affiliate prospects with drafted
 *  pitches, and one shareable post. Search-grounded model, own mail path. */
const PROMPT = `You research growth channels for Fastrack (fastrack.school), which sells a $497 done-for-you dual credit plan to parents of 11th-12th graders (homeschool families included) and offers a free college cost calculator at fastrack.school/calculator.

Produce, using real web research:

SECTION 1, three online communities (Facebook groups, subreddits, forums, or Discords) where parents of high schoolers or homeschool families discuss college costs or dual enrollment. For each: name, platform, approximate member count, link, one sentence on fit, any posting rules found.

SECTION 2, three affiliate or partnership prospects: homeschool bloggers, college-cost YouTubers, education podcasters, or co-op leaders with real audiences. For each: name, platform and audience size, public contact info if findable, and a drafted partnership pitch email under 150 words offering a revenue share on referred sales of the $497 Credit Map. Lead with what their audience gets (the free calculator). Never overstate the company: one product, small company, no invented numbers.

SECTION 3, one shareable post for parent Facebook groups: a specific data-backed insight about dual enrollment or college costs with its real source named, written like a helpful parent sharing a finding, ending with a soft mention of the free calculator at fastrack.school/calculator. 120-200 words.

Rules for all drafted copy: no em dashes, no fabricated statistics, plain direct language. End with a three-line action summary: join these, send these, post this.`

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const call = async (model: string, prompt: string, maxTokens: number) => {
    const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY ?? ''}`,
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
    })
    if (!r.ok) throw new Error(String(r.status))
    const d = await r.json()
    return (d.choices?.[0]?.message?.content ?? '') as string
  }

  let text = ''
  let model = 'none'
  try {
    let research = ''
    for (const m of ['perplexity/sonar-pro', 'perplexity/sonar']) {
      try {
        research = await call(m, `Research for a growth report for fastrack.school (dual credit planning for parents of high schoolers, free calculator at fastrack.school/calculator). Find with real web search: (a) three online communities (Facebook groups, subreddits, forums, Discords) where parents of high schoolers or homeschool families discuss college costs or dual enrollment, with member counts and links and any posting rules; (b) three potential partners: homeschool bloggers, college-cost YouTubers, education podcasters, or co-op leaders, with audience sizes and public contact info where findable; (c) one specific, citable statistic about dual enrollment or college costs with its source. Report facts only, with URLs.`, 3000)
        if (research.length > 200) break
      } catch {
        // next
      }
    }
    if (research.length > 200) {
      text = await call('openai/gpt-5.6-luna', `${PROMPT}\n\nUse ONLY the following verified research (do not invent communities, people, or statistics):\n\n${research}`, 3500)
      if (text.length > 200) model = 'sonar-pro + gpt-5.6-luna'
    }
  } catch {
    // fall through to the failure alert
  }

  if (!text) {
    await sendMail({
      to: 'info@fastrack.school',
      subject: 'Weekly growth batch failed to generate',
      text: 'AI gateway call failed. Check credits and AI_GATEWAY_API_KEY.',
      replyTo: 'info@fastrack.school',
    })
    return NextResponse.json({ ok: false }, { status: 502 })
  }

  await sendMail({
    to: 'info@fastrack.school',
    subject: 'Weekly growth batch: communities, pitches, and a post',
    html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#26263a;white-space:pre-wrap;">${text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')}</div>`,
    text,
    replyTo: 'info@fastrack.school',
  })
  return NextResponse.json({ ok: true, model, chars: text.length })
}
