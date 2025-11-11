'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import CalBookingButton from '@/components/cal/CalBookingButton'
import { Menu, Star, X } from 'lucide-react'

const stats = [
  {
    value: '$70,000+',
    label: 'Average Potential Savings',
    subLabel: 'Based on Education Data Initiative',
  },
  {
    value: '100+',
    label: 'Pleased Customers',
    subLabel: 'Families trusting Fastrack to guide their journey',
  },
]

const faqs = [
  {
    question: "What if I don't know what my major will be yet? What if I change my mind?",
    answer:
      "Though it may help for increased planning and schedule optimization, knowing your major is not required. The program is set up so that changes to your major will have a minimal impact on your timeframe.",
  },
  {
    question: 'My child is in 8th grade, is it too soon to start?',
    answer:
      'Our service is tailored to students in 8th grade or above, as most states allow students to begin taking dual credit courses in their freshman or sophomore year of high school. Getting started early is the best way to plan for college. We can also assist new high school grads and up to sophomores in college with optimizing their college schedules for an early graduation.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We primarily process payments via Stripe (credit card, Klarna, Apple Pay, or Cash App Pay). We can also accept payment via PayPal, wire transfer, or cryptocurrency.',
  },
  {
    question: 'What is the duration of the one-on-one planning service?',
    answer:
      'The program consists of eight sessions, and we maintain an open line of communication through your college graduation. Our goal is to have you in full control of your academic situation, with ongoing support whenever you need it.',
  },
  {
    question: 'How does this work with scholarships?',
    answer:
      'Scholarships allow you to save additional money on college, and you may even be eligible for new scholarships because of your plans to graduate early. We will help you apply for scholarships and ensure you remain eligible.',
  },
  {
    question: 'Do transfer credits make my degree less impressive?',
    answer:
      'No. There is no differentiation on your degree whether all credits are earned at one university or across multiple institutions.',
  },
  {
    question: "What if I don't pass a class? How much more challenging are dual credit courses?",
    answer:
      'Dual credit courses can be more challenging mentally, but from a time and workload standpoint they are often easier or less time consuming. Ultimately, success comes down to attending class and doing the work.',
  },
  {
    question: 'Do I need to live in a major city or near a college to access dual credit courses?',
    answer:
      'Not at all. Dual credit opportunities are available in small towns and online. If you live in a rural area, we help you find options nearby or through virtual programs.',
  },
  {
    question: "My situation is different, but I'm interested. Should I still schedule a call?",
    answer:
      "Yes. We'll talk through your specific needs and be upfront about the best path forward—whether that's with us or another solution.",
  },
  {
    question: 'Money back guarantee?',
    answer:
      "Yes. If we don't save you more than the cost of our service, we'll refund everything you've paid.",
  },
  {
    question: 'Do I have to pay this all at once? Do you offer financing or payment plans?',
    answer:
      'We offer financing through Affirm. Offers are personalized, and many families qualify for 0% interest plans across multiple term lengths.',
  },
  {
    question: 'Why should I pay for this service instead of trying to do it on my own?',
    answer:
      'Optimizing a dual credit plan takes experience. Families routinely save tens of thousands more with our guidance, while also avoiding hours of research and second guessing.',
  },
]

const membershipLogos = [
  { src: '/aera.png', alt: 'AERA logo' },
  { src: '/edrising.png', alt: 'Educators Rising logo' },
  { src: '/nea.png', alt: 'NEA logo' },
  { src: '/pdk.png', alt: 'PDK International logo' },
]

