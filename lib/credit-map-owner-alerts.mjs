const ADMIN_URL = 'https://www.fastrack.school/admin/leads'

export function creditMapOwnerMessage() {
  return Object.freeze({
    subject: 'Credit Map intake ready',
    text: `A paid Credit Map buyer submitted the intake needed for fulfillment.\n\nReview it in the protected admin: ${ADMIN_URL}`,
  })
}

export function assertCreditMapOwnerMessagePrivacy(message) {
  const canonical = creditMapOwnerMessage()
  if (message?.subject !== canonical.subject || message?.text !== canonical.text) {
    throw new Error('credit_map_owner_alert_contains_disallowed_detail')
  }
  const serialized = `${message?.subject ?? ''}\n${message?.text ?? ''}`
  if (/@|\b(?:email|phone|student|buyer name|checkout|session|payment_intent|sale_id|intake_id|token|provider_message_id)\b/i.test(serialized)) {
    throw new Error('credit_map_owner_alert_contains_disallowed_detail')
  }
  return message
}

export async function runCreditMapOwnerAlerts({ claim, complete, release, send }, limit = 20) {
  const boundedLimit = Math.max(1, Math.min(20, Math.trunc(limit)))
  let sent = 0
  for (let index = 0; index < boundedLimit; index += 1) {
    const claimed = await claim(creditMapOwnerMessage())
    if (!claimed) break
    try {
      const message = assertCreditMapOwnerMessagePrivacy(claimed.message)
      const receipt = await send({ ...message, idempotencyKey: claimed.idempotencyKey })
      if (!receipt?.messageId) throw new Error('owner_alert_provider_receipt_missing')
      await complete(claimed.token, receipt.messageId)
      sent += 1
    } catch {
      await release(claimed.token)
      return Object.freeze({ ok: false, sent, failure: 'provider_or_completion_rejected' })
    }
  }
  return Object.freeze({ ok: true, sent })
}
