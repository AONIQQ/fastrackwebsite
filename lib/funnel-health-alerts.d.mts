export type FunnelAlertIssue = Readonly<{
  code: string
  level: 'WARNING' | 'CRITICAL'
  count: number
  age_hours?: number | null
  status?: string
}>

export function actionableFunnelIssues(report: unknown): readonly FunnelAlertIssue[]
export function issueFingerprint(issues: readonly FunnelAlertIssue[]): string | null
export function buildOwnerAlert(kind: 'alert' | 'recovery', issues: readonly FunnelAlertIssue[], generatedAt: string): Readonly<{ subject: string; text: string }>
export function assertOwnerAlertPrivacy<T>(message: T): T
export function runFunnelHealthAlert(dependencies: {
  report: () => Promise<unknown>
  claim: (fingerprint: string | null, messages: { alert: { subject: string; text: string }; recovery: { subject: string; text: string } }) => Promise<null | { token: string; kind: 'alert' | 'recovery'; idempotencyKey: string; message: { subject: string; text: string } }>
  send: (message: { subject: string; text: string; idempotencyKey: string }) => Promise<unknown>
  complete: (token: string) => Promise<unknown>
  release: (token: string) => Promise<unknown>
}): Promise<Readonly<{ ok: boolean; sent: boolean; kind?: 'alert' | 'recovery'; actionable: number; failure?: string }>>
