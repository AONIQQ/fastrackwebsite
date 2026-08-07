/**
 * Outbound SMS via Twilio.
 *
 * Inert unless TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are
 * all set, so deploying this changes nothing until those exist.
 *
 * IMPORTANT, this only ever fires when the lead ticked the consent box. Under
 * the TCPA, a marketing text without prior express WRITTEN consent carries
 * statutory damages of $500-$1,500 per message, and these are parents' personal
 * mobile numbers. The consent checkbox and the stored `sms_consent` flag are the
 * record that proves consent existed. Do not add a code path that texts someone
 * who did not tick it.
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
export function resultsSms(collegeName: string, totalAdvantage: number | null) {
  const money = totalAdvantage == null ? null : `$${Math.round(totalAdvantage).toLocaleString('en-US')}`
  return [
    'Fastrack:',
    money
      ? `your ${collegeName} results show ${money} and 2 years back by finishing in 2 instead of 4.`
      : `your ${collegeName} results are ready.`,
    'Full breakdown: fastrack.school/calculator',
    'Reply STOP to opt out.',
  ].join(' ')
}
