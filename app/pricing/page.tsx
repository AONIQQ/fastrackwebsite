'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from "@/components/ui/button"
import CalBookingButton from '@/components/cal/CalBookingButton'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Menu, X } from "lucide-react"

export default function Pricing() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

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
          </nav>
          <Button variant="ghost" className="md:hidden text-white p-2" onClick={toggleMenu} aria-label="Toggle menu">
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
          </div>
        )}
      </header>

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-center mb-8">
          Pricing
        </h1>
        
        <Card className="mb-8 rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
          <CardContent className="p-6 text-center">
            <p className="text-lg mb-4">
              The cost for the online program is $500 per counselor or educator and includes access to the training materials until the end of the calendar year.
            </p>
            <p className="text-lg mb-4">
              Bulk pricing applies for district wide implementations of over 30 professionals. To receive more information, Inquire via email info@fastrack.school
            </p>
            <p className="text-lg">
              Payments will be accepted via card, ACH, paypal, and check. Invoice will be sent after form submission below.
            </p>
          </CardContent>
        </Card>

        <div className="text-center mb-12">
          <CalBookingButton className="bg-[#605dba] hover:bg-[#4e4a9e] text-white text-xl px-12 py-6 rounded-xl">
            Sign Up
          </CalBookingButton>
        </div>

        <h2 className="text-3xl sm:text-4xl font-semibold text-center mb-8">
          Funding Options
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <CardHeader className="bg-[#080b53] text-white">
              <CardTitle className="text-2xl">Foundations and Corporations</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm sm:text-base">
                Seek funding from foundations, corporations, and local businesses that support educational initiatives. Explore regional funding opportunities and utilize grant writing guides.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <CardHeader className="bg-[#080b53] text-white">
              <CardTitle className="text-2xl">Local Education Agencies (LEAs) and School District Partnerships</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm sm:text-base">
                Partner with LEAs, which may have discretionary budgets for programs that align with district goals, including student success and college readiness.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <CardHeader className="bg-[#080b53] text-white">
              <CardTitle className="text-2xl">Federal and State Initiatives</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm sm:text-base">
                Apply for competitive grants and discretionary initiatives from the U.S. Department of Education and state education departments, which offer resources for K-16 education.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <CardHeader className="bg-[#080b53] text-white">
              <CardTitle className="text-2xl">District General Funds</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm sm:text-base">
                Districts can allocate general operating funds to support the Fastrack program, recognizing its role in enhancing student outcomes.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <CardHeader className="bg-[#080b53] text-white">
              <CardTitle className="text-2xl">Community Support</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm sm:text-base">
                Engage local communities to fund this program. Utilize platforms like DonorsChoose.org to gather support from foundations like google.org, the gates foundation, and many others.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <CardHeader className="bg-[#080b53] text-white">
              <CardTitle className="text-2xl">Alumni Donations</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm sm:text-base">
                Seek contributions from high school and college alumni networks, which often support initiatives that impact education and future success.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <CardHeader className="bg-[#080b53] text-white">
              <CardTitle className="text-2xl">Workforce Development Grants</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm sm:text-base">
                Access grants from workforce development agencies focused on increasing career readiness and reducing the skills gap.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <CardHeader className="bg-[#080b53] text-white">
              <CardTitle className="text-2xl">Public-Private Partnerships</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm sm:text-base">
                Form partnerships with local businesses, chambers of commerce, or industry groups interested in supporting programs that prepare students for the workforce.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <CardHeader className="bg-[#080b53] text-white">
              <CardTitle className="text-2xl">Education Service Agencies (ESAs)</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm sm:text-base">
                Investigate whether your local ESA offers financial support or grant opportunities for employee training programs.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <CardHeader className="bg-[#080b53] text-white">
              <CardTitle className="text-2xl">State Innovation and Opportunity Grants</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm sm:text-base">
                Explore state-specific grants focused on innovative educational programs that address equity, access to college, and improving academic performance.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <CardHeader className="bg-[#080b53] text-white">
              <CardTitle className="text-2xl">Local Colleges and Universities</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm sm:text-base">
                Partner with local colleges and universities that could fund the Fastrack training. Since increased dual enrollment could lead to higher college enrollments, these institutions have a vested interest in supporting the program.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
            <CardHeader className="bg-[#080b53] text-white">
              <CardTitle className="text-2xl">Title Funds</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm sm:text-base">
                Leverage Title II Funds under ESSA (Every Student Succeeds Act)
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mt-12">
          <CalBookingButton className="bg-[#605dba] hover:bg-[#4e4a9e] text-white text-xl px-12 py-6 rounded-xl">
            Sign Up
          </CalBookingButton>
        </div>
      </main>

      <footer className="bg-[#080b53] text-white py-8 mt-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center">
            <Image src="/logo.png" alt="Fastrack Logo" width={200} height={200} className="mb-4" />
            <address className="text-center not-italic text-sm sm:text-base">
              1007 N Orange St<br />
              Wilmington, Delaware<br />
              info@fastrack.school<br />
              605-884-6550
            </address>
            <Link href="/privacypolicy" className="mt-4 text-sm underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
