export const WHOP_WEBHOOK_EVENTS: readonly string[]
export const WHOP_WEBHOOK_BODY_LIMIT: number
export function cents(value: unknown): number | null
export function boundedMetadata(value: unknown): Record<string, string>
export function disputeState(status: unknown): 'open' | 'won' | 'lost'
export function normalizeWhopEvent(event: unknown): null | {
  eventId: string; eventType: string; objectId: string; paymentId: string
  companyId: string | null; checkoutId: string | null; productId: string | null; planId: string | null
  amountCents: number | null; paymentAmountCents: number | null; currency: string | null
  email: string | null; metadata: Record<string, string>; state: string; providerCreatedAt: string; paidAt: string; lifecycleAt: string
}
export function verifyWhopSignature(rawBody: string | Buffer, headers: Headers, secret: string, nowSeconds?: number): boolean
export function readWhopBody(request: Request, limit?: number): Promise<{ ok: true; body: Buffer } | { ok: false; status: 413 }>
export function sanitizeUtm(value: unknown): string | null
