'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Menu, X } from 'lucide-react'
import { withAttributionQuery } from '@/lib/attribution-url.mjs'

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
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [offerHref, setOfferHref] = useState('/credit-map')

  useEffect(() => {
    setOfferHref(withAttributionQuery('/credit-map', window.location.search))
  }, [])

  const toggleMenu = () => setIsMenuOpen((prev) => !prev)

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="bg-[#080b53] text-white p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Link href="/">
              <Image src="/logo.png" alt="Fastrack Logo" width={160} height={160} className="rounded-full" />
            </Link>
          </div>
          <nav className="hidden md:flex items-center space-x-4">
            <Link href={offerHref}>
              <Button variant="ghost" className="text-white text-base">
                Credit Map
              </Button>
            </Link>
            <Link href="/calculator">
              <Button variant="ghost" className="text-white text-base">
                Calculator
              </Button>
            </Link>
          </nav>
          <Button variant="ghost" className="md:hidden text-white p-2" onClick={toggleMenu} aria-label="Toggle menu">
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
        {isMenuOpen && (
          <div className="md:hidden mt-4 flex flex-col items-center space-y-2">
            <Link href={offerHref}>
              <Button variant="ghost" className="text-white text-base">
                Credit Map
              </Button>
            </Link>
            <Link href="/calculator">
              <Button variant="ghost" className="text-white text-base">
                Calculator
              </Button>
            </Link>
          </div>
        )}
      </header>

      <main className="space-y-16 pb-20">
        <section className="bg-[#080b53] text-white">
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="max-w-3xl">
              <p className="uppercase text-sm tracking-wider text-blue-200">For 11th and 12th graders</p>
              <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
                A sourced dual-credit plan built around your student&rsquo;s target degree
              </h1>
              <p className="mt-6 text-lg text-blue-100">
                The $497 Fastrack Credit Map is a term-by-term planning document for select pathways. It identifies
                sources, flags open questions, and shows what to confirm before a student enrolls.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Link href={offerHref}>
                  <Button className="bg-white text-[#080b53] hover:bg-blue-100 font-semibold px-8 py-6 text-lg">
                    Explore the Credit Map ($497)
                  </Button>
                </Link>
              </div>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {stats.map((stat) => (
                <div key={stat.value} className="rounded-xl bg-white/10 p-6 backdrop-blur">
                  <p className="text-3xl font-bold">{stat.value}</p>
                  <p className="mt-2 text-lg font-semibold text-blue-100">{stat.label}</p>
                  <p className="mt-2 text-sm text-blue-200">{stat.subLabel}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4">
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
              <p className="mt-4 text-lg font-semibold">
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
          <div className="container mx-auto px-4">
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

        <section className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-semibold text-center">Frequently Asked Questions</h2>
          <p className="mt-4 max-w-3xl text-center text-gray-600 mx-auto">
            We know that planning an accelerated college path comes with questions. Explore the most common topics below, and connect with us if you need more specifics for your family&rsquo;s situation.
          </p>
          <div className="mt-10 grid gap-4">
            {faqs.map((faq) => (
              <details key={faq.question} className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <summary className="cursor-pointer text-lg font-semibold text-gray-900 focus:outline-none group-open:text-[#605dba]">
                  {faq.question}
                </summary>
                <p className="mt-4 text-gray-700">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-semibold">We Are Proud Members Of</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 md:grid-cols-4">
              {membershipLogos.map((logo) => (
                <div key={logo.src} className="flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-6">
                  <Image src={logo.src} alt={logo.alt} width={160} height={80} className="object-contain" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="container mx-auto px-4 pb-20">
          <div className="rounded-2xl bg-[#080b53] p-10 text-white shadow-xl">
            <h2 className="text-3xl md:text-4xl font-semibold">Contact</h2>
            <div className="mt-6 grid gap-6 md:grid-cols-3">
              <div>
                <p className="text-sm uppercase tracking-widest text-blue-200">Address</p>
                <p className="mt-2 text-lg font-semibold">1007 N Orange St</p>
                <p className="text-lg">Wilmington, Delaware</p>
              </div>
              <div>
                <p className="text-sm uppercase tracking-widest text-blue-200">Email</p>
                <a href="mailto:info@fastrack.school" className="mt-2 block text-lg font-semibold text-white underline">
                  info@fastrack.school
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
