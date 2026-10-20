'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronDown } from 'lucide-react'
import SiteFooter from '@/components/SiteFooter'
import { withAttributionQuery } from '@/lib/attribution-url.mjs'
import SiteHeader from '@/components/SiteHeader'

const stats = [
  {
    value: '$497',
    label: 'One Credit Map',
    subLabel: 'A spreadsheet and PDF summary, delivered once',
  },
  {
    value: '7',
    label: 'Business Days',
    subLabel: 'The current delivery window',
  },
]

const faqs = [
  {
    question: 'Who is the Credit Map for?',
    answer:
      'It is currently for 11th and 12th graders, including homeschool students, in select state and college pathways.',
  },
  {
    question: 'What does the $497 Credit Map include?',
    answer:
      'It includes one term-by-term plan with real course codes, source links and retrieval dates, a spreadsheet, a PDF summary, and a checklist of items to confirm with the school district and receiving college.',
  },
  {
    question: 'How quickly is it delivered?',
    answer:
      'The plan is delivered within 7 business days. No calls are required.',
  },
  {
    question: 'Does the plan guarantee that a college will accept every credit?',
    answer:
      'No. Fastrack identifies sources and flags unresolved questions, but final transfer and degree-applicability decisions always rest with the receiving college.',
  },
  {
    question: 'What is the refund policy?',
    answer:
      'If you are not satisfied for any reason within 30 days of delivery, Fastrack refunds the full $497 price.',
  },
]

const membershipLogos = [
  { src: '/aera.png', alt: 'AERA logo' },
  { src: '/edrising.png', alt: 'Educators Rising logo' },
  { src: '/nea.png', alt: 'NEA logo' },
  { src: '/pdk.png', alt: 'PDK International logo' },
]

export default function Home() {
  const [offerHref, setOfferHref] = useState('/credit-map')

  useEffect(() => {
    setOfferHref(withAttributionQuery('/credit-map', window.location.search))
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 text-gray-900">
      <SiteHeader />

      <main className="space-y-16">
        <section className="bg-white text-gray-900">
          <div className="mx-auto max-w-6xl px-5 sm:px-6 py-16 md:py-24">
            <div className="max-w-3xl">
              <p className="uppercase text-sm tracking-wider text-[#605dba]">For 11th and 12th graders</p>
              <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-gray-900">
                A sourced dual-credit plan built around your student&rsquo;s target degree
              </h1>
              <p className="mt-6 text-lg text-gray-700">
                The $497 Fastrack Credit Map is a term-by-term planning document for select pathways. It identifies
                sources, flags open questions, and shows what to confirm before a student enrolls.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Link href={offerHref} className="w-full sm:w-auto">
                  <Button className="w-full bg-[#605dba] text-white hover:bg-[#4e4a9e] font-semibold px-8 py-6 text-lg">
                    Explore the Credit Map ($497)
                  </Button>
                </Link>
                <Link href="/calculator" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full border-gray-300 bg-white text-gray-900 hover:bg-gray-50 font-semibold px-8 py-6 text-lg">
                    Try the free cost calculator
                  </Button>
                </Link>
              </div>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {stats.map((stat) => (
                <div key={stat.value} className="rounded-xl border border-gray-200 bg-gray-100 p-6">
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                  <p className="mt-2 text-lg font-semibold text-gray-900">{stat.label}</p>
                  <p className="mt-2 text-sm text-gray-500">{stat.subLabel}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="grid gap-12 md:grid-cols-2 md:items-start">
            <div className="space-y-6">
              <h2 className="text-3xl md:text-4xl font-semibold">About Fastrack</h2>
              <p className="text-lg text-gray-700">
                Fastrack researches the student&rsquo;s target university, degree requirements, transfer sources, and
                available course options to build one plan the family can review and execute.
              </p>
              <p className="text-lg text-gray-700">
                Course applicability is not automatic. The plan includes source links and retrieval dates, identifies
                unresolved questions, and gives the family exact items to confirm. Final transfer decisions always rest
                with the receiving college.
              </p>
            </div>
            <div className="rounded-2xl bg-white p-8 shadow-lg">
              <p className="text-lg font-semibold">
                Get a term-by-term schedule with real course codes, delivered as a spreadsheet and PDF summary within 7 business days.
              </p>
              <p className="mt-3 text-gray-600">
                Anything Fastrack cannot verify is flagged as an open question with the exact next step to resolve it.
              </p>
              <p className="mt-6 text-sm uppercase tracking-wide text-gray-500">
                One plan, delivered once. No calls required.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="mx-auto max-w-6xl px-5 sm:px-6">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8 shadow-sm">
              <h3 className="text-2xl font-semibold">How the Credit Map works</h3>
              <p className="mt-4 text-gray-700">
                Fastrack reviews the student&rsquo;s current coursework, target degree, relevant catalogs, transfer
                agreements, and degree requirements. Verified lines include a source and retrieval date.
              </p>
              <p className="mt-4 text-gray-700">
                Policies can change and sources do not bind a college. The family receives a confirmation checklist for
                the school district and target college, along with every unresolved question Fastrack found.
              </p>
              <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-500">30-day satisfaction refund after delivery.</p>
                <Link href={offerHref}>
                  <Button className="bg-[#605dba] hover:bg-[#4e4a9e] text-white">
                    View the $497 Credit Map
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 sm:px-6">
          <h2 className="text-3xl md:text-4xl font-semibold text-center">Frequently asked questions</h2>
          <p className="mt-4 max-w-3xl text-center text-gray-600 mx-auto">
            Straight answers about eligibility, what the Credit Map includes, delivery, transfer limits, and refunds.
          </p>
          <div className="mx-auto mt-10 grid max-w-4xl gap-3">
            {faqs.map((faq) => (
              <details key={faq.question} className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-gray-900 focus:outline-none group-open:text-[#605dba] [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <ChevronDown className="h-5 w-5 flex-shrink-0 text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-4 text-gray-700">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-white py-12">
          <div className="mx-auto max-w-6xl px-5 sm:px-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-gray-500">Professional memberships</p>
            <div className="mt-8 grid grid-cols-2 items-center gap-8 md:grid-cols-4">
              {membershipLogos.map((logo) => (
                <div key={logo.src} className="flex h-16 items-center justify-center">
                  <Image src={logo.src} alt={logo.alt} width={160} height={64} className="max-h-16 w-auto object-contain" />
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
      <SiteFooter />
    </div>
  )
}
