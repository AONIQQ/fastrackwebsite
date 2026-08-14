export const STRIPE_WEBHOOK_URL: string
export const STRIPE_REQUIRED_EVENTS: readonly string[]
export function verifyStripeWebhookRegistration(apiKey: string | undefined, fetchImpl?: typeof fetch, timeoutMs?: number): Promise<'VERIFIED' | 'UNVERIFIED' | 'INVALID'>
