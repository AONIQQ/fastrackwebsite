'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ChevronDown, Menu, X } from 'lucide-react'
import Script from 'next/script'

type CalculatorData = {
  inStateTuition: string
  outOfStateTuition: string
  averageSalary6: string
  averageSalary10: string
  costOfLiving: string
  timeToRecoupInState: string
  timeToRecoupOutOfState: string
  leftoverSavings: string
  potentialSavingsInState: string
  potentialSavingsOutOfState: string
}

type TuitionAndSalary = {
  inStateTuitionTotal: number
  outOfStateTuitionTotal: number
  averageSalary6: number
  averageSalary10: number
}

const formatCurrency = (value: number) => `$${value.toLocaleString()}`

export default function Home() {
  const [state, setState] = useState('')
  const [stateStatus, setStateStatus] = useState('')
  const [college, setCollege] = useState('')
  const [colleges, setColleges] = useState<string[]>([])
  const [calculatorData, setCalculatorData] = useState<CalculatorData>({
    inStateTuition: '',
    outOfStateTuition: '',
    averageSalary6: '',
    averageSalary10: '',
    costOfLiving: '',
    timeToRecoupInState: '',
    timeToRecoupOutOfState: '',
    leftoverSavings: '',
    potentialSavingsInState: '',
    potentialSavingsOutOfState: '',
  })
  const [isCollegesLoading, setIsCollegesLoading] = useState(false)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const emailShouldBeInsertedRef = useRef(false)

  const states = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"]

  useEffect(() => {
    if (state) {
      setCollege('')
      fetchColleges(state)
    } else {
      setColleges([])
      setIsCollegesLoading(false)
    }
  }, [state])

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const fetchColleges = async (stateAbbreviation: string) => {
    const endpointUrl = `/api/colleges?state=${encodeURIComponent(stateAbbreviation)}`
    try {
      setIsCollegesLoading(true)
      const response = await fetch(endpointUrl, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const collegeList = await response.json()
      if (Array.isArray(collegeList)) {
        setColleges(collegeList)
      } else {
        console.error('Unexpected colleges payload:', collegeList)
        setColleges([])
      }
    } catch (error) {
      console.error('Error fetching colleges:', error)
      setColleges([])
    } finally {
      setIsCollegesLoading(false)
    }
  }

  const insertEmailAndChoice = useCallback(
    async (snapshot?: CalculatorData) => {
      const email = sessionStorage.getItem('session-email')
      if (!email || !emailShouldBeInsertedRef.current || !snapshot) return

      const endpointUrl = `/api/insertEmailDocument`
      const insertUserChoiceData = {
        email,
        phone: phoneNumber,
        state,
        residency: stateStatus,
        college,
        ...snapshot,
      }

      try {
        const response = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(insertUserChoiceData),
        })
        if (response.ok) {
          console.log('Successfully inserted user choice!')
          emailShouldBeInsertedRef.current = false
        } else {
          throw new Error('Failed to insert user choice')
        }
      } catch (error) {
        console.error('Error inserting data to user choice', error)
      }
    },
    [college, phoneNumber, state, stateStatus]
  )

  const fetchCostOfLivingData = useCallback(
    async (stateAbbreviation: string, baseData: TuitionAndSalary) => {
      const endpointUrl = `/api/costOfLiving?state=${encodeURIComponent(stateAbbreviation)}`
      try {
        const response = await fetch(endpointUrl, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const costOfLiving = await response.json()

        if (typeof costOfLiving !== 'number') {
          throw new Error('Unexpected cost of living payload')
        }

        const averageSalary = (baseData.averageSalary6 + baseData.averageSalary10) / 2
        const leftoverSavings = averageSalary - costOfLiving

        let timeToRecoupInState = 'No leftover savings per year, payoff will be extremely difficult'
        let timeToRecoupOutOfState = 'No leftover savings per year, payoff will be extremely difficult'

        if (leftoverSavings > 0) {
          const yearsToRecoupInState = Math.floor(baseData.inStateTuitionTotal / leftoverSavings)
          const yearsToRecoupOutOfState = Math.floor(baseData.outOfStateTuitionTotal / leftoverSavings)
          timeToRecoupInState = `${yearsToRecoupInState.toLocaleString()} years`
          timeToRecoupOutOfState = `${yearsToRecoupOutOfState.toLocaleString()} years`
        }

        const updatedData: CalculatorData = {
          inStateTuition: formatCurrency(baseData.inStateTuitionTotal),
          outOfStateTuition: formatCurrency(baseData.outOfStateTuitionTotal),
          averageSalary6: formatCurrency(baseData.averageSalary6),
          averageSalary10: formatCurrency(baseData.averageSalary10),
          costOfLiving: formatCurrency(costOfLiving),
          leftoverSavings: formatCurrency(leftoverSavings),
          timeToRecoupInState,
          timeToRecoupOutOfState,
          potentialSavingsInState: formatCurrency(baseData.inStateTuitionTotal / 2),
          potentialSavingsOutOfState: formatCurrency(baseData.outOfStateTuitionTotal / 2),
        }

        setCalculatorData(updatedData)
        insertEmailAndChoice(updatedData)
      } catch (error) {
        console.error('Error fetching cost of living data:', error)
      }
    },
    [insertEmailAndChoice]
  )

  const fetchCollegeDetails = useCallback(
    async (collegeName: string) => {
      if (!state) {
        console.warn('Cannot load college details without a selected state')
        return
      }

      const endpointUrl = `/api/collegeDetails?college=${encodeURIComponent(collegeName)}`
      try {
        const response = await fetch(endpointUrl, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data = await response.json()
        if (
          data.latest_cost_tuition_in_state &&
          data.latest_cost_tuition_out_of_state &&
          data.latest_earnings_6_yrs_after_entry_median &&
          data.latest_earnings_10_yrs_after_entry_median
        ) {
          const baseData: TuitionAndSalary = {
            inStateTuitionTotal: data.latest_cost_tuition_in_state * 4,
            outOfStateTuitionTotal: data.latest_cost_tuition_out_of_state * 4,
            averageSalary6: data.latest_earnings_6_yrs_after_entry_median,
            averageSalary10: data.latest_earnings_10_yrs_after_entry_median,
          }

          await fetchCostOfLivingData(state, baseData)
        } else {
          console.error('Some necessary data is missing for the selected college')
        }
      } catch (error) {
        console.error('Error fetching college details:', error)
      }
    },
    [fetchCostOfLivingData, state]
  )

  useEffect(() => {
    if (college) {
      const sessionEmail = sessionStorage.getItem('session-email')
      if (!sessionEmail) {
        setIsEmailModalOpen(true)
      } else {
        fetchCollegeDetails(college)
      }
    }
  }, [college, fetchCollegeDetails])

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sessionStorage.setItem('session-email', email)
    emailShouldBeInsertedRef.current = true
    setIsEmailModalOpen(false)
    fetchCollegeDetails(college)
  }

  return (
    <div className="min-h-screen bg-[#f0f0f8] text-[#080b53] transition-colors duration-300">
      <header className="bg-[#090b53] p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Link href="/">
              <Image src="/logo.png" alt="Fastrack Logo" width={180} height={180} className="rounded-full cursor-pointer" />
            </Link>
          </div>
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
            <Link href="/pricing">
              <Button variant="ghost" className="text-white text-base">
                Pricing
              </Button>
            </Link>
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
            <Link href="/pricing">
              <Button variant="ghost" className="text-white text-base">
                Pricing
              </Button>
            </Link>
          </div>
        )}
      </header>

      <main className="container mx-auto p-4">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md mt-8 p-6">
          <h1 className="text-4xl font-bold text-center mb-6 bg-gradient-to-r from-[#080b53] to-[#605dba] text-transparent bg-clip-text">
              College Return on Investment Calculator
          </h1>
          <p className="text-center mb-8 text-[#080b53]">Select the state your desired college is in, your residency status, and the college using the dropdowns below to view your statistics</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Select value={state || undefined} onValueChange={setState}>
              <SelectTrigger className="w-full bg-[#f0f0f8] text-[#080b53] border-[#605dba] h-14 text-lg relative">
                <SelectValue placeholder="Select a State" />
                <ChevronDown className="h-4 w-4 opacity-50 absolute right-3" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-[#605dba] scrollbar-track-[#f0f0f8]">
                {states.map(state => (
                  <SelectItem key={state} value={state} className="text-lg">{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={stateStatus || undefined} onValueChange={setStateStatus}>
              <SelectTrigger className="w-full bg-[#f0f0f8] text-[#080b53] border-[#605dba] h-14 text-lg relative">
                <SelectValue placeholder="Select Residency Status" />
                <ChevronDown className="h-4 w-4 opacity-50 absolute right-3" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inState" className="text-lg">In State</SelectItem>
                <SelectItem value="outOfState" className="text-lg">Out of State</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={state ? college || undefined : undefined}
              onValueChange={setCollege}
            >
              <SelectTrigger className="w-full bg-[#f0f0f8] text-[#080b53] border-[#605dba] h-14 text-lg relative">
                <SelectValue placeholder="Select a College" />
                <ChevronDown className="h-4 w-4 opacity-50 absolute right-3" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-[#605dba] scrollbar-track-[#f0f0f8]">
                {!state && (
                  <SelectItem value="select-state" disabled className="text-lg">
                    Select a state first
                  </SelectItem>
                )}
                {state && isCollegesLoading && (
                  <SelectItem value="loading" disabled className="text-lg">
                    Loading colleges...
                  </SelectItem>
                )}
                {state && !isCollegesLoading && colleges.length === 0 && (
                  <SelectItem value="no-colleges" disabled className="text-lg">
                    No colleges found for {state}
                  </SelectItem>
                )}
                {state && !isCollegesLoading && colleges.map(collegeName => (
                  <SelectItem key={collegeName} value={collegeName} className="text-lg">
                    {collegeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card className="bg-white text-[#080b53] shadow-lg border-2 border-[#605dba] rounded-lg overflow-hidden transform transition-all hover:scale-105">
              <CardHeader className="bg-[#090b53] text-white p-4">
                <h3 className="text-lg font-semibold">Tuition for your selected school (4 years)</h3>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{stateStatus === 'inState'
                  ? calculatorData.inStateTuition : calculatorData.outOfStateTuition}</p>
              </CardContent>
            </Card>

            <Card className="bg-white text-[#080b53] shadow-lg border-2 border-[#605dba] rounded-lg overflow-hidden transform transition-all hover:scale-105">
              <CardHeader className="bg-[#090b53] text-white p-4">
                <h3 className="text-lg font-semibold">Average Salary 6 years after enrollment</h3>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{calculatorData.averageSalary6}</p>
              </CardContent>
            </Card>

            <Card className="bg-white text-[#080b53] shadow-lg border-2 border-[#605dba] rounded-lg overflow-hidden transform transition-all hover:scale-105">
              <CardHeader className="bg-[#090b53] text-white p-4">
                <h3 className="text-lg font-semibold">Average Salary 10 years after enrollment</h3>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{calculatorData.averageSalary10}</p>
              </CardContent>
            </Card>

            <Card className="bg-white text-[#080b53] shadow-lg border-2 border-[#605dba] rounded-lg overflow-hidden transform transition-all hover:scale-105">
              <CardHeader className="bg-[#090b53] text-white p-4">
                <h3 className="text-lg font-semibold">Average yearly cost of living in the selected state for 1 person</h3>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{calculatorData.costOfLiving}</p>
              </CardContent>
            </Card>

            <Card className="bg-white text-[#080b53] shadow-lg border-2 border-[#605dba] rounded-lg overflow-hidden transform transition-all hover:scale-105">
              <CardHeader className="bg-[#090b53] text-white p-4">
                <h3 className="text-lg font-semibold">Leftover savings after cost of living per year</h3>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">{calculatorData.leftoverSavings}</p>
              </CardContent>
            </Card>

            <Card className="bg-white text-[#080b53] shadow-lg border-2 border-[#605dba] rounded-lg overflow-hidden transform transition-all hover:scale-105">
              <CardHeader className="bg-[#090b53] text-white p-4">
                <h3 className="text-lg font-semibold">Time it will take to recoup the funds that were spent on your degree</h3>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-2xl font-bold">
                  {stateStatus === 'inState' ? calculatorData.timeToRecoupInState : calculatorData.timeToRecoupOutOfState}
                </p>
              </CardContent>
            </Card>
          </div>

          <h2 className="text-2xl font-bold mb-4 text-center text-[#080b53]">Savings by following our system:</h2>
          <Card className="bg-white text-[#080b53] shadow-lg border-2 border-[#605dba] rounded-lg overflow-hidden transform transition-all hover:scale-105 mb-8">
            <CardHeader className="bg-[#090b53] text-white p-4">
              <h3 className="text-lg font-semibold">Potential savings by enrolling in dual credit courses and completing your bachelors degree in two years instead of four</h3>
            </CardHeader>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">
                {stateStatus === 'inState' ? calculatorData.potentialSavingsInState : calculatorData.potentialSavingsOutOfState}
              </p>
            </CardContent>
          </Card>

          <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
            <DialogContent className="bg-white border-2 border-[#605dba]">
              <DialogHeader>
                <DialogTitle className="text-[#080b53]">Enter your details</DialogTitle>
                <DialogDescription className="text-[#605dba]">
                  Please enter your email address and phone number. Your results will be shown immediately after providing your details and you will also receive a copy via email along with our ebook on how to achieve these college savings for completely FREE.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleEmailSubmit}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium leading-none text-[#080b53]">Email</label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      required
                      className="border-[#605dba] bg-[#f0f0f8] text-[#080b53]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="phone" className="text-sm font-medium leading-none text-[#080b53]">Phone Number</label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Enter your phone number"
                      className="border-[#605dba] bg-[#f0f0f8] text-[#080b53]"
                    />
                  </div>
                </div>
                <DialogFooter className="mt-6">
                  <Button type="submit" className="bg-[#605dba] hover:bg-[#080b53] text-white">Submit</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </main>

      <footer className="bg-[#090b53] text-white py-8 mt-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center">
            <Image src="/logo.png" alt="Fastrack Logo" width={200} height={200} className="mb-4" />
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

      <Script id="neverbounce" strategy="afterInteractive">
        {`
          _NBSettings = {
            apiKey: 'public_f996b944a517d81a64e41ab43a31dcf6',
            displayPoweredBy: false,
            blockThrottledAttempts: true,
            blockFreemail: false,
          };
        `}
      </Script>
      <Script src="https://cdn.neverbounce.com/widget/dist/NeverBounce.js" strategy="afterInteractive" />
      <Script id="microsoft-clarity" strategy="afterInteractive">
        {`
          (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "m7qufzputy");
        `}
      </Script>
      <Script src="https://www.googletagmanager.com/gtag/js?id=AW-11375039901" strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'AW-11375039901');
        `}
      </Script>
    </div>
  )
}
