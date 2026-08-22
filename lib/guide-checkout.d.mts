export const GUIDE_CHECKOUT_CLAIM_SQL: string
export const GUIDE_CHECKOUT_COMPLETE_SQL: string
export const GUIDE_CHECKOUT_RELEASE_SQL: string
export function whopCheckoutConfiguration(value: unknown, expectedPlanId: string, expectedReference: string): { id: string; purchaseUrl: string } | null
export function whopCheckoutListMatch(value: unknown, expectedPlanId: string, expectedReference: string): { id: string; purchaseUrl: string } | null
export function findOrCreateWhopGuideCheckout(input: { apiKey: string; companyId: string; planId: string; reference: string; fetchImpl?: typeof fetch }): Promise<{ id: string; purchaseUrl: string }>
