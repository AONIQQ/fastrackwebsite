export const WHOP_PAYMENT_SQL: string
export const WHOP_EVENT_SQL: string
export const WHOP_RECONCILE_SQL: string
export function persistWhopEvent(db: { query: (query: string, parameters?: unknown[]) => Promise<unknown> }, event: Record<string, unknown>, context: Record<string, unknown>): Promise<void>