export default function StudentPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

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
            <Link href="/student">
              <Button variant="ghost" className="text-white text-base">
                Student
              </Button>
            </Link>
            <Link href="/guide">
              <Button variant="ghost" className="text-white text-base">
                Guide
              </Button>
            </Link>
            <CalBookingButton variant="ghost" className="text-white text-base">
              Sign Up
            </CalBookingButton>
          </nav>
          <Button variant="ghost" className="md:hidden text-white p-2" onClick={toggleMenu} aria-label="Toggle menu">
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
        {isMenuOpen && (
          <div className="md:hidden mt-4 flex flex-col items-center space-y-2">
            <Link href="/student">
              <Button variant="ghost" className="text-white text-base">
                Student
              </Button>
            </Link>
            <Link href="/guide">
              <Button variant="ghost" className="text-white text-base">
                Guide
              </Button>
            </Link>
            <CalBookingButton variant="ghost" className="text-white text-base">
              Sign Up
            </CalBookingButton>
          </div>
        )}
      </header>

      <main className="space-y-16 pb-20">
        <section className="bg-[#080b53] text-white">
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="max-w-3xl">
              <p className="uppercase text-sm tracking-wider text-blue-200">Dual Credit Planning for Grades 8-11</p>
              <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
                Save two years and $70,000+ on your child&rsquo;s college education
              </h1>
              <p className="mt-6 text-lg text-blue-100">
                We help motivated students earn their bachelor&rsquo;s degree in two years by building optimized high school schedules packed with the right dual credit courses.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <CalBookingButton className="bg-white text-[#080b53] hover:bg-blue-100 font-semibold px-8 py-6 text-lg">
                  Book a Free Planning Session
                </CalBookingButton>
              </div>
            </div>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {stats.map((stat) => (
                <div key={stat.value} className="rounded-xl bg-white/10 p-6 backdrop-blur">
                  <p className="text-3xl font-bold">{stat.value}</p>
                  <p className="mt-2 text-lg font-semibold text-blue-100">{stat.label}</p>
                  <p className="mt-2 text-sm text-blue-200">{stat.subLabel}</p>
                  <div className="mt-4 flex items-center gap-1 text-yellow-300">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={index} className="h-4 w-4" fill="currentColor" />
                    ))}
                  </div>
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
                We make it possible for students in 8th through 11th grade to earn their bachelor&rsquo;s degrees in two years by creating optimized high school schedules that utilize dual credit classes (classes that count for both high school and college credits).
              </p>
              <p className="text-lg text-gray-700">
                By following our methodologies, students and their parents can save an average of $70,000 on education costs and start earning a professional income two years sooner than their peers. We created this service in direct response to the often inadequate and expensive advice offered by consultants and high school counselors, who may not have the most current information.
              </p>
            </div>
            <div className="rounded-2xl bg-white p-8 shadow-lg">
              <div className="flex items-center gap-2 text-yellow-400">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} className="h-5 w-5" fill="currentColor" />
                ))}
              </div>
              <p className="mt-4 text-lg font-semibold">
                Get a personalized schedule designed by experts, outlining every class to take from enrollment through college graduation.
              </p>
              <p className="mt-3 text-gray-600">
                If anything changes, we&rsquo;re by your side and will update your plan accordingly. Purchasing our one-on-one planning service gives you access to advisors who personally saved more than $70,000 by following this system.
              </p>
              <p className="mt-6 text-sm uppercase tracking-wide text-gray-500">
                See what one of our clients has to say about our program below.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white py-16">
          <div className="container mx-auto px-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8 shadow-sm">
              <h3 className="text-2xl font-semibold">Client Success Spotlight</h3>
              <p className="mt-4 text-gray-700">
                Families partner with Fastrack to remove the guesswork from early college planning. During your free planning session we walk through your student&rsquo;s goals, current coursework, and state guidelines so we can map out the fastest and most affordable path to a bachelor&rsquo;s degree.
              </p>
              <p className="mt-4 text-gray-700">
                We tailor every schedule to the student, whether you need to start dual credit in 8th grade or accelerate during high school as a recent graduate.
              </p>
              <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-500">Ready to explore your options?</p>
                <CalBookingButton className="bg-[#605dba] hover:bg-[#4e4a9e] text-white">
                  Book a Free Planning Session
                </CalBookingButton>
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
