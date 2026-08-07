import { listLeads, leadStats } from '@/lib/db'
import { isAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

// Leads are PII. Never let a crawler or a CDN hold onto this page.
export const metadata = { robots: { index: false, follow: false } }

function LoginForm({ error }: { error?: boolean }) {
  return (
    <div className="min-h-screen bg-[#f0f0f8] flex items-center justify-center p-4">
      <form
        action="/api/admin/login"
        method="POST"
        className="bg-white border-2 border-[#605dba] rounded-lg p-6 w-full max-w-sm space-y-4"
      >
        <h1 className="text-xl font-bold text-[#080b53]">Fastrack Leads</h1>
        {error && <p className="text-sm text-red-600">Incorrect token.</p>}
        <input
          type="password"
          name="token"
          placeholder="Admin token"
          autoFocus
          className="w-full border border-[#605dba] rounded px-3 py-2 bg-[#f0f0f8] text-[#080b53]"
        />
        <button type="submit" className="w-full bg-[#605dba] hover:bg-[#080b53] text-white rounded px-4 py-2">
          Sign in
        </button>
      </form>
    </div>
  )
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  if (!isAdmin()) return <LoginForm error={searchParams.error === '1'} />

  const [leads, stats] = await Promise.all([listLeads(1000), leadStats()])

  const tiles = [
    { label: 'Total leads', value: stats.total },
    { label: 'Unique emails', value: stats.unique_emails },
    { label: 'Last 30 days', value: stats.last_30d },
    { label: 'With phone', value: stats.with_phone },
  ]

  return (
    <div className="min-h-screen bg-[#f0f0f8] text-[#080b53] p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold">Leads</h1>
          <a
            href="/api/admin/leads.csv"
            className="bg-[#605dba] hover:bg-[#080b53] text-white rounded px-4 py-2 text-sm"
          >
            Export CSV
          </a>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {tiles.map((t) => (
            <div key={t.label} className="bg-white border-2 border-[#605dba] rounded-lg p-4">
              <p className="text-sm text-[#605dba]">{t.label}</p>
              <p className="text-3xl font-bold">{t.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border-2 border-[#605dba] rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#090b53] text-white">
              <tr>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Phone</th>
                <th className="text-left p-3">State</th>
                <th className="text-left p-3">Residency</th>
                <th className="text-left p-3">College</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t border-[#e0e0f0] hover:bg-[#f7f7fc]">
                  <td className="p-3 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                  <td className="p-3">
                    <a href={`mailto:${l.email}`} className="underline">
                      {l.email}
                    </a>
                  </td>
                  <td className="p-3 whitespace-nowrap">{l.phone || '-'}</td>
                  <td className="p-3">{l.state || '-'}</td>
                  <td className="p-3">
                    {l.residency === 'inState' ? 'In state' : l.residency === 'outOfState' ? 'Out of state' : '-'}
                  </td>
                  <td className="p-3">{l.college || '-'}</td>
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[#605dba]">
                    No leads yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-[#605dba] mt-4">
          Showing the most recent {leads.length.toLocaleString()} of {stats.total.toLocaleString()}.
        </p>
      </div>
    </div>
  )
}
