import { sendMail } from './mail'
import { createUnsubscribeToken, unsubscribeHeaders } from './unsubscribe.mjs'
import { CREDIT_MAP_CHECKOUT, destinationForUrl, messageTrackingLinks } from './tracking-links.mjs'

const SITE = 'https://www.fastrack.school'
const U = (step: string) => `utm_source=email&utm_medium=nurture&utm_campaign=${step}`

const wrap = (body: string, commercial = false) => `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="background:#080b53;padding:20px 32px;"><img src="${SITE}/logo.png" width="110" alt="Fastrack" style="display:block;border:0;"></td></tr>
<tr><td style="padding:32px;">${body}
<p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#26263a;">Andrew<br>Fastrack</p></td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #e6e6ef;"><p style="margin:0;font-size:12px;line-height:1.6;color:#8a8aa8;">
Fastrack EDU LLC &middot; <a href="${SITE}" style="color:#8a8aa8;">fastrack.school</a><br>
__POSTAL_ADDRESS__${commercial ? 'Advertisement from Fastrack EDU LLC.<br>' : ''}
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
    subject: 'Three checks before dual credit counts as savings',
    html: wrap(
      p('Quick follow-up on your calculator results. Dual credit can reduce college costs, but only when the credits fit the student’s plan and the family’s specific situation. Check these three things before enrolling:') +
        p('<strong>1. Whether the course applies to the intended degree.</strong> A college may accept a course only as an elective, leaving a required course still to be completed.') +
        p('<strong>2. Whether it is the right course or sequence.</strong> Some majors require a specific version or sequence. Confirm the exact course against the target program’s current requirements.') +
        p('<strong>3. Whether it satisfies both plans.</strong> High school graduation requirements and college degree requirements are different lists. Confirm how the course applies to each one.'),
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
      true,
    ),
  },
  {
    stage: 3,
    afterDays: 8,
    subject: 'A done-for-you plan for your student',
    html: wrap(
      p('If you want a done-for-you starting plan, the Fastrack Credit Map is a proposed term-by-term course plan from where your student is now through college graduation. It uses real course codes, maps each proposed course to the requirements it may satisfy, sources every verified transfer line, and flags anything that still needs confirmation.') +
        p('It is $497, delivered within 7 business days, no calls required. 30-day refund, no questions asked. And if your student’s state and college combination is one we cannot fully verify, we tell you up front and refund you rather than guess.') +
        btn('__CHECKOUT__', 'Get Your Credit Map ($497)') +
        p('Not sure it fits? Reply with your student’s state and the college(s) they are considering, and I will tell you straight whether we can help.'),
      true,
    ),
  },
  {
    stage: 4,
    afterDays: 12,
    subject: 'Last note from me',
    html: wrap(
      p('I will keep this short. Before your student registers, it is worth checking how each proposed course fits the target college’s current transfer and degree requirements.') +
        p('If you want a sourced starting plan with unresolved items clearly flagged, it is here:') +
        btn(`${SITE}/credit-map?${U('n4')}`, 'Get the Credit Map') +
        p('Either way, confirm each proposed course with the relevant institutions before enrolling. Final transfer and degree-applicability decisions rest with those institutions.'),
      true,
    ),
  },
]

export function buildNurtureEmailArgs(to: string, step: (typeof NURTURE_STEPS)[number], trackingId: string, providerIdempotencyKey: string, trackingIssuedAt: number) {
  const token = createUnsubscribeToken(to, process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET)
  const stepTag = `n${step.stage}`
  const tracking = messageTrackingLinks(trackingId, stepTag, trackingIssuedAt)
  const rawPostalAddress = process.env.BUSINESS_POSTAL_ADDRESS?.trim() || ''
  if (step.stage >= 2 && (!rawPostalAddress || rawPostalAddress.length > 200 || /[<>\r\n]/.test(rawPostalAddress))) {
    throw new Error('business_postal_address_invalid')
  }
  const postalAddress = rawPostalAddress
    ? `${rawPostalAddress.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')}<br>`
    : ''
  const complianceText = [
    step.stage >= 2 ? 'Advertisement from Fastrack EDU LLC.' : '',
    rawPostalAddress,
  ].filter(Boolean).join('\n')
  let html = step.html
    .replaceAll('__CHECKOUT__', CREDIT_MAP_CHECKOUT)
    .replaceAll('__POSTAL_ADDRESS__', postalAddress)
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
    text: `View this email in an HTML capable client. Calculator: https://www.fastrack.school/calculator\n\n${complianceText ? `${complianceText}\n\n` : ''}Unsubscribe: ${SITE}/api/u?t=${encodeURIComponent(token)}`,
    replyTo: 'info@fastrack.school',
    headers: unsubscribeHeaders(SITE, token),
    idempotencyKey: providerIdempotencyKey,
    requireIdempotentProvider: true,
  }
}

export async function sendNurtureStep(to: string, step: (typeof NURTURE_STEPS)[number], trackingId: string, providerIdempotencyKey: string, trackingIssuedAt: number) {
  return sendMail(buildNurtureEmailArgs(to, step, trackingId, providerIdempotencyKey, trackingIssuedAt))
}
