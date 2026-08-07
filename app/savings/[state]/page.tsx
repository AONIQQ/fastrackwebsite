import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getStateSavingsStats, getTopCollegesForState } from '@/lib/db'
import { STATE_NAMES, codeFromSlug, collegeSlug, stateSlug } from '@/lib/states'

// ISR: rendered on first request (the DB is only reachable in the deployed
// environment), then cached for a day.
export const revalidate = 86400

export async function generateMetadata({ params }: { params: { state: string } }): Promise<Metadata> {
  const code = codeFromSlug(params.state)
  if (!code) return {}
  const name = STATE_NAMES[code]
  return {
    title: `Dual Credit in ${name}: How Much Can Your Student Save on College? | Fastrack`,
    description: `Real net-price data for ${name} colleges, and how dual enrollment in high school cuts the cost. See what your family could save at every major ${name} school.`,
  }
}

const fmt = (n: number | null) => (n == null ? '-' : `$${n.toLocaleString()}`)

export default async function StateSavingsPage({ params }: { params: { state: string } }) {
  const code = codeFromSlug(params.state)
  if (!code) notFound()
  const name = STATE_NAMES[code]
  const [stats, colleges] = await Promise.all([getStateSavingsStats(code), getTopCollegesForState(code, 20)])
  if (!colleges.length) notFound()

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="bg-[#080b53] text-white p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="Fastrack Logo" width={180} height={180} className="rounded-full" />
          </Link>
          <nav className="hidden md:flex items-center space-x-6 text-base">
            <Link href="/calculator" className="hover:text-blue-200">Calculator</Link>
            <Link href="/credit-map" className="hover:text-blue-200">Credit Map</Link>
            <Link href="/guide" className="hover:text-blue-200">Guide</Link>
          </nav>
        </div>
      </header>

      <main className="pb-20">
        <section className="bg-[#080b53] text-white">
          <div className="container mx-auto px-4 py-16">
            <p className="uppercase text-sm tracking-wider text-blue-200">Dual Credit Savings by State</p>
            <h1 className="mt-4 max-w-3xl text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
              How much can dual credit save your family in {name}?
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-blue-100">
              {stats?.avg_net_price
                ? `The average net price at a ${name} college is about ${fmt(stats.avg_net_price)} per year. Every semester of college credit your student finishes in high school is a semester you don't pay that for.`
                : `Every semester of college credit your student finishes in high school is a semester of tuition, housing, and fees you never pay.`}
            </p>
            <div className="mt-8">
              <Link
                href={`/calculator?state=${code}&residency=inState`}
                className="inline-block rounded-lg bg-white px-8 py-4 text-lg font-semibold text-[#080b53] hover:bg-blue-100"
              >
                Run your student&rsquo;s numbers for free
              </Link>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-14">
          <h2 className="text-3xl font-semibold">What college actually costs in {name}</h2>
          <p className="mt-3 max-w-3xl text-gray-700">
            Net price is what families actually pay per year after average aid, not the sticker price. Data comes from
            the U.S. Department of Education&rsquo;s College Scorecard. Pick a school to see the full savings math for
            your student.
          </p>
          <div className="mt-8 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm md:text-base">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Avg. net price / yr</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {colleges.map((c) => (
                  <tr key={c.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/college/${collegeSlug(c.id, c.name)}`} className="hover:text-[#605dba] hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.city ?? ''}</td>
                    <td className="px-4 py-3">{fmt(c.net_price)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/calculator?state=${code}&residency=inState&collegeId=${c.id}`}
                        className="font-semibold text-[#605dba] hover:underline"
                      >
                        See savings &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white py-14">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-semibold">The catch nobody tells {name} families</h2>
            <p className="mt-4 max-w-3xl text-gray-700">
              Dual enrollment is bigger than ever, over 2.8 million high school students took college courses in
              2023-24. But roughly 1 in 7 dual-enrollment courses is denied when the student transfers, most often
              because the course doesn&rsquo;t fit the degree they end up pursuing. Common courses like College Algebra
              are denied for degree applicability more than half the time at some schools.
            </p>
            <p className="mt-4 max-w-3xl text-gray-700">
              The fix is picking courses against the actual transfer rules of the target college before enrolling.
              That is exactly what a Fastrack Credit Map does.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href={`/calculator?state=${code}&residency=inState`}
                className="inline-block rounded-lg bg-[#605dba] px-6 py-3 text-center font-semibold text-white hover:bg-[#4e4a9e]"
              >
                Estimate your savings
              </Link>
              <Link
                href="/credit-map"
                className="inline-block rounded-lg border border-[#605dba] px-6 py-3 text-center font-semibold text-[#605dba] hover:bg-gray-50"
              >
                Get a done-for-you plan
              </Link>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-14">
          <h2 className="text-2xl font-semibold">Other states</h2>
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[#605dba]">
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
    </div>
  )
}
