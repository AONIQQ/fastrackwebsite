'use client'

import { track } from '@vercel/analytics'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import SiteFooter from '@/components/SiteFooter'
import { Check } from 'lucide-react'
import { withCheckoutReference } from '@/lib/checkout-url.mjs'

const CHECKOUT_URL = process.env.NEXT_PUBLIC_CREDIT_MAP_CHECKOUT_URL

function checkoutHref(): string {
  if (!CHECKOUT_URL) return ''
  if (typeof window === 'undefined') return CHECKOUT_URL
  const p = new URLSearchParams(window.location.search)
  const leadRef = p.get('lead_ref')
  if (leadRef && /^lead-\d+-(?:results|n[1-4])$/.test(leadRef)) {
    return withCheckoutReference(CHECKOUT_URL, leadRef)
  }
  const src = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', 'fbclid']
    .map((k) => (p.get(k) ? `${k}:${p.get(k)}` : null))
    .filter(Boolean)
    .join('|')
    .slice(0, 190)
  return withCheckoutReference(CHECKOUT_URL, src)
}

const deliverables = [
  'A term-by-term schedule from now through college graduation, with real course codes from your community college and target university',
  'Each proposed course mapped to the high school and degree requirement it may satisfy, with confirmation items where applicability is unresolved',
  'A source link and retrieval date on every verified transfer line, so you can check our work',
  'Anything we could not verify is flagged as an open question with the exact step to resolve it, never papered over',
  'A one-page "Confirm These Four Things" checklist for your school district and target college',
  'Delivered as a spreadsheet plus a PDF summary within 7 business days. No calls required.',
]

const guarantees = [
  {
    title: '30-day refund, no questions asked',
    body: 'If you are not satisfied for any reason within 30 days of delivery, we refund the full price.',
  },
  {
    title: 'Every verified line is sourced',
    body: 'Each transfer equivalency we mark as verified includes the source URL and the date we checked it.',
  },
  {
    title: 'We tell you what we don’t know',
    body: 'Transfer rules have gray areas. We name every open question we could not resolve instead of guessing. An honest gap beats a confident error.',
  },
]

export default function CreditMap() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-100 text-gray-900">
      <header className="bg-[#080b53] text-white p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="Fastrack Logo" width={180} height={180} className="rounded-full" />
          </Link>
          <nav className="hidden md:flex items-center space-x-4">
            <Link href="/calculator">
              <Button variant="ghost" className="text-white text-base">
                Calculator
              </Button>
            </Link>
            <Link href="/">
              <Button variant="ghost" className="text-white text-base">
                Home
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="pb-20">
        <section className="bg-[#080b53] text-white">
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="uppercase text-sm tracking-wider text-blue-200">The Fastrack Credit Map</p>
              <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
                A sourced, done-for-you dual credit plan with open questions clearly flagged
              </h1>
              <p className="mt-6 text-lg text-blue-100">
                Roughly 1 in 7 dual-enrollment courses gets denied at transfer, usually because it doesn&rsquo;t fit the
                student&rsquo;s degree. We build your student&rsquo;s complete course-by-course plan against the real
                catalogs, transfer agreements, and degree requirements. We identify what the sources support and what
                the family still needs to confirm with the receiving college before enrollment.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
                {CHECKOUT_URL ? (
                  <a href={checkoutHref()} onClick={() => track('Checkout Click')}>
                    <Button className="bg-white text-[#080b53] hover:bg-blue-100 font-semibold px-8 py-6 text-lg">
                      Get Your Credit Map ($497)
                    </Button>
                  </a>
                ) : <Button disabled className="px-8 py-6 text-lg">Checkout unavailable</Button>}
              </div>
              <p className="mt-4 text-sm text-blue-200">
                For 11th and 12th graders (including homeschool). Currently serving select state and college pathways.
                If the selected pathway is not one we can currently serve, we will say so rather than guess.
              </p>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <h2 className="text-center text-3xl md:text-4xl font-semibold">What you get</h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {deliverables.map((item) => (
              <li key={item} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <Check className="mt-1 h-5 w-5 flex-shrink-0 text-[#605dba]" />
                <span className="text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-center text-3xl md:text-4xl font-semibold">Our guarantees</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {guarantees.map((g) => (
                <div key={g.title} className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                  <h3 className="text-xl font-semibold text-[#080b53]">{g.title}</h3>
                  <p className="mt-3 text-gray-700">{g.body}</p>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-gray-500">
              Plans are drafted with AI-assisted research and reviewed line-by-line by a human before delivery. Final
              transfer decisions always rest with the receiving college; your plan tells you exactly what to confirm and
              with whom.
            </p>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="rounded-2xl bg-[#080b53] p-10 text-white shadow-xl text-center">
            <h2 className="text-3xl font-semibold">Ready to stop guessing?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-blue-100">
              One plan, built once, that your family can execute without us. If your pathway isn&rsquo;t one we can
              verify yet, we&rsquo;ll say so up front.
            </p>
            <div className="mt-8 flex justify-center">
              {CHECKOUT_URL ? (
                <a href={checkoutHref()} onClick={() => track('Checkout Click')}>
                  <Button className="bg-white text-[#080b53] hover:bg-blue-100 font-semibold px-8 py-6 text-lg">
                    Get Your Credit Map ($497)
                  </Button>
                </a>
              ) : <Button disabled className="px-8 py-6 text-lg">Checkout unavailable</Button>}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
