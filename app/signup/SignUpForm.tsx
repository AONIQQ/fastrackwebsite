'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { Moon, Sun, Menu, X } from "lucide-react"

export default function SignUpForm() {
  const [theme, setTheme] = useState('dark')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    schoolDistrict: '',
    state: '',
    attendeeNames: '',
    attendeeEmails: '',
    numberOfAttendees: '',
    pocName: '',
    pocEmail: ''
  })
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
  
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })
  
      if (response.ok) {
        const result = await response.json()
        toast({
          title: "Form submitted successfully",
          description: result.message,
        })
        setFormData({
          schoolDistrict: '',
          state: '',
          attendeeNames: '',
          attendeeEmails: '',
          numberOfAttendees: '',
          pocName: '',
          pocEmail: ''
        })
        router.push('/thank-you')
      } else {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to submit form')
      }
    } catch (error) {
      toast({
        title: "Error submitting form",
        description: (error as Error).message || "Please try again later.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
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

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-center mb-8">
          Sign Up
        </h1>
        
        <Card className="mb-8 rounded-xl overflow-hidden dark:bg-[#1a1d6c] shadow-lg border border-gray-200 dark:border-gray-700">
          <CardContent className="p-6">
            <p className="text-lg mb-4">
              This is the sign up form for our online training, if you would like to sign up for a live or on-site training, please send us an email via the contact button in the header or footer. The cost per attendee is $500. Pleasure ensure all information submitted is correct - it&apos;s how we grant access to our training materials. If submitting for multiple attendees, please submit names and email addresses in a list, separated by commas (John,Susie,Karen). Your invoice will be generated after submission, and we will reach out within one business day to coordinate account setup.
            </p>
          </CardContent>
        </Card>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="schoolDistrict">School/District *</Label>
            <Input
              id="schoolDistrict"
              name="schoolDistrict"
              value={formData.schoolDistrict}
              onChange={handleInputChange}
              required
              className="mt-1 w-full px-3 py-2 border rounded-md bg-white dark:bg-[#1a1d6c] dark:border-[#605dba] dark:text-white"
            />
          </div>
          <div>
            <Label htmlFor="state">State *</Label>
            <Input
              id="state"
              name="state"
              value={formData.state}
              onChange={handleInputChange}
              required
              className="mt-1 w-full px-3 py-2 border rounded-md bg-white dark:bg-[#1a1d6c] dark:border-[#605dba] dark:text-white"
            />
          </div>
          <div>
            <Label htmlFor="attendeeNames">Attendee Name(s) *</Label>
            <Textarea
              id="attendeeNames"
              name="attendeeNames"
              value={formData.attendeeNames}
              onChange={handleInputChange}
              required
              className="mt-1 w-full px-3 py-2 border rounded-md bg-white dark:bg-[#1a1d6c] dark:border-[#605dba] dark:text-white"
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="attendeeEmails">Attendee Email Address(s) *</Label>
            <Textarea
              id="attendeeEmails"
              name="attendeeEmails"
              value={formData.attendeeEmails}
              onChange={handleInputChange}
              required
              className="mt-1 w-full px-3 py-2 border rounded-md bg-white dark:bg-[#1a1d6c] dark:border-[#605dba] dark:text-white"
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="numberOfAttendees">Number of Attendees *</Label>
            <Input
              id="numberOfAttendees"
              name="numberOfAttendees"
              type="number"
              value={formData.numberOfAttendees}
              onChange={handleInputChange}
              required
              className="mt-1 w-full px-3 py-2 border rounded-md bg-white dark:bg-[#1a1d6c] dark:border-[#605dba] dark:text-white"
            />
          </div>
          <div>
            <Label htmlFor="pocName">Point of contact name *</Label>
            <Input
              id="pocName"
              name="pocName"
              value={formData.pocName}
              onChange={handleInputChange}
              required
              className="mt-1 w-full px-3 py-2 border rounded-md bg-white dark:bg-[#1a1d6c] dark:border-[#605dba] dark:text-white"
            />
          </div>
          <div>
            <Label htmlFor="pocEmail">Point of contact email for invoice and coordination</Label>
            <Input
              id="pocEmail"
              name="pocEmail"
              type="email"
              value={formData.pocEmail}
              onChange={handleInputChange}
              className="mt-1 w-full px-3 py-2 border rounded-md bg-white dark:bg-[#1a1d6c] dark:border-[#605dba] dark:text-white"
            />
          </div>
          <Button 
            type="submit" 
            className="bg-[#605dba] hover:bg-[#4e4a9e] text-white text-xl px-12 py-6 rounded-xl w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        </form>
      </main>

      <footer className="bg-[#080b53] text-white py-8 mt-12">
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