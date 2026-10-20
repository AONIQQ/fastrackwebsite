'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import CalBookingButton from '@/components/cal/CalBookingButton'
import { Card, CardContent } from "@/components/ui/card"
import SiteHeader from '@/components/SiteHeader'

export default function ThankYou() {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 transition-colors duration-300">
      <SiteHeader />

      <main className="container mx-auto px-4 py-8 flex items-center justify-center" style={{ minHeight: 'calc(100vh - 80px - 200px)' }}>
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <h1 className="text-3xl font-bold mb-4">Thank You!</h1>
            <p className="mb-6">Your form has been submitted successfully. We&apos;ll be in touch soon.</p>
            <Link href="/">
              <Button className="bg-[#605dba] hover:bg-[#4e4a9e] text-white">
                Return to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </main>

      <footer className="border-t border-gray-200 bg-gray-100 text-gray-700 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center">
            <Image src="/logo-color.png" alt="Fastrack Logo" width={200} height={200} className="mb-4" />
            <CalBookingButton className="text-white mb-4 text-base bg-[#605dba] hover:bg-[#4e4a9e]">
              Contact Us
            </CalBookingButton>
            <address className="text-center not-italic text-sm sm:text-base">
              1007 N Orange St<br />
              Wilmington, Delaware<br />
              info@fastrack.school
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
