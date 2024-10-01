'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Moon, Sun, Menu, X } from "lucide-react"

export default function ThankYou() {
  const [theme, setTheme] = useState('dark')
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 dark:bg-[#080b53] dark:text-white transition-colors duration-300">
      <header className="bg-[#080b53] text-white p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="Fastrack Logo" width={180} height={180} className="rounded-full" />
          </Link>
          <nav className="hidden md:flex items-center space-x-4">
            <Link href="/pricing">
              <Button variant="ghost" className="text-white text-base">
                Pricing
              </Button>
            </Link>   
            <Link href="/">
              <Button variant="ghost" className="text-white text-base">
                Home
              </Button>
            </Link>
            <Button variant="ghost" className="text-white p-2" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'dark' ? (
                <Sun className="h-[1.2rem] w-[1.2rem]" />
              ) : (
                <Moon className="h-[1.2rem] w-[1.2rem]" />
              )}
              <span className="sr-only">Toggle theme</span>
            </Button>
          </nav>
          <Button variant="ghost" className="md:hidden text-white p-2" onClick={toggleMenu} aria-label="Toggle menu">
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
        {isMenuOpen && (
         <div className="md:hidden mt-4 flex flex-col items-center">
           <Link href="/pricing" className="mb-2">
             <Button variant="ghost" className="text-white text-base">
               Pricing
             </Button>
           </Link>   
           <Link href="/" className="mb-2">
             <Button variant="ghost" className="text-white text-base">
               Home
             </Button>
           </Link>
           <Button variant="ghost" className="text-white p-2 w-full" onClick={toggleTheme} aria-label="Toggle theme">
             {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
           </Button>
         </div>
        )}
      </header>

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

      <footer className="bg-[#080b53] text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center">
            <Image src="/logo.png" alt="Fastrack Logo" width={200} height={200} className="mb-4" />
            <Button variant="ghost" className="text-white mb-4 text-base bg-[#605dba] hover:bg-[#4e4a9e]">
              Contact Us
            </Button>
            <address className="text-center not-italic text-sm sm:text-base">
              1007 N Orange St<br />
              Wilmington, Delaware<br />
              info@fastrack.school<br />
              605-884-6550
            </address>
          </div>
        </div>
      </footer>
    </div>
  )
}