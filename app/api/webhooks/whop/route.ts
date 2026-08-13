import { sql } from '@/lib/db'
import { attributionSecret, verifyCheckoutToken } from '@/lib/attribution-tokens.mjs'
import { createWhopPost } from '@/lib/whop-webhook.mjs'
import { persistWhopEvent } from '@/lib/whop-store.mjs'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const handler = createWhopPost({
    secret: process.env.WHOP_WEBHOOK_SECRET,
    companyId: process.env.WHOP_COMPANY_ID,
    productId: process.env.WHOP_PRODUCT_ID,
    planId: process.env.WHOP_PLAN_ID,
    claimsForReference: (reference: string) => reference
      ? verifyCheckoutToken(reference, attributionSecret())
      : null,
    runtimeProof: process.env.WHOP_RUNTIME_PROOF_MODE === '1',
    persist: (event: Record<string, unknown>, context: Record<string, unknown>) => persistWhopEvent(sql, event, context),
  })
  return handler(request)
}
