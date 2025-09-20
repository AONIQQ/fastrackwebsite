'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import CalBookingButton from '@/components/cal/CalBookingButton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Menu, Star, X } from 'lucide-react'

const whopCheckoutLink = 'https://whop.com/fastrack/'
const guideHighlights = [
  'Personalized dual-enrollment scheduling templates tailored for Grades 9-12.',
  'Step-by-step walkthrough for evaluating college partners that honor maximum transfer credits.',
  'Budget worksheets that map out tuition, fees, and savings across multiple pathways.',
  'Communication scripts to align students, parents, and counselors around aggressive acceleration goals.',
  'Access to ongoing Fastrack updates as state policies and articulation agreements evolve.',
]

export default function Guide() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const toggleMenu = () => setIsMenuOpen((prev) => !prev)

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 transition-colors duration-300">
      <header className="bg-[#080b53] text-white p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="Fastrack Logo" width={180} height={180} className="rounded-full" />
          </Link>
          <nav className="hidden md:flex items-center space-x-4">
            <Link href="/">
              <Button variant="ghost" className="text-white text-base">
                Home
              </Button>
            </Link>
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
            <CalBookingButton variant="ghost" className="text-white text-base">
              Contact
            </CalBookingButton>
          </nav>
          <Button
            variant="ghost"
            className="md:hidden text-white p-2"
            onClick={toggleMenu}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
        {isMenuOpen && (
          <div className="md:hidden mt-4 flex flex-col items-center space-y-2">
            <Link href="/">
              <Button variant="ghost" className="text-white text-base">
                Home
              </Button>
            </Link>
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
            <CalBookingButton variant="ghost" className="text-white text-base">
              Contact
            </CalBookingButton>
          </div>
        )}
      </header>

      <main className="space-y-16 pb-20">
        <section className="bg-[#080b53] text-white">
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="max-w-3xl">
              <p className="uppercase tracking-widest text-sm text-blue-200">College Planning Guide</p>
              <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
                Save 2 years and $70,000+ on your child&apos;s college education
              </h1>
              <p className="mt-6 text-base sm:text-lg text-blue-100">
                Our dual-credit roadmap shows families exactly how to compress the typical four-year bachelor&apos;s degree into two, dramatically cutting tuition and living costs while keeping students on track for competitive programs.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Button asChild className="bg-white text-[#080b53] hover:bg-blue-100 font-semibold px-8 py-6 text-lg shadow-lg">
                  <Link href={whopCheckoutLink} target="_blank" rel="noopener noreferrer">
                    Purchase the guide ($10)
                  </Link>
                </Button>
                <Button asChild className="bg-white/15 hover:bg-white/25 text-white font-semibold px-8 py-6 text-lg">
                  <Link href={whopCheckoutLink} target="_blank" rel="noopener noreferrer">
                    Sign Up
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <div className="rounded-3xl bg-white p-8 md:p-12 shadow-lg border border-gray-200">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
              <div className="space-y-6">
                <h2 className="text-3xl sm:text-4xl font-semibold text-[#080b53]">About Fastrack</h2>
                <p className="text-base sm:text-lg text-gray-700">
                  We teach students in 9-12th grades how they can earn their bachelor&apos;s degrees in two years instead of four by utilizing dual credit classes (classes that count for both high school and college credits) and optimized high school course scheduling.
                </p>
                <p className="text-base sm:text-lg text-gray-700">
                  By following our methodologies, students and their parents can save an average of $70,000 on education costs and start earning a professional income two years sooner than their peers. Our expertly crafted step-by-step college planning guide provides all the tools and information necessary to create an optimized schedule independently.
                </p>
                <p className="text-base sm:text-lg text-gray-700">
                  This guide is a direct response to the often inadequate and expensive advice offered by consultants and high school counselors, who may not have the most current information. Click the button above to purchase the guide and start transforming your educational journey today.
                </p>
              </div>
              <Card className="rounded-3xl overflow-hidden bg-white shadow-xl border border-[#d3d5ff]">
                <CardHeader className="bg-[#f1f2ff]">
                  <CardTitle className="text-xl font-semibold text-[#080b53]">
                    What&apos;s included inside the guide
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-gray-700 text-base leading-relaxed">
                  <ul className="list-disc space-y-3 pl-6">
                    {guideHighlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <div className="rounded-3xl bg-white p-8 md:p-12 shadow-lg border border-gray-200">
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="rounded-2xl bg-white shadow-lg border border-[#d3d5ff]">
                <CardContent className="p-8 flex flex-col gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-wide text-[#605dba]">$70,000+</p>
                    <h3 className="text-2xl font-semibold text-[#080b53]">Average Potential Savings</h3>
                    <p className="text-sm text-gray-600">Based on Education Data Initiative</p>
                  </div>
                  <div className="flex items-center text-[#f8b84a]">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={index} className="h-5 w-5 fill-[#f8b84a] text-[#f8b84a]" />
                    ))}
                  </div>
                  <p className="text-base text-gray-700">
                    Families routinely cut two full academic years by implementing our dual-credit roadmap and partnering with colleges that maximize transfer agreements.
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-2xl bg-white shadow-lg border border-[#d3d5ff]">
                <CardContent className="p-8 flex flex-col gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-wide text-[#605dba]">100+</p>
                    <h3 className="text-2xl font-semibold text-[#080b53]">Pleased Customers</h3>
                    <p className="text-sm text-gray-600">Consistent five-star feedback</p>
                  </div>
                  <div className="flex items-center text-[#f8b84a]">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={index} className="h-5 w-5 fill-[#f8b84a] text-[#f8b84a]" />
                    ))}
                  </div>
                  <p className="text-base text-gray-700">
                    Parents and students highlight the clarity of our scheduling tools and the confidence they gain from replacing guesswork with a proven plan.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto rounded-3xl bg-white p-8 md:p-12 shadow-lg border border-gray-200 text-center space-y-8">
            <h2 className="text-3xl sm:text-4xl font-semibold text-[#080b53]">
              See what one of our clients has to say about Fastrack
            </h2>
            <Card className="rounded-3xl shadow-xl border border-[#d3d5ff] bg-white">
              <CardContent className="p-8 md:p-12 space-y-6">
                <p className="text-lg text-gray-700 leading-relaxed italic">
                  &ldquo;Fastrack gave our family a clear blueprint. We went from guessing about dual-enrollment options to confidently building a schedule that keeps our daughter on pace to finish college two years earlier. The guide paid for itself in a single planning session.&rdquo;
                </p>
                <p className="font-semibold text-[#080b53]">Parent of a 10th grade Fastrack student</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="contact" className="container mx-auto px-4">
          <div className="rounded-3xl bg-[#080b53] p-10 md:p-12 text-white shadow-xl space-y-10">
            <div className="grid md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <h2 className="text-3xl sm:text-4xl font-semibold">Contact</h2>
                <p className="text-base sm:text-lg text-blue-100">
                  Reach out with any questions about the Fastrack methodology or how to implement the guide for your student. Our team is ready to help you chart the fastest path to graduation.
                </p>
                <div className="space-y-4 text-sm sm:text-base">
                  <p className="flex items-center gap-3">
                    <span className="font-semibold">Address:</span>
                    1007 N Orange St, Wilmington, Delaware
                  </p>
                  <p className="flex items-center gap-3">
                    <span className="font-semibold">Email:</span>
                    <a href="mailto:info@fastrack.school" className="underline hover:text-[#f8b84a]">
                      info@fastrack.school
                    </a>
                  </p>
                  <p className="flex items-center gap-3">
                    <span className="font-semibold">Phone:</span>
                    <a href="tel:6058846550" className="underline hover:text-[#f8b84a]">
                      605-884-6550
                    </a>
                  </p>
                </div>
              </div>
              <Card className="rounded-3xl bg-white text-gray-900 shadow-xl border-none">
                <CardContent className="p-8 space-y-6">
                  <h3 className="text-2xl font-semibold text-[#080b53]">Need a custom plan?</h3>
                  <p className="text-base text-gray-700">
                    Book a call with a Fastrack specialist to review your district&apos;s course catalog and state policies. We&apos;ll craft a personalized acceleration strategy and highlight where the guide fits into your broader college planning workflow.
                  </p>
                  <CalBookingButton className="bg-[#605dba] hover:bg-[#4e4a9e] text-white px-6 py-4 text-base">
                    Book a Call
                  </CalBookingButton>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
