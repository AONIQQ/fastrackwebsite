import Image from 'next/image'
import Link from 'next/link'
import { isCheckoutTokenShape } from '@/lib/checkout-url.mjs'
import { GuideCheckoutButton } from './GuideCheckoutButton'

const WHOP_CHECKOUT_URL = 'https://whop.com/checkout/4DXyLzCDqEtib03t4d-fKRL-ukfw-a2np-khb2B9MVaq84/'

const topics = [
  {
    title: 'Ways students can earn college credit',
    body: 'An introduction to dual credit, AP, IB, CLEP, community-college courses, and summer terms.',
  },
  {
    title: 'Transfer-policy research',
    body: 'Questions to ask colleges, places to look for published policies, and a method for tracking how a course may apply.',
  },
  {
    title: 'Schedule planning',
    body: 'A framework for organizing possible courses by term while accounting for workload and prerequisites.',
  },
  {
    title: 'Funding research',
    body: 'Starting points for researching state, local, and university funding and scholarship rules.',
  },
  {
    title: 'Implementation checklist',
    body: 'A checklist for documenting sources, contacting advisors, and recording answers before enrollment.',
  },
]

export default function Guide({ searchParams }: { searchParams: { checkout_ref?: string } }) {
  const checkoutRef = isCheckoutTokenShape(searchParams.checkout_ref) ? searchParams.checkout_ref! : null
  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      <header className="bg-[#080b53] shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center">
            <Image src="/logo.png" alt="Fastrack logo" width={160} height={160} className="rounded-full object-cover" />
          </Link>
          <Link href="/calculator" className="text-sm font-semibold text-white/80 hover:text-white">
            Free calculator
          </Link>
        </div>
      </header>

      <main>
        <section className="bg-white">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 md:py-24 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#605dba]">Fastrack Guide ($47)</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#080b53] sm:text-5xl">
              A starting framework for researching dual credit and college-course options
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-gray-700">
              The guide organizes the questions, sources, and planning steps families can use when exploring college
              credit during high school. It is educational material, not a personalized course map or a promised
              graduation, transfer, savings, or admission result.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-gray-600">
              Policies and course applicability vary by state, school, major, and catalog year. Confirm every course
              with the high school, credit-granting institution, and receiving college before enrollment.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-semibold text-[#080b53]">Topics covered</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {topics.map((topic) => (
                <article key={topic.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-xl font-semibold text-[#080b53]">{topic.title}</h3>
                  <p className="mt-3 leading-relaxed text-gray-700">{topic.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="mx-auto max-w-3xl space-y-5 px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl font-semibold text-[#080b53]">Before you use the guide</h2>
            <p className="leading-relaxed text-gray-700">
              Published transfer tables and catalogs can be incomplete, interpreted differently, or changed after
              publication. A course that transfers may still apply only as an elective. Residency, prerequisites,
              sequencing, course availability, financial aid, and degree changes can also affect the outcome.
            </p>
            <p className="leading-relaxed text-gray-700">
              Use the guide to structure your research and record answers. Get written confirmation from the relevant
              institutions for the student&rsquo;s exact program and catalog year.
            </p>
          </div>
        </section>

        <section className="bg-[#080b53] py-16 text-white">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-semibold">Review the guide for $47</h2>
            <p className="mx-auto mt-4 max-w-2xl text-blue-100">
              The Whop checkout is for the Fastrack Guide. The price remains $47.
            </p>
            <GuideCheckoutButton checkoutRef={checkoutRef} fallbackUrl={WHOP_CHECKOUT_URL} />
          </div>
        </section>
      </main>
    </div>
  )
}
