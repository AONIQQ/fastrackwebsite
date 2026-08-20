import type { FirstPartyFunnelRow } from '@/lib/first-party-funnel'

const ratio = (value: number | null) => value == null ? '-' : `${(value * 100).toFixed(1)}%`

export function FunnelMeasurementPanel({ rows }: { rows: FirstPartyFunnelRow[] }) {
  return (
    <section aria-labelledby="funnel-measurement-heading" className="rounded-lg border-2 border-[#605dba] bg-white p-4 md:p-6 mb-8">
      <h2 id="funnel-measurement-heading" className="text-xl font-black text-[#080b53]">First-party calculator funnel</h2>
      <p className="text-sm text-[#605dba] mb-4">Aggregate, session-deduplicated stages. QA is labeled and excluded from business conclusions.</p>
      {(['7d', '30d'] as const).map((window) => (
        <div key={window} className="mb-5 last:mb-0">
          <h3 className="font-bold mb-2">Last {window === '7d' ? '7' : '30'} days</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr><th className="text-left p-1">Class</th><th className="text-left p-1">Source / campaign / placement</th><th className="text-right p-1">Intent</th><th className="text-right p-1">Modal</th><th className="text-right p-1">Attempt</th><th className="text-right p-1">Captured</th><th className="text-right p-1">Failed</th><th className="text-right p-1">Captured / intent</th><th className="text-right p-1">Captured / attempt</th></tr></thead>
              <tbody>
                {rows.filter((row) => row.window === window).map((row) => <tr key={`${row.traffic_class}-${row.source}-${row.medium}-${row.campaign}-${row.content ?? 'none'}`} className="border-t border-[#e0e0f0]"><td className="p-1 font-bold">{row.traffic_class}</td><td className="p-1">{row.source} / {row.medium} / {row.campaign} / {row.content ?? '-'}</td><td className="p-1 text-right">{row.intent}</td><td className="p-1 text-right">{row.modal_opened}</td><td className="p-1 text-right">{row.submission_attempted}</td><td className="p-1 text-right">{row.lead_captured}</td><td className="p-1 text-right">{row.capture_failed}</td><td className="p-1 text-right">{ratio(row.captured_per_intent)}</td><td className="p-1 text-right">{ratio(row.captured_per_attempt)}</td></tr>)}
                {rows.every((row) => row.window !== window) && <tr><td colSpan={9} className="p-3 text-center text-[#605dba]">No measured sessions yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  )
}
