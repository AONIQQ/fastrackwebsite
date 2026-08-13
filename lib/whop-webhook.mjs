import { normalizeWhopEvent, readWhopBody, verifyWhopSignature } from './whop-ledger.mjs'

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
})

export function createWhopPost({ secret, companyId, productId, planId, persist, claimsForReference = () => null, nowSeconds, runtimeProof = false }) {
  return async function POST(request) {
    if (!secret || !companyId || !productId || !planId) return json({ error: 'not_configured' }, 503)
    const read = await readWhopBody(request)
    if (!read.ok) return json({ error: 'payload_too_large' }, read.status)
    if (!verifyWhopSignature(read.body, request.headers, secret, nowSeconds?.())) return json({ error: 'bad_signature' }, 400)

    let parsed
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(read.body)) } catch { return json({ error: 'invalid_payload' }, 400) }
    const event = normalizeWhopEvent(parsed)
    if (!event || event.eventId !== request.headers.get('webhook-id') || event.currency !== 'usd') {
      return json({ error: 'invalid_payload' }, 400)
    }
    if (event.companyId !== companyId) return json({ received: true, ignored: true })

    const paymentEvent = event.eventType.startsWith('payment_')
    const mismatchedKnownScope = event.productId !== null && event.productId !== productId
      || event.planId !== null && event.planId !== planId
    const exactPaymentScope = event.productId === productId && event.planId === planId && event.paymentAmountCents === 4700
    const outOfScope = paymentEvent ? !exactPaymentScope : mismatchedKnownScope

    // Runtime proof mode is safe only for a provider-generated out-of-scope
    // sample. A real exact-scope buyer event fails retryably instead of ever
    // being mislabeled as a fixture.
    if (runtimeProof && !outOfScope) return json({ error: 'runtime_proof_scope_required' }, 503)
    if (!runtimeProof && outOfScope) return json({ received: true, ignored: true })

    const reference = event.metadata.checkout_ref || ''
    let claims = null
    try { claims = claimsForReference(reference) } catch {}
    try {
      await persist(event, { reference, claims, runtimeProof: Boolean(runtimeProof && outOfScope) })
    } catch {
      return json({ error: 'processing_failed' }, 500)
    }
    return json({ received: true })
  }
}
