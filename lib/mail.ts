import nodemailer from 'nodemailer'
import { google } from 'googleapis'
import { Resend } from 'resend'
import { createUnsubscribeToken, unsubscribeHeaders } from './unsubscribe.mjs'
import { messageTrackingLinks } from './tracking-links.mjs'

const OAuth2 = google.auth.OAuth2

/**
 * Two providers, tried in order.
 *
 * Resend first, when RESEND_API_KEY is present. Gmail SMTP is a poor transport
 * for transactional mail anyway, it is rate limited, it has no delivery
 * telemetry, and bouncing marketing volume through the same mailbox the
 * business reads puts the primary domain's reputation at risk.
 *
 * Gmail OAuth is the fallback and is what the site used exclusively. Note that
 * its refresh token had silently expired (`invalid_grant`), which meant every
 * email the site tried to send, including the counselor signup notification , 
 * failed with no visible symptom. Refresh tokens for apps in Google's "Testing"
 * publishing status expire after 7 days; published-app tokens expire on
 * password change or 6 months of disuse. Either way this WILL happen again, so
 * failures are now logged loudly and surfaced to the caller.
 */

export type SendArgs = {
  to: string
  subject: string
  text: string
  html?: string
  replyTo?: string
  headers?: Record<string, string>
  idempotencyKey?: string
  requireIdempotentProvider?: boolean
}

export type SendReceipt = { provider: 'resend' | 'gmail'; messageId: string | null }

function fromAddress() {
  return process.env.EMAIL_FROM || process.env.EMAIL_USER || 'info@fastrack.school'
}

async function sendViaResend(args: SendArgs) {
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM || `Fastrack <${fromAddress()}>`,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
    replyTo: args.replyTo,
    headers: args.headers,
  }, args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined)
  if (error) throw new Error(`Resend: ${error.message}`)
  return { provider: 'resend' as const, messageId: data?.id ?? null }
}

export async function getTransporter() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, EMAIL_USER } = process.env

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !EMAIL_USER) {
    throw new Error('Gmail OAuth environment variables are not configured')
  }

  const oauth2Client = new OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground',
  )
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  const accessToken = await oauth2Client.getAccessToken()

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      type: 'OAuth2',
      user: EMAIL_USER,
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      refreshToken: GOOGLE_REFRESH_TOKEN,
      accessToken: accessToken?.token || '',
    },
  })
}

async function sendViaGmail(args: SendArgs) {
  const transporter = await getTransporter()
  const receipt = await transporter.sendMail({
    from: fromAddress(),
    to: args.to,
    replyTo: args.replyTo,
    subject: args.subject,
    text: args.text,
    html: args.html,
    headers: args.headers,
  })
  return { provider: 'gmail' as const, messageId: receipt.messageId || null }
}

/** Single entry point. Throws only if every configured provider fails. */
export async function sendMail(args: SendArgs): Promise<SendReceipt> {
  const errors: string[] = []

  if (process.env.RESEND_API_KEY) {
    try {
      return await sendViaResend(args)
    } catch (err) {
      errors.push(`resend: ${(err as Error).message}`)
    }
  }

  if (args.requireIdempotentProvider) {
    throw new Error(errors.length ? 'Idempotent mail provider rejected the request' : 'Idempotent mail provider is not configured')
  }

  try {
    return await sendViaGmail(args)
  } catch (err) {
    const message = (err as Error).message
    errors.push(`gmail: ${message}`)
    if (message.includes('invalid_grant')) {
      console.error(
        '[mail] GOOGLE_REFRESH_TOKEN is expired or revoked. Re-authorise at ' +
          'https://developers.google.com/oauthplayground, or set RESEND_API_KEY to bypass Gmail entirely.',
      )
    }
  }

  throw new Error(`All mail providers failed, ${errors.join('; ')}`)
}

const money = (v: number | null | undefined) =>
  v == null ? '-' : `$${Math.round(v).toLocaleString('en-US')}`

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export type ResultsEmail = {
  to: string
  collegeName: string
  residency: string
  annualCost: number
  standardTotal: number
  standardRecoup: string
  fastrackTotal: number
  fastrackRecoup: string
  savings: number
  earlyEarnings: number | null
  totalAdvantage: number | null
  yearsSaved: number
  trackingId: string
  providerIdempotencyKey: string
}

const SITE = 'https://www.fastrack.school'

type ResultsLinks = { creditMap: string; calculator: string; pixel: string }

