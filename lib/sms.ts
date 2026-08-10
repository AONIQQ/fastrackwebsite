/**
 * Outbound SMS via Twilio.
 *
 * Inert unless CAPTURE_SMS_ENABLED is exactly `1` and all Twilio credentials
 * are set. Capture still requires a separately verified phone relationship and
 * durable eligibility; this module-level switch is only defense in depth.
 *
 * IMPORTANT, checkbox consent alone is not send eligibility. Under
 * the TCPA, a marketing text without prior express WRITTEN consent carries
 * statutory damages of $500-$1,500 per message, and these are parents' personal
 * mobile numbers. Do not add a code path that texts an unverified phone or a
 * person without the stored consent relationship.
 *
 * Called with `await` deliberately omitted from the request path, a texting
 * failure must never block a lead from being saved.
 */

const E164 = /^\+[1-9]\d{7,14}$/

/** Best-effort E.164. Assumes +1 for bare 10-digit numbers, which is what US parents type. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d+]/g, '')
  if (E164.test(digits)) return digits
  const bare = digits.replace(/\D/g, '')
  if (bare.length === 10) return `+1${bare}`
  if (bare.length === 11 && bare.startsWith('1')) return `+${bare}`
  return null
}

export function smsConfigured() {
  return Boolean(
    process.env.CAPTURE_SMS_ENABLED === '1' &&
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  )
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!smsConfigured()) return false

  const sid = process.env.TWILIO_ACCOUNT_SID!
  const token = process.env.TWILIO_AUTH_TOKEN!
  const from = process.env.TWILIO_FROM_NUMBER!

  const normalized = normalizePhone(to)
  if (!normalized) return false

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: normalized, From: from, Body: body }),
    })

    if (!res.ok) {
      console.error('[sms] Twilio error', res.status, await res.text())
      return false
    }
    return true
  } catch (error) {
    console.error('[sms] send failed', error)
    return false
  }
}

/** Every message must identify the sender and give a documented opt-out. */
export function resultsSms(_collegeName: string, totalAdvantage: number | null) {
  const money = totalAdvantage == null ? null : `$${Math.round(totalAdvantage).toLocaleString('en-US')}`
  return [
    'Fastrack:',
    money
      ? `Your modeled estimate is ${money}.`
      : 'Your modeled estimate is ready.',
    'Assumes 60 credits at $80, average net price for federal-aid recipients, plus 2 years of median post-enrollment earnings.',
    'Transfer, degree fit, residency and aid vary.',
    'See your email.',
    'Reply STOP to opt out.',
  ].join(' ')
}
