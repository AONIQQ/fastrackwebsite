import type { CreditMapIntakeRow } from '@/lib/credit-map-admin'

const date = (value: string | null) => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York' }) : 'Not submitted'

export function CreditMapIntakePanel({ rows }: { rows: CreditMapIntakeRow[] }) {
  return <section aria-labelledby="credit-map-intakes-heading" className="mb-8 rounded-lg border-2 border-[#605dba] bg-white p-4 md:p-6">
    <h2 id="credit-map-intakes-heading" className="text-2xl font-bold">Credit Map orders</h2>
    <p className="mb-4 text-sm text-[#605dba]">Payment-verified buyer intake. Checkout identifiers and buyer access tokens are never displayed.</p>
    {rows.length === 0 ? <p className="text-sm text-slate-500">No paid Credit Map orders.</p> : <div className="space-y-4">{rows.map((row) => <details key={row.id} className="rounded border border-slate-200 p-3">
      <summary className="cursor-pointer font-semibold">{row.status.replaceAll('_', ' ')} | paid {date(row.paid_at)} | {row.email || 'email unavailable'}</summary>
      <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <div><dt className="font-semibold">Submitted</dt><dd>{date(row.submitted_at)}</dd></div>
        <div><dt className="font-semibold">Student grade</dt><dd>{row.student_grade || 'Pending'}</dd></div>
        <div><dt className="font-semibold">Current school or homeschool program</dt><dd>{row.current_school_program || 'Pending'}</dd></div>
        <div><dt className="font-semibold">Expected graduation year</dt><dd>{row.graduation_year || 'Pending'}</dd></div>
        <div><dt className="font-semibold">State</dt><dd>{row.state || 'Pending'}</dd></div>
        <div><dt className="font-semibold">Dual-enrollment college/provider</dt><dd>{row.dual_enrollment_provider || 'Pending'}</dd></div>
        <div><dt className="font-semibold">Target four-year college/university</dt><dd>{row.target_college || 'Pending'}</dd></div>
        <div><dt className="font-semibold">Intended major</dt><dd>{row.intended_major || 'Pending'}</dd></div>
        <div className="md:col-span-2"><dt className="font-semibold">Current dual-credit courses or credits</dt><dd className="whitespace-pre-wrap">{row.current_dual_credit || 'Pending'}</dd></div>
        {row.planning_context && <div className="md:col-span-2"><dt className="font-semibold">Planning context</dt><dd className="whitespace-pre-wrap">{row.planning_context}</dd></div>}
      </dl>
    </details>)}</div>}
  </section>
}