function resultsHtml(r: ResultsEmail, links: ResultsLinks) {
  const row = (label: string, a: string, b: string) => `
    <tr>
      <td class="lbl" style="padding:12px 16px;border-bottom:1px solid #e6e6ef;color:#5a5a78;font-size:14px;">${esc(label)}</td>
      <td class="col-a" style="padding:12px 16px;border-bottom:1px solid #e6e6ef;text-align:right;font-size:16px;font-weight:600;color:#b3261e;">${esc(a)}</td>
      <td class="col-b" style="padding:12px 16px;border-bottom:1px solid #e6e6ef;text-align:right;font-size:16px;font-weight:600;color:#1a6b3c;">${esc(b)}</td>
    </tr>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!--
  Declaring color-scheme is what stops Gmail and Apple Mail from applying their
  own blanket colour inversion. Without it those clients invert the whole email
  themselves and the palette comes out wrong, light text on light panels, and
  the navy blocks flipped to pale lilac.
-->
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }

  @media (prefers-color-scheme: dark) {
    .bg      { background:#0b0b17 !important; }
    .card    { background:#15152c !important; }
    .head    { color:#f0f0f8 !important; }
    .body    { color:#b9b9d4 !important; }
    .lbl     { color:#9a9ab8 !important; border-bottom-color:#2a2a4a !important; }
    .col-a   { color:#ff9a92 !important; border-bottom-color:#2a2a4a !important; }
    .col-b   { color:#6ee7a0 !important; border-bottom-color:#2a2a4a !important; }
    .colhead-a { color:#ff9a92 !important; }
    .colhead-b { color:#6ee7a0 !important; }
    .rule    { border-top-color:#2a2a4a !important; }
    .muted   { color:#8686a6 !important; }
    .muted a { color:#8686a6 !important; }
  }

  /* Outlook.com dark mode uses its own attribute hooks. */
  [data-ogsc] .bg    { background:#0b0b17 !important; }
  [data-ogsc] .card  { background:#15152c !important; }
  [data-ogsc] .head  { color:#f0f0f8 !important; }
  [data-ogsc] .body  { color:#b9b9d4 !important; }
  [data-ogsc] .lbl   { color:#9a9ab8 !important; }
  [data-ogsc] .col-a { color:#ff9a92 !important; }
  [data-ogsc] .col-b { color:#6ee7a0 !important; }
  [data-ogsc] .muted { color:#8686a6 !important; }
</style>
</head>
<body class="bg" style="margin:0;background:#f0f0f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" bgcolor="#f0f0f8" style="background:#f0f0f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card" bgcolor="#ffffff" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">

        <!-- Brand bar. Already navy, so it reads correctly in both schemes. -->
        <tr><td bgcolor="#080b53" style="background:#080b53;padding:22px 24px;">
          <img src="${SITE}/logo.png" width="132" alt="Fastrack" style="display:block;border:0;height:auto;max-width:132px;">
        </td></tr>

        <tr><td style="padding:28px 24px 8px;">
          <h1 class="head" style="margin:0 0 8px;font-size:22px;line-height:1.3;color:#080b53;">Your results for ${esc(r.collegeName)}</h1>
          <p class="body" style="margin:0;color:#5a5a78;font-size:15px;line-height:1.6;">
            Here is what that degree costs on the standard four-year path, and what the same degree costs finishing in two.
          </p>
        </td></tr>

        <tr><td style="padding:20px 8px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <th style="padding:8px 16px;text-align:left;font-size:12px;"></th>
              <th class="colhead-a" style="padding:8px 16px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#b3261e;font-weight:600;">4 years</th>
              <th class="colhead-b" style="padding:8px 16px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#1a6b3c;font-weight:600;">With Fastrack</th>
            </tr>
            ${row('Total cost', money(r.standardTotal), money(r.fastrackTotal))}
            ${row('Time to earn it back', r.standardRecoup, r.fastrackRecoup)}
          </table>
        </td></tr>

        <tr><td style="padding:20px 24px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#080b53" style="background:#080b53;border-radius:10px;">
            <tr><td style="padding:20px 24px;text-align:center;">
              <p style="margin:0 0 4px;color:#b9b9e0;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;">Total advantage</p>
              <p style="margin:0;color:#ffffff;font-size:34px;font-weight:700;letter-spacing:-0.02em;">${esc(money(r.totalAdvantage))}</p>
              <p style="margin:8px 0 0;color:#b9b9e0;font-size:14px;">
                ${esc(money(r.savings))} saved, plus ${esc(money(r.earlyEarnings))} from entering the workforce ${r.yearsSaved} years earlier.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:24px;">
          <p class="body" style="margin:0 0 16px;color:#5a5a78;font-size:15px;line-height:1.6;">
            The savings are real but they are not automatic, they depend on picking dual-credit courses that actually
            transfer into your degree. That is the part families get wrong, and it is what we build for you.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td bgcolor="#605dba" style="background:#605dba;border-radius:8px;">
              <a href="${links.creditMap}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Get your done-for-you Credit Map</a>
            </td></tr>
          </table>
          <p style="margin:12px 0 0;text-align:center;font-size:14px;">
            <a href="${links.calculator}" style="color:#605dba;">Run the numbers for another school &rarr;</a>
          </p>
        </td></tr>

        <tr><td class="rule" style="padding:16px 24px 24px;border-top:1px solid #e6e6ef;">
          <p class="muted" style="margin:0;color:#8a8aa8;font-size:12px;line-height:1.6;">
            Figures use average net price and median post-enrollment earnings from the U.S. Department of Education
            College Scorecard, and assume 60 dual-credit hours at $80 per credit. Individual results vary with state,
            school and course selection.
          </p>
          <p class="muted" style="margin:12px 0 0;color:#8a8aa8;font-size:12px;">
            Fastrack &middot; 1007 N Orange St, Wilmington, Delaware &middot;
            <a href="mailto:info@fastrack.school" style="color:#8a8aa8;">info@fastrack.school</a>
            &middot; <a href="__UNSUB__" style="color:#8a8aa8;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
<img src="${links.pixel}" width="1" height="1" alt="" style="display:block;"></body></html>`
}
function resultsText(r: ResultsEmail, links: ResultsLinks) {
  return [
    `Your results for ${r.collegeName}`,
    '',
    `The standard 4-year path:  ${money(r.standardTotal)}, ${r.standardRecoup} to earn back`,
    `With Fastrack (2 years):   ${money(r.fastrackTotal)}, ${r.fastrackRecoup} to earn back`,
    '',
    `Money saved:      ${money(r.savings)}`,
    `Early earnings:   ${money(r.earlyEarnings)} (${r.yearsSaved} extra years in the workforce)`,
    `Total advantage:  ${money(r.totalAdvantage)}`,
    '',
    `Get your done-for-you Credit Map: ${links.creditMap}`,
    '',
    'Figures use average net price and median post-enrollment earnings from the U.S. Department',
    'of Education College Scorecard, and assume 60 dual-credit hours at $80 per credit.',
    'Individual results vary with state, school and course selection.',
    '',
    'Fastrack, 1007 N Orange St, Wilmington, Delaware. info@fastrack.school',
  ].join('\n')
}

