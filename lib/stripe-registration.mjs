export const STRIPE_WEBHOOK_URL = 'https://www.fastrack.school/api/webhooks/stripe'
export const STRIPE_REQUIRED_EVENTS = Object.freeze([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
])

export async function verifyStripeWebhookRegistration(apiKey, fetchImpl = fetch, timeoutMs = 5_000) {
  if (!apiKey) return 'UNVERIFIED'
  let response
  const controller = new AbortController()
  let timer
  try {
    response = await Promise.race([
      fetchImpl('https://api.stripe.com/v1/webhook_endpoints?limit=100', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
        signal: controller.signal,
      }),
      new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); resolve(null) }, timeoutMs) }),
    ])
  } catch {
    return 'UNVERIFIED'
  } finally {
    clearTimeout(timer)
  }
  if (!response?.ok) return 'UNVERIFIED'
  let body
  try { body = await response.json() } catch { return 'UNVERIFIED' }
  if (!Array.isArray(body?.data)) return 'UNVERIFIED'
  const matching = body.data.filter((endpoint) => endpoint?.url === STRIPE_WEBHOOK_URL && endpoint?.status === 'enabled')
  if (matching.length !== 1) return 'INVALID'
  const enabled = [...(Array.isArray(matching[0].enabled_events) ? matching[0].enabled_events : [])].sort()
  const required = [...STRIPE_REQUIRED_EVENTS].sort()
  return enabled.length === required.length && enabled.every((value, index) => value === required[index]) ? 'VERIFIED' : 'INVALID'
}
