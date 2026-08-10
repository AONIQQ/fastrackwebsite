export function parseLeadTouch(reference) {
  const match = /^lead-(\d+)-(results|n[1-4])$/.exec(String(reference || ''))
  return match ? { leadId: Number(match[1]), touchRef: match[2] } : { leadId: null, touchRef: null }
}

export function checkoutPaymentState(type, session) {
  if (type === 'checkout.session.async_payment_succeeded') return 'paid'
  if (type === 'checkout.session.async_payment_failed') return 'failed'
  return session?.payment_status === 'paid' ? 'paid' : 'pending'
}

export function disputeState(type, dispute) {
  if (type === 'charge.dispute.created') return 'open'
  if (type === 'charge.dispute.closed') return dispute?.status === 'won' ? 'won' : dispute?.status === 'lost' ? 'lost' : 'closed'
  return null
}

export function latestDisputeState(events) {
  const unique = [...new Map(events.map((event) => [event.id, event])).values()]
  const byDispute = new Map()
  for (const event of unique) {
    const key = event.objectId || event.id
    const prior = byDispute.get(key)
    const eventClosed = event.type === 'charge.dispute.closed'
    const priorClosed = prior?.type === 'charge.dispute.closed'
    if (!prior || (eventClosed && !priorClosed) || (eventClosed === priorClosed && event.providerCreated > prior.providerCreated)) {
      byDispute.set(key, event)
    }
  }
  const latest = [...byDispute.values()].sort((a, b) => b.providerCreated - a.providerCreated || String(b.id).localeCompare(String(a.id)))[0]
  return latest ? disputeState(latest.type, latest.object) : null
}

export function aggregateCumulativeRefunds(events) {
  const unique = [...new Map(events.map((event) => [event.id, event])).values()]
  const byCharge = new Map()
  for (const event of unique) {
    if (!event.objectId) continue
    const prior = byCharge.get(event.objectId)
    if (!prior || event.providerCreated > prior.providerCreated ||
      (event.providerCreated === prior.providerCreated && String(event.id).localeCompare(String(prior.id)) > 0)) {
      byCharge.set(event.objectId, event)
    }
  }
  return [...byCharge.values()].reduce((total, event) => total + Number(event.amountCents || 0), 0)
}
