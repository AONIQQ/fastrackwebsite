import type { FirstPartyFunnelRow } from '@/lib/first-party-funnel'
import { alexisCreatorVideoLabel } from '@/lib/alexis-creator.mjs'

type SaleRow = {
  provider: 'stripe' | 'whop'
  source: string
  medium: string
  campaign: string
  content: string | null
  sales: number
  net_cents: number
}

export function AlexisCreatorPanel({ rows, sales }: { rows: FirstPartyFunnelRow[]; sales: SaleRow[] }) {
  const creatorRows = rows.filter((row) => row.window === '30d' && row.traffic_class === 'business' && ['instagram', 'tiktok', 'facebook', 'youtube'].includes(row.source) && alexisCreatorVideoLabel(row.content))
  const keys = new Map<string, { source: string; campaign: string; content: string }>()
  const rowsByKey = new Map<string, FirstPartyFunnelRow>()
  const salesByKey = new Map<string, SaleRow[]>()
  for (const row of creatorRows) {
    const id = `${row.source}:${row.campaign}:${row.content}`
    keys.set(id, { source: row.source, campaign: row.campaign, content: row.content! })
    rowsByKey.set(id, row)
  }
  for (const sale of sales) if (['instagram', 'tiktok', 'facebook', 'youtube'].includes(sale.source) && alexisCreatorVideoLabel(sale.content)) {
    const id = `${sale.source}:${sale.campaign}:${sale.content}`
    keys.set(id, { source: sale.source, campaign: sale.campaign, content: sale.content! })
    salesByKey.set(id, [...(salesByKey.get(id) ?? []), sale])
  }

  return (
    <section aria-labelledby="alexis-creator-heading" className="mb-8 rounded-lg border-2 border-[#605dba] bg-white p-4 md:p-6">
      <h2 id="alexis-creator-heading" className="text-xl font-black text-[#080b53]">Alexis video to revenue</h2>
      <p className="mb-4 text-sm text-[#605dba]">Last 30 days of first-party calculator activity, plus all-time paid sales linked to the same bounded video ID. Stripe is the $497 Credit Map and Whop is the $47 guide.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr><th className="p-1 text-left">Platform / video</th><th className="p-1 text-right">Intent</th><th className="p-1 text-right">Modal</th><th className="p-1 text-right">Attempt</th><th className="p-1 text-right">Leads</th><th className="p-1 text-right">$47 sales</th><th className="p-1 text-right">$497 sales</th><th className="p-1 text-right">Net revenue</th></tr></thead>
          <tbody>
            {Array.from(keys.values()).map((key) => {
              const id = `${key.source}:${key.campaign}:${key.content}`
              const row = rowsByKey.get(id)
              const matchingSales = salesByKey.get(id) ?? []
              const guide = matchingSales.filter((sale) => sale.provider === 'whop').reduce((sum, sale) => sum + sale.sales, 0)
              const creditMap = matchingSales.filter((sale) => sale.provider === 'stripe').reduce((sum, sale) => sum + sale.sales, 0)
              const net = matchingSales.reduce((sum, sale) => sum + sale.net_cents, 0)
              return <tr key={`${key.source}:${key.campaign}:${key.content}`} className="border-t border-[#e0e0f0]"><td className="p-1"><span className="font-bold capitalize">{key.source}</span> / {key.content.toUpperCase()}<span className="block text-slate-500">{alexisCreatorVideoLabel(key.content)}</span></td><td className="p-1 text-right">{row?.intent ?? 0}</td><td className="p-1 text-right">{row?.modal_opened ?? 0}</td><td className="p-1 text-right">{row?.submission_attempted ?? 0}</td><td className="p-1 text-right font-bold">{row?.lead_captured ?? 0}</td><td className="p-1 text-right">{guide}</td><td className="p-1 text-right">{creditMap}</td><td className="p-1 text-right font-bold">${(net / 100).toLocaleString()}</td></tr>
            })}
            {keys.size === 0 && <tr><td colSpan={8} className="p-4 text-center text-[#605dba]">No measured Alexis video traffic yet. Publish with a platform-specific profile or direct video link below.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
