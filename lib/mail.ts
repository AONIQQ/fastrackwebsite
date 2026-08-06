import nodemailer from 'nodemailer'
import { google } from 'googleapis'
import { Resend } from 'resend'

const OAuth2 = google.auth.OAuth2

/**
 * Two providers, tried in order.
 *
 * Resend first, when RESEND_API_KEY is present. Gmail SMTP is a poor transport
 * for transactional mail anyway — it is rate limited, it has no delivery
 * telemetry, and bouncing marketing volume through the same mailbox the
 * business reads puts the primary domain's reputation at risk.
 *
 * Gmail OAuth is the fallback and is what the site used exclusively. Note that
 * its refresh token had silently expired (`invalid_grant`), which meant every
 * email the site tried to send — including the counselor signup notification —
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
}

function fromAddress() {
  return process.env.EMAIL_FROM || process.env.EMAIL_USER || 'info@fastrack.school'
}

async function sendViaResend(args: SendArgs) {
  const resend = new Resend(process.env.RESEND_API_KEY!)
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM || `Fastrack <${fromAddress()}>`,
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
    replyTo: args.replyTo,
  })
  if (error) throw new Error(`Resend: ${error.message}`)
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
  await transporter.sendMail({
    from: fromAddress(),
    to: args.to,
    replyTo: args.replyTo,
    subject: args.subject,
    text: args.text,
    html: args.html,
  })
}

/** Single entry point. Throws only if every configured provider fails. */
export async function sendMail(args: SendArgs): Promise<void> {
  const errors: string[] = []

  if (process.env.RESEND_API_KEY) {
    try {
      await sendViaResend(args)
      return
    } catch (err) {
      errors.push(`resend: ${(err as Error).message}`)
    }
  }

  try {
    await sendViaGmail(args)
    return
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

  throw new Error(`All mail providers failed — ${errors.join('; ')}`)
}

const money = (v: number | null | undefined) =>
  v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`

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
}

const SITE = 'https://www.fastrack.school'

function resultsHtml(r: ResultsEmail) {
  const row = (label: string, a: string, b: string) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e6e6ef;color:#5a5a78;font-size:14px;">${esc(label)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e6e6ef;text-align:right;font-size:16px;font-weight:600;color:#b3261e;">${esc(a)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e6e6ef;text-align:right;font-size:16px;font-weight:600;color:#1a6b3c;">${esc(b)}</td>
    </tr>`

  return `<!doctype html>
<html><body style="margin:0;background:#f0f0f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#080b53;padding:24px;">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.01em;">Fastrack</p>
        </td></tr>

        <tr><td style="padding:28px 24px 8px;">
          <h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:#080b53;">Your results for ${esc(r.collegeName)}</h1>
          <p style="margin:0;color:#5a5a78;font-size:15px;line-height:1.6;">
            Here is what that degree costs on the standard four-year path, and what the same degree costs finishing in two.
          </p>
        </td></tr>

        <tr><td style="padding:20px 8px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <th style="padding:8px 16px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#8a8aa8;font-weight:600;"></th>
              <th style="padding:8px 16px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#b3261e;font-weight:600;">4 years</th>
              <th style="padding:8px 16px;text-align:right;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#1a6b3c;font-weight:600;">With Fastrack</th>
            </tr>
            ${row('Total cost', money(r.standardTotal), money(r.fastrackTotal))}
            ${row('Time to earn it back', r.standardRecoup, r.fastrackRecoup)}
          </table>
        </td></tr>

        <tr><td style="padding:20px 24px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#080b53;border-radius:10px;">
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
          <p style="margin:0 0 16px;color:#5a5a78;font-size:15px;line-height:1.6;">
            The savings are real but they are not automatic — they depend on picking dual-credit courses that actually transfer into your degree.
            That is the part families get wrong, and it is what we build for you.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td style="background:#605dba;border-radius:8px;">
              <a href="${SITE}/student" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">Book a free planning session</a>
            </td></tr>
          </table>
          <p style="margin:20px 0 0;text-align:center;font-size:14px;">
            <a href="${SITE}/guide" style="color:#605dba;">Or start with the step-by-step guide &rarr;</a>
          </p>
        </td></tr>

        <tr><td style="padding:16px 24px 24px;border-top:1px solid #e6e6ef;">
          <p style="margin:0;color:#8a8aa8;font-size:12px;line-height:1.6;">
            Figures use average net price and median post-enrollment earnings from the U.S. Department of Education College Scorecard,
            and assume 60 dual-credit hours at $80 per credit. Individual results vary with state, school and course selection.
          </p>
          <p style="margin:12px 0 0;color:#8a8aa8;font-size:12px;">
            Fastrack &middot; 1007 N Orange St, Wilmington, Delaware &middot;
            <a href="mailto:info@fastrack.school" style="color:#8a8aa8;">info@fastrack.school</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function resultsText(r: ResultsEmail) {
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
    `Book a free planning session: ${SITE}/student`,
    `Step-by-step guide: ${SITE}/guide`,
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
  await sendMail({
    to: r.to,
    replyTo: 'info@fastrack.school',
    subject: `${r.collegeName}: ${money(r.totalAdvantage)} and ${r.yearsSaved} years back`,
    text: resultsText(r),
    html: resultsHtml(r),
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
      `Phone:     ${lead.phone || '—'}`,
      `State:     ${lead.state || '—'}`,
      `Residency: ${lead.residency || '—'}`,
      `College:   ${lead.college || '—'}`,
      `Advantage: ${money(lead.totalAdvantage)}`,
      '',
      `All leads: ${SITE}/admin/leads`,
      '',
      'Reply directly to this email to reach them.',
    ].join('\n'),
  })
}
