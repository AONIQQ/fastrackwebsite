import type { FunnelHealthReport, HealthLevel } from '@/lib/funnel-health'

const levelStyle: Record<HealthLevel, string> = {
  READY: 'border-emerald-700 bg-emerald-50 text-emerald-950',
  WARNING: 'border-amber-600 bg-amber-50 text-amber-950',
  CRITICAL: 'border-red-700 bg-red-50 text-red-950',
}

const value = (input: unknown) => typeof input === 'number' ? input.toLocaleString() : String(input ?? 'none')
const money = (cents: unknown) => `$${(Number(cents ?? 0) / 100).toLocaleString()}`

export function FunnelHealthPanel({ report }: { report: FunnelHealthReport }) {
  const status = report.status as HealthLevel
  const components = report.component_status as Record<string, HealthLevel>
  const controls = report.rollout.controls
  const stripe = report.stripe.ledger as Record<string, number>
  const whop = report.whop.ledger as Record<string, number>

  return (
    <section aria-labelledby="funnel-health-heading" className={`border-4 rounded-lg p-4 md:p-6 mb-8 ${levelStyle[status]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">Customer funnel health</p>
          <h2 id="funnel-health-heading" className="text-3xl font-black">{status}</h2>
          <p className="text-sm">Checked {new Date(report.generated_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Subsystem status">
          {Object.entries(components).map(([name, level]) => (
            <span key={name} className={`rounded border-2 px-2 py-1 text-xs font-bold ${levelStyle[level]}`}>{name.replaceAll('_', ' ')}: {level}</span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded border-2 border-current bg-white/70 p-4">
          <h3 className="font-bold mb-2">Capture and controls</h3>
          <p className="text-sm">Acknowledgement: <strong>{report.capture.acknowledgement_effective ? 'effective' : 'OFF'}</strong></p>
          <p className="text-sm">24h: {value(report.capture.attempts_24h)} attempts, {value(report.capture.accepted_24h)} accepted, {value(report.capture.rejected_24h)} rejected</p>
          <p className="text-sm">Persistence uncertain: <strong>{value(report.capture.persistence_uncertain_24h)}</strong></p>
          <p className="text-sm">SMS: <strong>{report.sms.enabled ? 'ON' : 'off'}</strong> ({report.sms.configuration})</p>
          <div className="mt-3 grid grid-cols-2 gap-x-3 text-xs">
            {Object.entries(controls).map(([name, control]) => (
              <p key={name}>{name}: <strong>{control.effective ? 'on' : 'OFF'}</strong> / {control.configuration}</p>
            ))}
          </div>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-bold">Capture reason aggregates</summary>
            {report.capture.events_24h.length === 0 ? <p>No capture events in 24h.</p> : report.capture.events_24h.map((row) => (
              <p key={`${row.event_type}-${row.reason_code}`}>{row.event_type} / {row.reason_code}: <strong>{row.count}</strong></p>
            ))}
          </details>
        </div>

        <div className="rounded border-2 border-current bg-white/70 p-4">
          <h3 className="font-bold mb-2">Cron, queues, and delivery</h3>
          <p className="text-sm">Nurture schedule: <strong>{report.nurture_cron.schedule_utc}</strong> (four daytime ET runs)</p>
          <p className="text-sm">Latest attempt: <strong>{report.nurture_cron.latest?.started_at ? new Date(String(report.nurture_cron.latest.started_at)).toLocaleString() : 'never'}</strong></p>
          <p className="text-sm">Freshness: {report.nurture_cron.freshness_hours == null ? 'unknown' : `${Number(report.nurture_cron.freshness_hours).toFixed(1)}h`}</p>
          <p className="text-sm">Newest success: {report.nurture_cron.latest_successful?.completed_at ? new Date(String(report.nurture_cron.latest_successful.completed_at)).toLocaleString() : 'none'}</p>
          <p className="text-sm">Newest failure: {report.nurture_cron.latest_failed?.started_at ? new Date(String(report.nurture_cron.latest_failed.started_at)).toLocaleString() : 'none recorded'}</p>
          <p className="text-sm">Leases: {value(report.leases.active)} active, <strong>{value(report.leases.expired)} expired</strong></p>
          <p className="text-sm">Results: {value(report.messages.results.due)} due, {value(report.messages.results.retryable)} retryable, {value(report.messages.results.terminal_failed)} terminal failures</p>
          <p className="text-sm">Nurture: {value(report.messages.nurture.due)} due, {value(report.messages.nurture.retryable)} retryable, {value(report.messages.nurture.terminal_failed)} terminal failures</p>
          <p className="text-sm">Eligible without nurture row: <strong>{value(report.nurture_eligibility.missing_due)}</strong>{report.nurture_eligibility.oldest_due_at ? `, oldest eligible ${new Date(report.nurture_eligibility.oldest_due_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET` : ''}</p>
          <p className="text-sm">Resend: {value(report.resend.stored)} stored, {value(report.resend.unmatched)} unmatched ({value(report.resend.unmatched_24h)} in 24h), <strong>{value(report.resend.projection_pending)} projection backlog</strong></p>
          <p className="text-sm">7d provider: {value(report.resend.failed_7d)} failed, {value(report.resend.bounced_7d)} bounced, {value(report.resend.complained_7d)} complained</p>
        </div>

        <div className="rounded border-2 border-current bg-white/70 p-4">
          <h3 className="font-bold mb-2">Payments</h3>
          <p className="text-sm">Stripe webhook: <strong>{report.stripe.webhook.registration_status}</strong></p>
          <p className="text-xs">Six-event fixed contract, last provider-verified Aug 13, 2026</p>
          <p className="text-sm mt-2">Paid sales: {value(stripe.paid_sales)}</p>
          <p className="text-sm">Gross: {money(stripe.gross_cents)} | refunds: {money(stripe.refunded_cents)} | net: <strong>{money(stripe.net_cents)}</strong></p>
          <p className="text-sm">Refunded sales: {value(stripe.refunded_sales)} | disputes: {value(stripe.open_disputes)} open, {value(stripe.lost_disputes)} lost</p>
          <div className={`mt-3 rounded border-2 p-2 ${report.whop.status === 'INSTRUMENTED' ? 'border-emerald-700 bg-emerald-50 text-emerald-950' : 'border-amber-600 bg-amber-50 text-amber-950'}`}>
            <p className="font-bold">Whop: {report.whop.status}</p>
            <p className="text-xs">Signed six-event contract. Runtime status: {report.whop.webhook.registration_status}.</p>
            <p className="text-xs">Runtime proof mode: {report.whop.webhook.runtime_proof_mode ? 'ON (not customer-ready)' : 'off'}.</p>
            <p className="text-xs">Events: {value(whop.stored)} stored, {value(whop.received_24h)} in 24h, {value(whop.projection_pending)} pending.</p>
            <p className="text-xs">Paid sales: {value(whop.paid_sales)} | gross: {money(whop.gross_cents)} | refunds: {money(whop.refunded_cents)} | net: {money(whop.net_cents)}</p>
          </div>
        </div>
      </div>

      <details className="mt-4 rounded border border-current bg-white/70 p-3">
        <summary className="cursor-pointer font-bold">Queue age detail ({report.queues.reduce((sum, row) => sum + row.count, 0)} ordinary messages)</summary>
        {report.queues.length === 0 ? <p className="text-sm mt-2">No ordinary message rows.</p> : (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs">
              <thead><tr><th className="text-left p-1">Kind</th><th className="text-left p-1">Status</th><th className="text-left p-1">Eligibility</th><th className="text-left p-1">Age</th><th className="text-right p-1">Count</th></tr></thead>
              <tbody>{report.queues.map((row, index) => <tr key={`${row.kind}-${row.status}-${row.eligibility}-${row.age_bucket}-${index}`}><td className="p-1">{row.kind}</td><td className="p-1">{row.status}</td><td className="p-1">{row.eligibility}</td><td className="p-1">{row.age_bucket}</td><td className="p-1 text-right">{row.count}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </details>
    </section>
  )
}
