export const BUYER_START_TTL_SECONDS: number
export const CREDIT_MAP_CHECKOUT_COOKIE: string
export const CREDIT_MAP_BUYER_COOKIE: string
export function createBuyerStartToken(checkoutSessionId: string, secret: string, nowSeconds?: number): { token: string; key: string; expiresAt: number }
export function verifyBuyerStartToken(token: unknown, secret: string, nowSeconds?: number): { key: string; expiresAt: number } | null
export function parseCreditMapIntake(input: unknown, currentYear?: number): {
  studentGrade: string
  currentSchoolProgram: string
  graduationYear: number
  state: string
  dualEnrollmentProvider: string
  targetCollege: string
  intendedMajor: string
  currentDualCredit: string
  planningContext: string | null
} | null
