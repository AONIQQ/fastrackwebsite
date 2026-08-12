import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import SiteFooter from '@/components/SiteFooter'
import { getCollegesByState, getStateSavingsStats, getTopCollegesForState } from '@/lib/db'
import { STATE_NAMES, codeFromSlug, collegeSlug, stateSlug } from '@/lib/states'
import { withAttributionQuery } from '@/lib/attribution-url.mjs'

// ISR: rendered on first request (the DB is only reachable in the deployed
// environment), then cached for a day.
export const revalidate = 86400

export async function generateMetadata({ params }: { params: { state: string } }): Promise<Metadata> {
  const code = codeFromSlug(params.state)
  if (!code) return {}
  const name = STATE_NAMES[code]
  return {
    title: `Dual Credit in ${name}: A Modeled College-Cost Scenario | Fastrack`,
    description: `Real net-price data for ${name} colleges and a modeled dual-credit cost scenario with transfer and degree-applicability limitations.`,
  }
}

const fmt = (n: number | null) => (n == null ? '-' : `$${n.toLocaleString()}`)

export default async function StateSavingsPage({ params, searchParams }: { params: { state: string }, searchParams: Record<string, string | string[] | undefined> }) {
  const code = codeFromSlug(params.state)
  if (!code) notFound()
  const name = STATE_NAMES[code]
  const [stats, colleges, stateColleges] = await Promise.all([
    getStateSavingsStats(code),
    getTopCollegesForState(code, 20),
    getCollegesByState(code),
  ])
  if (!colleges.length) notFound()
  const featuredIds = new Set(colleges.map((college) => college.id))
  const directoryColleges = stateColleges
    .filter((college) => !featuredIds.has(college.id))
    .sort((a, b) => a.name.localeCompare(b.name) || (a.city ?? '').localeCompare(b.city ?? '') || a.id - b.id)
  const calculatorHref = (collegeId?: number) => withAttributionQuery(
    `/calculator?state=${code}&residency=inState${collegeId ? `&collegeId=${collegeId}` : ''}`,
    searchParams,
  )
  const creditMapHref = withAttributionQuery('/credit-map', searchParams)

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 text-gray-900">
      <header className="bg-[#080b53] text-white p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="Fastrack Logo" width={180} height={180} className="rounded-full" />
          </Link>
          <nav className="hidden md:flex items-center space-x-6 text-base">
            <Link href="/calculator" className="hover:text-blue-200">Calculator</Link>
            <Link href="/credit-map" className="hover:text-blue-200">Credit Map</Link>
          </nav>
        </div>
      </header>

      <main className="pb-20">
        <section className="bg-[#080b53] text-white">
          <div className="container mx-auto px-4 py-16 text-center">
            <p className="uppercase text-sm tracking-wider text-blue-200">Dual Credit Savings by State</p>
            <h1 className="mx-auto mt-4 max-w-3xl text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
              Model a dual-credit cost scenario for your family in {name}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-blue-100">
              {stats?.avg_net_price
                ? `For federal-aid recipients, the College Scorecard average net price at a ${name} college is about ${fmt(stats.avg_net_price)} per year. It is not a family’s personalized aid offer. The calculator compares that figure with a modeled dual-credit scenario.`
                : `Explore college costs in ${name} and compare them with a modeled dual-credit scenario.`}
            </p>
            <div className="mt-8">
              <Link
                href={calculatorHref()}
                className="inline-block rounded-lg bg-white px-8 py-4 text-lg font-semibold text-[#080b53] hover:bg-blue-100"
              >
                Run your student&rsquo;s numbers for free
              </Link>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-14">
          <h2 className="text-center text-3xl font-semibold">College Scorecard cost data in {name}</h2>
          <p className="mx-auto mt-3 max-w-3xl text-center text-gray-700">
            College Scorecard net price is an average for federal-aid recipients after grant and scholarship aid. It is
            not a personalized estimate of what your family will pay or the aid offer it will receive. Pick a school to
            explore the modeled cost scenario.
          </p>
          <div className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="block w-full text-left text-sm md:table md:text-base">
              <thead className="sr-only bg-gray-50 text-gray-600 md:not-sr-only md:table-header-group">
                <tr>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Avg. net price / yr</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group">
                {colleges.map((c) => (
                  <tr key={c.id} className="grid grid-cols-1 gap-1 border-t border-gray-100 p-4 md:table-row md:p-0">
                    <td className="block py-1 font-medium md:table-cell md:px-4 md:py-3">
                      <Link href={`/college/${collegeSlug(c.id, c.name)}`} className="hover:text-[#605dba] hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="block py-1 text-gray-600 md:table-cell md:px-4 md:py-3">{c.city ?? ''}</td>
                    <td className="block py-1 md:table-cell md:px-4 md:py-3">{fmt(c.net_price)}</td>
                    <td className="block pt-2 md:table-cell md:px-4 md:py-3">
                      <Link
                        href={calculatorHref(c.id)}
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[#605dba] px-4 py-2 font-semibold text-[#605dba] hover:underline md:min-h-0 md:w-auto md:justify-start md:rounded-none md:border-0 md:p-0"
                      >
                        Model costs &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {directoryColleges.length > 0 && (
            <details className="mx-auto mt-8 max-w-4xl rounded-xl border border-gray-200 bg-white px-5 py-4">
              <summary className="cursor-pointer font-semibold text-[#080b53] marker:text-[#605dba]">
                Browse {directoryColleges.length} more {name} colleges
              </summary>
              <p className="mt-3 text-sm text-gray-600">
                Choose a college to see its published cost data and continue to the calculator with that school selected.
              </p>
              <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {directoryColleges.map((college) => (
                  <li key={college.id} className="min-w-0">
                    <Link
                      href={`/college/${collegeSlug(college.id, college.name)}`}
                      className="block rounded-md py-1 text-sm font-medium text-[#605dba] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#605dba]"
                    >
                      <span className="break-words">{college.name}</span>
                      {college.city && <span className="block text-xs font-normal text-gray-600">{college.city}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="bg-white py-14">
          <div className="container mx-auto px-4">
            <h2 className="text-center text-3xl font-semibold">The catch nobody tells {name} families</h2>
            <p className="mx-auto mt-4 max-w-3xl text-center text-gray-700">
              Dual enrollment is bigger than ever, over 2.8 million high school students took college courses in
              2023-24. But roughly 1 in 7 dual-enrollment courses is denied when the student transfers, most often
              because the course doesn&rsquo;t fit the degree they end up pursuing.
            </p>
            <p className="mx-auto mt-4 max-w-3xl text-center text-gray-700">
              Published rules can help a family evaluate courses before enrolling, but they do not guarantee acceptance
              or degree applicability. A Fastrack Credit Map cites the sources used and flags questions the family must
              confirm with the school district and receiving college.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              <Link
                href={calculatorHref()}
                className="inline-block rounded-lg bg-[#605dba] px-6 py-3 text-center font-semibold text-white hover:bg-[#4e4a9e]"
              >
                Estimate the cost difference
              </Link>
              <Link
                href={creditMapHref}
                className="inline-block rounded-lg border border-[#605dba] px-6 py-3 text-center font-semibold text-[#605dba] hover:bg-gray-50"
              >
                Get a done-for-you plan
              </Link>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-14">
          <h2 className="text-center text-2xl font-semibold">Other states</h2>
          <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[#605dba]">
            {Object.keys(STATE_NAMES)
              .filter((c) => c !== code)
              .map((c) => (
                <Link key={c} href={`/savings/${stateSlug(c)}`} className="hover:underline">
                  {STATE_NAMES[c]}
                </Link>
              ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
