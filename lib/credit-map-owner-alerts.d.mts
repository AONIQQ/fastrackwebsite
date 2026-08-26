export type CreditMapOwnerAlertMessage = Readonly<{ subject: string; text: string }>
export type CreditMapOwnerAlertClaim = Readonly<{
  token: string
  idempotencyKey: string
  message: CreditMapOwnerAlertMessage
}>
export function creditMapOwnerMessage(): CreditMapOwnerAlertMessage
export function assertCreditMapOwnerMessagePrivacy(message: CreditMapOwnerAlertMessage): CreditMapOwnerAlertMessage
export function runCreditMapOwnerAlerts(dependencies: {
  claim: (message: CreditMapOwnerAlertMessage) => Promise<CreditMapOwnerAlertClaim | null>
  complete: (token: string, providerMessageId: string) => Promise<unknown>
  release: (token: string) => Promise<unknown>
  send: (message: CreditMapOwnerAlertMessage & { idempotencyKey: string }) => Promise<{ messageId: string | null }>
}, limit?: number): Promise<Readonly<{ ok: boolean; sent: number; failure?: string }>>
