'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ChevronDown, Menu, X, AlertCircle, TrendingDown, Clock, Wallet } from 'lucide-react'
import Script from 'next/script'
import { CollegeCombobox, type CollegeOption } from './CollegeCombobox'

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

type PathResult = {
  years: number
  totalCost: number
  yearsToRecoup: number | null
  recoupLabel: string
}

type RoiResult = {
  college: { id: number; name: string; state: string; city: string | null }
  residency: 'inState' | 'outOfState'
  costBasis: 'net_price' | 'published_tuition'
  annualCost: number
  averageSalary: number | null
  costOfLiving: number | null
  discretionaryIncome: number | null
  standard: PathResult
  fastrack: PathResult
  savings: number
  yearsSaved: number
  earlyEarnings: number | null
  totalAdvantage: number | null
  notes: string[]
}

const money = (v: number | null | undefined) =>
  v == null ? '—' : `$${Math.round(v).toLocaleString()}`

export default function Calculator() {
  const [states, setStates] = useState<{ state: string; college_count: number }[]>([])
  const [state, setState] = useState('')
  const [residency, setResidency] = useState<'' | 'inState' | 'outOfState'>('')
  const [colleges, setColleges] = useState<CollegeOption[]>([])
  const [college, setCollege] = useState<CollegeOption | null>(null)

  const [result, setResult] = useState<RoiResult | null>(null)
  const [isCollegesLoading, setIsCollegesLoading] = useState(false)
  const [isResultLoading, setIsResultLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const leadShouldBeInsertedRef = useRef(false)

  useEffect(() => {
    fetch('/api/states')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!Array.isArray(d)) return
        // The API orders by state code, which reads as "Alaska, Alabama,
        // Arkansas, Arizona" once codes are swapped for names. Sort on what the
        // user actually sees.
        setStates(
          [...d].sort((a, b) =>
            (STATE_NAMES[a.state] ?? a.state).localeCompare(STATE_NAMES[b.state] ?? b.state)
          )
        )
      })
      .catch(() => setStates([]))
  }, [])

  useEffect(() => {
    if (!state) {
      setColleges([])
      setCollege(null)
      return
    }
    setCollege(null)
    setResult(null)
    setIsCollegesLoading(true)
    setError(null)
    fetch(`/api/colleges?state=${encodeURIComponent(state)}&full=1`)
      .then((r) => {
        if (!r.ok) throw new Error('Could not load colleges')
        return r.json()
      })
      .then((d) => setColleges(Array.isArray(d) ? d : []))
      .catch(() => {
        setColleges([])
        setError('We could not load colleges for that state. Please try again.')
      })
      .finally(() => setIsCollegesLoading(false))
  }, [state])

  const saveLead = useCallback(
    async (roi: RoiResult) => {
      const sessionEmail = sessionStorage.getItem('session-email')
      if (!sessionEmail || !leadShouldBeInsertedRef.current) return

      try {
        const res = await fetch('/api/insertEmailDocument', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: sessionEmail,
            phone: phoneNumber,
            state,
            residency,
            college: roi.college.name,
            annualCost: roi.annualCost,
            standardTotal: roi.standard.totalCost,
            fastrackTotal: roi.fastrack.totalCost,
            savings: roi.savings,
            earlyEarnings: roi.earlyEarnings,
            totalAdvantage: roi.totalAdvantage,
            yearsToRecoup: roi.standard.yearsToRecoup,
            yearsToRecoupFastrack: roi.fastrack.yearsToRecoup,
            costBasis: roi.costBasis,
          }),
        })
        if (res.ok) leadShouldBeInsertedRef.current = false
      } catch {
        // A failed lead write must never block the user from seeing results.
      }
    },
    [phoneNumber, residency, state]
  )

  const loadResult = useCallback(
    async (target: CollegeOption, res: 'inState' | 'outOfState') => {
      setIsResultLoading(true)
      setError(null)
      try {
        const r = await fetch(`/api/roi?id=${target.id}&residency=${res}`)
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? 'Request failed')
        const roi: RoiResult = await r.json()
        setResult(roi)
        saveLead(roi)
      } catch {
        setResult(null)
        setError('We could not calculate results for that school. Please try another.')
      } finally {
        setIsResultLoading(false)
      }
    },
    [saveLead]
  )

  // Results need a college AND a residency. The old version happily rendered
  // out-of-state figures when residency was still unset.
  useEffect(() => {
    if (!college || !residency) return
    if (!sessionStorage.getItem('session-email')) {
      setIsEmailModalOpen(true)
      return
    }
    loadResult(college, residency)
  }, [college, residency, loadResult])

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sessionStorage.setItem('session-email', email)
    leadShouldBeInsertedRef.current = true
    setIsEmailModalOpen(false)
    if (college && residency) loadResult(college, residency)
  }

  const nav = (
    <>
      {[
        ['/', 'Home'],
        ['/student', 'Student'],
        ['/guide', 'Guide'],
        ['/pricing', 'Pricing'],
      ].map(([href, label]) => (
        <Link key={href} href={href}>
          <Button variant="ghost" className="text-white text-base">{label}</Button>
        </Link>
      ))}
    </>
  )

  const ready = Boolean(result) && !isResultLoading

  return (
    <div className="min-h-screen bg-[#f0f0f8] text-[#080b53]">
      <header className="bg-[#090b53] p-4 sticky top-0 z-40">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/">
            <Image src="/logo.png" alt="Fastrack Logo" width={180} height={180} className="rounded-full cursor-pointer" />
          </Link>
          <nav className="hidden md:flex items-center space-x-4">{nav}</nav>
          <Button variant="ghost" className="md:hidden text-white p-2" onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Toggle menu">
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
        {isMenuOpen && <div className="md:hidden mt-4 flex flex-col items-center space-y-2">{nav}</div>}
      </header>

      <main className="container mx-auto p-4">
        <div className="max-w-5xl mx-auto bg-white rounded-lg shadow-md mt-8 p-6">
          <h1 className="text-4xl font-bold text-center mb-3 bg-gradient-to-r from-[#080b53] to-[#605dba] text-transparent bg-clip-text">
            College Return on Investment Calculator
          </h1>
          <p className="text-center mb-8 text-[#080b53]">
            See what a degree actually costs, how long it takes to pay back, and what changes if you finish in two years instead of four.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Select value={state || undefined} onValueChange={setState}>
              <SelectTrigger className="w-full bg-[#f0f0f8] text-[#080b53] border-[#605dba] h-14 text-lg relative">
                <SelectValue placeholder="Select a State" />
                <ChevronDown className="h-4 w-4 opacity-50 absolute right-3" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {states.map((s) => (
                  <SelectItem key={s.state} value={s.state} className="text-lg">
                    {STATE_NAMES[s.state] ?? s.state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={residency || undefined} onValueChange={(v) => setResidency(v as 'inState' | 'outOfState')}>
              <SelectTrigger className="w-full bg-[#f0f0f8] text-[#080b53] border-[#605dba] h-14 text-lg relative">
                <SelectValue placeholder="Select Residency Status" />
                <ChevronDown className="h-4 w-4 opacity-50 absolute right-3" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inState" className="text-lg">In State</SelectItem>
                <SelectItem value="outOfState" className="text-lg">Out of State</SelectItem>
              </SelectContent>
            </Select>

            <CollegeCombobox
              options={colleges}
              value={college}
              onChange={setCollege}
              disabled={!state}
              loading={isCollegesLoading}
              placeholder={state ? 'Select a College' : 'Select a state first'}
              emptyLabel={`No colleges found in ${STATE_NAMES[state] ?? state}`}
            />
          </div>

          {!ready && !isResultLoading && (
            <p className="text-center text-sm text-[#605dba] mb-8">
              {!state ? 'Start by choosing a state.'
                : !residency ? 'Now choose your residency status.'
                : !college ? 'Now pick a college — you can type to search.'
                : ''}
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border-2 border-red-300 bg-red-50 p-4 mb-8 text-red-800">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {isResultLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 rounded-lg border-2 border-[#e0e0f0] bg-[#f7f7fc] animate-pulse" />
              ))}
            </div>
          )}

          {ready && result && (
            <>
              {/* The contrast is the pitch: the cost of doing it the normal way,
                  sitting directly next to the cost of not. */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <Card className="border-2 border-red-300 rounded-lg overflow-hidden">
                  <CardHeader className="bg-red-600 text-white p-4">
                    <h3 className="text-lg font-semibold">The normal path — {result.standard.years} years</h3>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="text-sm text-[#605dba]">Total cost of the degree</p>
                      <p className="text-4xl font-bold text-red-700">{money(result.standard.totalCost)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[#605dba] flex items-center gap-1">
                        <Clock className="h-4 w-4" /> Time to earn that money back
                      </p>
                      <p className="text-3xl font-bold text-red-700">{result.standard.recoupLabel}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-2 border-green-400 rounded-lg overflow-hidden">
                  <CardHeader className="bg-green-700 text-white p-4">
                    <h3 className="text-lg font-semibold">With Fastrack — {result.fastrack.years} years</h3>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="text-sm text-[#605dba]">Total cost of the same degree</p>
                      <p className="text-4xl font-bold text-green-800">{money(result.fastrack.totalCost)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[#605dba] flex items-center gap-1">
                        <Clock className="h-4 w-4" /> Time to earn that money back
                      </p>
                      <p className="text-3xl font-bold text-green-800">{result.fastrack.recoupLabel}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <Card className="border-2 border-[#605dba]">
                  <CardContent className="p-4">
                    <p className="text-sm text-[#605dba] flex items-center gap-1">
                      <TrendingDown className="h-4 w-4" /> Money saved
                    </p>
                    <p className="text-3xl font-bold">{money(result.savings)}</p>
                  </CardContent>
                </Card>
                <Card className="border-2 border-[#605dba]">
                  <CardContent className="p-4">
                    <p className="text-sm text-[#605dba] flex items-center gap-1">
                      <Wallet className="h-4 w-4" /> {result.yearsSaved} extra years of earnings
                    </p>
                    <p className="text-3xl font-bold">{money(result.earlyEarnings)}</p>
                  </CardContent>
                </Card>
                <Card className="border-2 border-[#080b53] bg-[#080b53] text-white">
                  <CardContent className="p-4">
                    <p className="text-sm text-white/70">Total advantage</p>
                    <p className="text-3xl font-bold">{money(result.totalAdvantage)}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 text-sm">
                {[
                  ['Cost per year', money(result.annualCost)],
                  ['Typical salary', money(result.averageSalary)],
                  ['Cost of living', money(result.costOfLiving)],
                  ['Left over per year', money(result.discretionaryIncome)],
                ].map(([label, value]) => (
                  <div key={label} className="border border-[#e0e0f0] rounded-lg p-3">
                    <p className="text-[#605dba]">{label}</p>
                    <p className="text-xl font-bold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-[#f0f0f8] border-2 border-[#605dba] p-6 text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">
                  That&apos;s {money(result.totalAdvantage)} and {result.yearsSaved} years back.
                </h2>
                <p className="mb-4 text-[#080b53]">
                  We build the exact course-by-course plan that gets {result.college.name} done in {result.fastrack.years} years.
                </p>
                <Link href="/student">
                  <Button className="bg-[#605dba] hover:bg-[#080b53] text-white text-lg h-12 px-8">
                    Book a Free Planning Session
                  </Button>
                </Link>
              </div>

              {result.notes.length > 0 && (
                <ul className="text-xs text-[#605dba] space-y-1 list-disc pl-5">
                  {result.notes.map((n) => <li key={n}>{n}</li>)}
                  <li>
                    Cost and earnings data from the U.S. Department of Education College Scorecard.
                    Fastrack figures assume {result.fastrack.years} years of enrollment plus 60 dual-credit hours at $80 per credit.
                  </li>
                </ul>
              )}
            </>
          )}

          <Dialog open={isEmailModalOpen} onOpenChange={setIsEmailModalOpen}>
            <DialogContent className="bg-white border-2 border-[#605dba]">
              <DialogHeader>
                <DialogTitle className="text-[#080b53]">Enter your details</DialogTitle>
                <DialogDescription className="text-[#605dba]">
                  Your results appear immediately after you submit, and we&apos;ll send a copy along with our free guide on how to achieve these savings.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleEmailSubmit}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-[#080b53]">Email</label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email" required
                      className="border-[#605dba] bg-[#f0f0f8] text-[#080b53]" />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="phone" className="text-sm font-medium text-[#080b53]">Phone Number</label>
                    <Input id="phone" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Enter your phone number"
                      className="border-[#605dba] bg-[#f0f0f8] text-[#080b53]" />
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
        <div className="container mx-auto px-4 flex flex-col items-center">
          <Image src="/logo.png" alt="Fastrack Logo" width={200} height={200} className="mb-4" />
          <address className="text-center not-italic text-sm sm:text-base">
            1007 N Orange St<br />Wilmington, Delaware<br />info@fastrack.school
          </address>
          <Link href="/privacypolicy" className="mt-4 text-sm underline">Privacy Policy</Link>
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
