import {
  ATTRIBUTION_TOKEN_TTL_SECONDS,
  attributionSecret,
  createCheckoutToken,
  createEngagementToken,
} from './attribution-tokens.mjs'
import { withCheckoutReference } from './checkout-url.mjs'

export const SITE = 'https://www.fastrack.school'
export const CREDIT_MAP_CHECKOUT = 'https://buy.stripe.com/6oU28rfH1eqa9g90i21Fe06'

export function messageTrackingLinks(trackingId, step, nowSeconds = Math.floor(Date.now() / 1000), env = process.env) {
  const secret = attributionSecret(env)
  const expiresAt = nowSeconds + ATTRIBUTION_TOKEN_TTL_SECONDS
  const token = (destination) => createEngagementToken({ trackingId, step, destination, expiresAt }, secret, nowSeconds)
  return {
    pixel: `${SITE}/api/t/o?t=${encodeURIComponent(token('open'))}`,
    click(destination) {
      return `${SITE}/api/t/c?t=${encodeURIComponent(token(destination))}`
    },
  }
}

export function destinationForUrl(value) {
  let url
  try { url = new URL(value) } catch { return null }
  if (url.hostname === 'buy.stripe.com') return 'checkout'
  if (!['www.fastrack.school', 'fastrack.school'].includes(url.hostname)) return null
  if (url.pathname === '/credit-map') return 'credit_map'
  if (url.pathname === '/calculator') return 'calculator'
  if (url.pathname === '/') return 'home'
  return null
}

export function resolvedDestination(destination, step, trackingId, expiresAt, secret) {
  if (destination === 'home') return SITE
  if (destination === 'calculator') return `${SITE}/calculator`
  const checkoutToken = createCheckoutToken({ trackingId, step, expiresAt }, secret)
  if (destination === 'checkout') return withCheckoutReference(CREDIT_MAP_CHECKOUT, checkoutToken)
  if (destination === 'credit_map') {
    const url = new URL(`${SITE}/credit-map`)
    url.searchParams.set('utm_source', 'email')
    url.searchParams.set('utm_medium', step === 'results' ? 'results' : 'nurture')
    url.searchParams.set('utm_campaign', step)
    url.searchParams.set('checkout_ref', checkoutToken)
    return url.toString()
  }
  return SITE
}
