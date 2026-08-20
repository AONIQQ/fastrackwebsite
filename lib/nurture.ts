import { sendMail } from './mail'
import { createUnsubscribeToken, unsubscribeHeaders } from './unsubscribe.mjs'
import { CREDIT_MAP_CHECKOUT, destinationForUrl, messageTrackingLinks } from './tracking-links.mjs'

const SITE = 'https://www.fastrack.school'
const U = (step: string) => `utm_source=email&utm_medium=nurture&utm_campaign=${step}`

const wrap = (body: string) => `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="background:#080b53;padding:20px 32px;"><img src="${SITE}/logo.png" width="110" alt="Fastrack" style="display:block;border:0;"></td></tr>
<tr><td style="padding:32px;">${body}
<p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#26263a;">Andrew<br>Fastrack</p></td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e6e6ef;"><p style="margin:0;font-size:12px;line-height:1.6;color:#8a8aa8;">
Fastrack LLC &middot; <a href="${SITE}" style="color:#8a8aa8;">fastrack.school</a><br>
You are receiving this because you used the Fastrack college savings calculator.
<a href="__UNSUB__" style="color:#8a8aa8;">Unsubscribe</a></p></td></tr>
</table></td></tr></table><img src="__PIXEL__" width="1" height="1" alt="" style="display:block;"></body></html>`

const p = (t: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#26263a;">${t}</p>`
const btn = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;"><tr><td style="background:#605dba;border-radius:8px;"><a href="${href}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">${label}</a></td></tr></table>`

/** Day offsets and content for each stage. Stage 0 is the results email, sent at capture. */
export const NURTURE_STEPS: { stage: number; afterDays: number; subject: string; html: string }[] = [
  {
    stage: 1,
    afterDays: 2,
    subject: 'The three ways families lose money on dual credit',
    html: wrap(
      p('Quick follow-up on your calculator results. Dual credit saves real money, but three mistakes quietly eat the savings:') +
        p('<strong>1. Courses that transfer but do not count.</strong> The college accepts the credit, then files it as a free elective that satisfies nothing. The class was paid for twice.') +
        p('<strong>2. The wrong version of the right course.</strong> Many colleges run separate tracks for majors and non-majors. Taking the non-major version of a course your student needs for their major means retaking it.') +
        p('<strong>3. Planning against the wrong requirements.</strong> High school graduation requirements and college degree requirements are different lists. A schedule that only satisfies one wastes the other.'),
    ),
  },
  {
    stage: 2,
    afterDays: 5,
    subject: 'A practical guide for checking credits before enrollment',
    html: wrap(
      p('Before your student enrolls, verify not only whether each course transfers, but whether it applies to the intended degree. A course can be accepted only as an elective or denied when it does not fit the receiving college’s degree requirements.') +
        p('The $47 Fastrack Guide gives families a structured starting framework for researching transfer policies, possible course options, schedules, funding, and the questions to confirm with each institution. It is educational material, not a personalized course map or a promise that a course will transfer or save money.') +
        btn(`${SITE}/guide?${U('n2')}`, 'Review the Fastrack Guide ($47)'),
    ),
  },
  {
    stage: 3,
    afterDays: 8,
    subject: 'A done-for-you plan for your student',
    html: wrap(
      p('If you want the whole thing handled: the Fastrack Credit Map is a term-by-term course plan from where your student is now through college graduation. Real course codes, every course checked against the transfer rules of the target college, every verified line with a source you can click.') +
        p('It is $497, delivered within 7 business days, no calls required. 30-day refund, no questions asked. And if your student’s state and college combination is one we cannot fully verify, we tell you up front and refund you rather than guess.') +
        btn('__CHECKOUT__', 'Get Your Credit Map ($497)') +
        p('Not sure it fits? Reply with your student’s state and the college(s) they are considering, and I will tell you straight whether we can help.'),
    ),
  },
  {
    stage: 4,
    afterDays: 12,
    subject: 'Last note from me',
    html: wrap(
      p('I will keep this short. Course registration windows are the deadline that matters: once your student picks next term’s classes, the planning either happened or it did not.') +
        p('If you want the plan done for you, it is here:') +
        btn(`${SITE}/credit-map?${U('n4')}`, 'Get the Credit Map') +
        p('Either way, check every course against the target college’s transfer rules before enrolling. It is the one step that protects all the others.'),
    ),
  },
]

export function buildNurtureEmailArgs(to: string, step: (typeof NURTURE_STEPS)[number], trackingId: string, providerIdempotencyKey: string, trackingIssuedAt: number) {
  const token = createUnsubscribeToken(to, process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET)
  const stepTag = `n${step.stage}`
  const tracking = messageTrackingLinks(trackingId, stepTag, trackingIssuedAt)
  let html = step.html.replaceAll('__CHECKOUT__', CREDIT_MAP_CHECKOUT)
  html = html.replace(/href="(https:\/\/[^"]+)"/g, (match, dest) => {
    const destination = destinationForUrl(dest)
    return destination ? `href="${tracking.click(destination)}"` : match
  })
  html = html.replaceAll('__PIXEL__', tracking.pixel)
  html = html.replaceAll('__UNSUB__', `${SITE}/api/u?t=${encodeURIComponent(token)}`)
  return {
    to,
    subject: step.subject,
    html,
    text: `View this email in an HTML capable client. Calculator: https://www.fastrack.school/calculator\n\nUnsubscribe: ${SITE}/api/u?t=${encodeURIComponent(token)}`,
    replyTo: 'info@fastrack.school',
    headers: unsubscribeHeaders(SITE, token),
    idempotencyKey: providerIdempotencyKey,
    requireIdempotentProvider: true,
  }
}

export async function sendNurtureStep(to: string, step: (typeof NURTURE_STEPS)[number], trackingId: string, providerIdempotencyKey: string, trackingIssuedAt: number) {
  return sendMail(buildNurtureEmailArgs(to, step, trackingId, providerIdempotencyKey, trackingIssuedAt))
}
