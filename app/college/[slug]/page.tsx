import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import SiteFooter from '@/components/SiteFooter'
import StructuredData from '@/components/StructuredData'
import { getCollegeById } from '@/lib/db'
import { STATE_NAMES, stateDirectoryHref } from '@/lib/states'
import { withAttributionQuery } from '@/lib/attribution-url.mjs'
import { collegeSeoMetadata, collegeSeoOpening } from '@/lib/college-seo-experiment.mjs'
import { collegeDefaultMetadata } from '@/lib/college-default-metadata.mjs'
import { collegeBreadcrumbData } from '@/lib/structured-data.mjs'

// ISR: rendered on first request, cached for a week. The underlying federal
// data refreshes rarely, and there are ~5,000 of these pages.
export const revalidate = 604800

function idFromSlug(slug: string): number | null {
  const id = Number.parseInt(slug.split('-')[0] ?? '', 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

const fmt = (n: number | null) => (n == null ? null : `$${Math.round(n).toLocaleString('en-US')}`)

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const id = idFromSlug(params.slug)
  if (!id) return {}
  const c = await getCollegeById(id)
  if (!c) return {}
  const experiment = collegeSeoMetadata(c)
  if (experiment) {
    return {
      title: experiment.title,
      description: experiment.description,
      alternates: { canonical: experiment.canonicalPath },
    }
  }
  return collegeDefaultMetadata(c)
}

export default async function CollegePage({ params, searchParams }: { params: { slug: string }, searchParams: Record<string, string | string[] | undefined> }) {
  const id = idFromSlug(params.slug)
  if (!id) notFound()
  const c = await getCollegeById(id)
  if (!c) notFound()

  const stateName = STATE_NAMES[c.state] ?? c.state
  const stateHref = stateDirectoryHref(c.state)
  const breadcrumbData = collegeBreadcrumbData({ collegeName: c.name, stateName, statePath: stateHref })
  const experiment = collegeSeoOpening(c)
  const calcHref = `/calculator?state=${c.state}&residency=inState&collegeId=${c.id}`
  const trackedCalcHref = withAttributionQuery(calcHref, searchParams)
  const creditMapHref = withAttributionQuery('/credit-map', searchParams)
  const rows: [string, string | null][] = [
    ['Average net price per year for federal-aid recipients', fmt(c.net_price)],
    ['Published in-state tuition', fmt(c.tuition_in)],
    ['Published out-of-state tuition', fmt(c.tuition_out)],
    ['Median earnings 6 years after entry', fmt(c.earnings_6yr)],
    ['Median earnings 10 years after entry', fmt(c.earnings_10yr)],
  ]

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 text-gray-900">
      <StructuredData data={breadcrumbData} />
      <header className="bg-[#080b53] text-white p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="Fastrack Logo" width={180} height={180} className="rounded-full" />
          </Link>
          <nav className="hidden md:flex items-center space-x-6 text-base">
            <Link href="/calculator" className="hover:text-blue-200">Calculator</Link>
            <Link href="/credit-map" className="hover:text-blue-200">Credit Map</Link>
            <Link href="/savings" className="hover:text-blue-200">By State</Link>
          </nav>
        </div>
      </header>

      <main className="pb-20">
        <section className="bg-[#080b53] text-white">
          <div className="container mx-auto px-4 py-14 text-center">
            <p className="uppercase text-sm tracking-wider text-blue-200">
              {stateHref ? (
                <Link href={stateHref} className="hover:underline">{stateName}</Link>
              ) : stateName}{' '}
              &middot; College Costs
            </p>
            <h1 className="mx-auto mt-4 max-w-3xl text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
              {experiment?.heading ?? `College Scorecard cost data for ${c.name}`}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-blue-100">
              {experiment?.answer ?? (c.net_price
                ? `The College Scorecard reports an average net price of about ${fmt(c.net_price)} per year at ${c.name} for federal-aid recipients. It is not your family’s personalized aid offer. The calculator compares that figure with a modeled dual-credit scenario.`
                : `Here is the available cost picture for ${c.name}, plus a modeled dual-credit scenario.`)}
            </p>
            <div className="mt-8">
              <Link
                href={trackedCalcHref}
                className="inline-block rounded-lg bg-white px-8 py-4 text-lg font-semibold text-[#080b53] hover:bg-blue-100"
              >
                {experiment?.calculatorCta ?? <>Model your family&rsquo;s costs at {c.name.length > 30 ? 'this school' : c.name}</>}
              </Link>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-14 text-center">
          <h2 className="text-3xl font-semibold">The numbers</h2>
          <p className="mx-auto mt-3 max-w-3xl text-gray-700">
            College Scorecard net price is an average for federal-aid recipients after grant and scholarship aid, not a
            personalized estimate of what your family will pay or the aid offer it will receive.
          </p>
          <div className="mx-auto mt-8 max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm md:text-base">
              <tbody>
                {rows
                  .filter(([, v]) => v != null)
                  .map(([label, value]) => (
                    <tr key={label} className="border-t border-gray-100 first:border-t-0">
                      <td className="px-4 py-3 text-left text-gray-700">{label}</td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">{value}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white py-14">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-semibold">How dual credit changes this math</h2>
            <p className="mx-auto mt-4 max-w-3xl text-gray-700">
              Students in most states can earn college credit during high school through dual enrollment, AP, and CLEP,
              sometimes at a lower price than university enrollment. A course can transfer but still satisfy only an
              elective, or be denied when it does not fit the receiving college&rsquo;s degree requirements.
            </p>
            <p className="mx-auto mt-4 max-w-3xl text-gray-700">
              The calculator is a modeled scenario, not a promised result. Residency, course sequencing, catalog timing,
              and the receiving college&rsquo;s final decisions can prevent the modeled reduction. The Credit Map uses
              published sources and flags what still needs confirmation; it does not bind {c.name}.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              <Link
                href={trackedCalcHref}
                className="inline-block rounded-lg bg-[#605dba] px-6 py-3 text-center font-semibold text-white hover:bg-[#4e4a9e]"
              >
                Run the numbers free
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

        <section className="container mx-auto px-4 py-14 text-center">
          <p className="text-gray-600">
            See costs for more schools in{' '}
            {stateHref ? (
              <Link href={stateHref} className="font-semibold text-[#605dba] hover:underline">
                {stateName}
              </Link>
            ) : stateName}{' '}
            or{' '}
            <Link href="/savings" className="font-semibold text-[#605dba] hover:underline">
              browse every state
            </Link>
            .
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