/** Sends the prospect their own results. */
export async function sendResultsEmail(r: ResultsEmail) {
  const token = createUnsubscribeToken(r.to, process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET)
  const tracking = messageTrackingLinks(r.trackingId, 'results')
  const links = { creditMap: tracking.click('credit_map'), calculator: tracking.click('calculator'), pixel: tracking.pixel }
  return sendMail({
    to: r.to,
    replyTo: 'info@fastrack.school',
    subject: `${r.collegeName}: ${money(r.totalAdvantage)} and ${r.yearsSaved} years back`,
    text: `${resultsText(r, links)}\n\nUnsubscribe: ${SITE}/api/u?t=${encodeURIComponent(token)}`,
    html: resultsHtml(r, links).replaceAll('__UNSUB__', `${SITE}/api/u?t=${encodeURIComponent(token)}`),
    headers: unsubscribeHeaders(SITE, token),
    idempotencyKey: r.providerIdempotencyKey,
    requireIdempotentProvider: true,
  })
}

/** Tells Andrew a lead came in, while it is still warm. */
export async function notifyNewLead(lead: {
  email: string
  phone?: string | null
  state?: string | null
  residency?: string | null
  college?: string | null
  totalAdvantage?: number | null
}) {
  await sendMail({
    to: process.env.LEAD_NOTIFY_TO || 'info@fastrack.school',
    replyTo: lead.email,
    subject: `New calculator lead: ${lead.email}${lead.state ? ` (${lead.state})` : ''}`,
    text: [
      `Email:     ${lead.email}`,
      `Phone:     ${lead.phone || '-'}`,
      `State:     ${lead.state || '-'}`,
      `Residency: ${lead.residency || '-'}`,
      `College:   ${lead.college || '-'}`,
      `Advantage: ${money(lead.totalAdvantage)}`,
      '',
      `All leads: ${SITE}/admin/leads`,
      '',
      'Reply directly to this email to reach them.',
    ].join('\n'),
  })
}
