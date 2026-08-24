'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { track } from '@vercel/analytics'
import Image from 'next/image'
import Link from 'next/link'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Menu, X } from 'lucide-react'
import Script from 'next/script'
import { CollegeCombobox, type CollegeOption } from './CollegeCombobox'
import { acknowledgeResultDisplay, captureRequestFailureMessage, completeCapture } from '@/lib/capture-client.mjs'
import { withAttributionQuery } from '@/lib/attribution-url.mjs'
import {
  emitCalculatorAnalyticsEvent,
  getAnalyticsSessionStorage,
  getClarityEventEmitter,
  getSessionStorageValue,
  isCanonicalProductionHost,
  removeSessionStorageValue,
  setSessionStorageValue,
} from '@/lib/calculator-analytics.mjs'
import { emitFirstPartyFunnelEvent } from '@/lib/first-party-funnel-client.mjs'

type CalculatorAnalyticsEvent =
  | 'Calculator Intent'
  | 'Calculator Modal Opened'
  | 'Capture Submission Attempted'
  | 'Lead Captured'
  | 'Capture Failed'

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

type PathResult = { years: number; totalCost: number; yearsToRecoup: number | null; recoupLabel: string }

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
  v == null ? '-' : `$${Math.round(v).toLocaleString('en-US')}`

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span id={id} className="block text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </div>
  )
}

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
  // Deep links prefill the form but must not throw a popup at someone who has
  // not clicked anything. Direct picks in the UI count as intent; URL params do not.
  const userIntentRef = useRef(false)
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [smsConsent, setSmsConsent] = useState(false)
  const [emailInvalid, setEmailInvalid] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [website, setWebsite] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [creditMapHref, setCreditMapHref] = useState('/credit-map')
  const [displayAcknowledgement, setDisplayAcknowledgement] = useState<string | null>(null)
  const [isProductionAnalyticsHost, setIsProductionAnalyticsHost] = useState(false)
  const fixtureCaptureRef = useRef(false)

  const attributionRef = useRef<{ referrer: string; utm: Record<string, string> }>({ referrer: '', utm: {} })
  const pendingCollegeIdRef = useRef<number | null>(null)
  const captureAttemptRef = useRef<{ id: string; fingerprint: string } | null>(null)
  const captureErrorRef = useRef<HTMLParagraphElement>(null)
  const resultHeadingRef = useRef<HTMLHeadingElement>(null)
  const residencyActionRef = useRef<HTMLButtonElement | null>(null)
  const collegeActionRef = useRef<HTMLButtonElement | null>(null)
  const requestResultsActionRef = useRef<HTMLButtonElement | null>(null)
  const modalReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const restoreModalFocusRef = useRef(false)

  const trackCalculatorEvent = useCallback((event: CalculatorAnalyticsEvent, onceKey?: string) => {
    if (typeof window === 'undefined') return
    const hostname = window.location.hostname
    const storage = getAnalyticsSessionStorage(window)
    emitCalculatorAnalyticsEvent({
      hostname,
      event,
      emitters: [
        { key: 'vercel', emit: track },
        { key: 'clarity', emit: getClarityEventEmitter(window, hostname) },
      ],
      onceKey,
      storage,
    })
    try {
      emitFirstPartyFunnelEvent({
        hostname,
        search: window.location.search,
        event,
        storage,
        fetcher: (...args: Parameters<typeof fetch>) => window.fetch(...args),
        browserCrypto: window.crypto,
      })
    } catch {
      // First-party measurement must never affect calculator behavior.
    }
  }, [])

  useEffect(() => {
    setIsProductionAnalyticsHost(isCanonicalProductionHost(window.location.hostname))
    const params = new URLSearchParams(window.location.search)
    fixtureCaptureRef.current = params.get('fixture') === '1'
    const utm: Record<string, string> = {}
    params.forEach((v, k) => { if (k.startsWith('utm_') || k === 'gclid' || k === 'fbclid') utm[k] = v })
    attributionRef.current = { referrer: document.referrer || '', utm }
    setCreditMapHref(withAttributionQuery('/credit-map', params))

    // Deep links, so a result can be shared, bookmarked, or linked from an email
    // or ad straight to a specific school:
    //   /calculator?state=PA&residency=inState&collegeId=214777
    const s = params.get('state')
    const r = params.get('residency')
    if (s && /^[A-Za-z]{2}$/.test(s)) setState(s.toUpperCase())
    if (r === 'inState' || r === 'outOfState') setResidency(r)
    const cid = params.get('collegeId')
    if (cid && /^\d+$/.test(cid)) pendingCollegeIdRef.current = Number(cid)
  }, [])

  useEffect(() => {
    if (!result || !displayAcknowledgement) return
    let cancelled = false
    const acknowledge = async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await acknowledgeResultDisplay(fetch, displayAcknowledgement)
          if (!cancelled) setDisplayAcknowledgement(null)
          return
        } catch {
          // The stable capture identity makes a response-loss retry idempotent.
        }
      }
    }
    void acknowledge()
    return () => { cancelled = true }
  }, [result, displayAcknowledgement])

  useEffect(() => {
    if (captureError) captureErrorRef.current?.focus()
  }, [captureError])

  useEffect(() => {
    if (result) resultHeadingRef.current?.focus()
  }, [result])

  const openEmailModal = useCallback((action: HTMLButtonElement | null) => {
    modalReturnFocusRef.current = action
    restoreModalFocusRef.current = false
    trackCalculatorEvent('Calculator Modal Opened', 'fastrack:analytics:calculator-modal-opened')
    setIsEmailModalOpen(true)
  }, [trackCalculatorEvent])

  const handleEmailModalOpenChange = (open: boolean) => {
    if (!open) restoreModalFocusRef.current = true
    setIsEmailModalOpen(open)
  }

  const handleEmailModalCloseAutoFocus = (event: Event) => {
    event.preventDefault()
    if (restoreModalFocusRef.current) modalReturnFocusRef.current?.focus()
    restoreModalFocusRef.current = false
  }

  useEffect(() => {
    fetch('/api/states')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!Array.isArray(d)) return
        // The API orders by state code, which reads as "Alaska, Alabama,
        // Arkansas, Arizona" once codes become names. Sort on what is displayed.
        setStates([...d].sort((a, b) =>
          (STATE_NAMES[a.state] ?? a.state).localeCompare(STATE_NAMES[b.state] ?? b.state)))
      })
      .catch(() => setStates([]))
  }, [])

  useEffect(() => {
    if (!state) { setColleges([]); setCollege(null); return }
    setCollege(null)
    setResult(null)
    setIsCollegesLoading(true)
    setError(null)
    fetch(`/api/colleges?state=${encodeURIComponent(state)}&full=1`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d) => {
        const list: CollegeOption[] = Array.isArray(d) ? d : []
        setColleges(list)
        // Resolve a deep-linked ?collegeId= once its state's list has arrived.
        const pending = pendingCollegeIdRef.current
        if (pending != null) {
          const match = list.find((c) => c.id === pending)
          if (match) setCollege(match)
          pendingCollegeIdRef.current = null
        }
      })
      .catch(() => {
        setColleges([])
        setError('We could not load colleges for that state. Please try again.')
      })
      .finally(() => setIsCollegesLoading(false))
  }, [state])

  const fetchRoi = useCallback(async (target: CollegeOption, res: 'inState' | 'outOfState', reveal = true) => {
    setIsResultLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/roi?id=${target.id}&residency=${res}`)
      if (!r.ok) throw new Error()
      const roi: RoiResult = await r.json()
      if (reveal) setResult(roi)
      return roi
    } catch {
      setResult(null)
      setError('We could not calculate results for that school. Please try another.')
      return null
    } finally {
      setIsResultLoading(false)
    }
  }, [])

  // Results need a college AND a residency. The old version rendered
  // out-of-state figures whenever residency was still unset.
  useEffect(() => {
    if (!college || !residency) return
    if (getSessionStorageValue(getAnalyticsSessionStorage(window), 'session-capture-ack')) { fetchRoi(college, residency); return }
    if (userIntentRef.current) openEmailModal(modalReturnFocusRef.current)
  }, [college, residency, fetchRoi, openEmailModal])

  const requestResults = () => {
    userIntentRef.current = true
    trackCalculatorEvent('Calculator Intent', 'fastrack:analytics:calculator-intent')
    if (!college || !residency) return
    if (getSessionStorageValue(getAnalyticsSessionStorage(window), 'session-capture-ack')) { fetchRoi(college, residency); return }
    openEmailModal(requestResultsActionRef.current)
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!college || !residency) return
    trackCalculatorEvent('Capture Submission Attempted')
    setIsSubmitting(true)
    setCaptureError(null)
    const fingerprint = JSON.stringify({ email: email.trim().toLowerCase(), phone: phoneNumber.trim(), smsConsent, state, residency, collegeId: college.id, referrer: attributionRef.current.referrer, utm: attributionRef.current.utm })
    const captureId = captureAttemptRef.current?.fingerprint === fingerprint
      ? captureAttemptRef.current.id
      : crypto.randomUUID()
    captureAttemptRef.current = { id: captureId, fingerprint }
    try {
      let headers: Record<string, string> = {}
      if (fixtureCaptureRef.current) {
        const authorizationResponse = await fetch('/api/admin/capture-fixture/authorize', { method: 'POST' })
        if (!authorizationResponse.ok) throw new Error('fixture authorization unavailable')
        const fixtureAuthorization = await authorizationResponse.json()
        if (typeof fixtureAuthorization?.authorization !== 'string') throw new Error('invalid fixture authorization')
        headers = { 'x-fastrack-fixture-authorization': fixtureAuthorization.authorization }
      }
      await completeCapture({
        fetcher: fetch,
        headers,
        payload: {
          captureId, email, phone: phoneNumber, smsConsent, state, residency,
          collegeId: college.id, referrer: attributionRef.current.referrer,
          utm: attributionRef.current.utm, website,
        },
        onAcknowledged: ({ roi }: { roi: RoiResult }) => {
          const storage = getAnalyticsSessionStorage(window)
          setSessionStorageValue(storage, 'session-capture-ack', '1')
          removeSessionStorageValue(storage, 'session-email')
          trackCalculatorEvent('Lead Captured', 'fastrack:analytics:lead-captured')
          setResult(roi)
          setDisplayAcknowledgement(captureId)
          setIsEmailModalOpen(false)
          captureAttemptRef.current = null
        },
      })
    } catch (error) {
      trackCalculatorEvent('Capture Failed')
      setResult(null)
      setCaptureError(captureRequestFailureMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const navLinks = [['/', 'Home'], ['/credit-map', 'Credit Map']]

  const hint = !state ? 'Choose a state to begin.'
    : !residency ? 'Now choose your residency status.'
    : !college ? 'Now pick a college. You can type to search.'
    : ''

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-[#080b53] antialiased">
      <header className="bg-[#080b53] sticky top-0 z-40">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image src="/logo.png" alt="Fastrack" width={140} height={40} className="h-9 w-auto" priority />
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(([href, label]) => (
              <Link key={href} href={href}
                className="px-3 py-2 text-sm font-medium text-white/80 hover:text-white transition-colors">
                {label}
              </Link>
            ))}
          </nav>
          <button className="md:hidden text-white p-2 -mr-2" onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label="Toggle menu">
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {isMenuOpen && (
          <nav className="md:hidden border-t border-white/10 px-5 pb-3 pt-1">
            {navLinks.map(([href, label]) => (
              <Link key={href} href={href} className="block py-2.5 text-sm font-medium text-white/80">{label}</Link>
            ))}
          </nav>
        )}
      </header>

      {/* Caps at 4xl on laptops but keeps growing a little on large monitors and
          TVs, where a 768px column stranded in the middle of a 2560px screen
          looks broken. Type scales with it. */}
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-12 lg:max-w-4xl lg:py-16 2xl:max-w-5xl">
        <header className="mb-8 sm:mb-10">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#605dba] sm:text-xs">
            Free Tool &middot; College Cost Calculator
          </p>
          <h1 className="text-[1.75rem] font-bold leading-[1.15] tracking-tight text-[#080b53] sm:text-4xl lg:text-[2.75rem] 2xl:text-5xl">
            Compare a college&rsquo;s four-year cost with a modeled dual-credit path.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Pick a school to see the assumptions, estimated cost difference, and time-to-recoup comparison.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
            The model assumes 60 dual-credit hours at $80 per credit and two years enrolled at the selected college.
            Transfer, degree fit, residency, course availability, aid, and timing vary.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            College Scorecard net price is an average for federal-aid recipients, not your family&rsquo;s personalized aid
            offer. Earnings figures use two years of College Scorecard median post-enrollment earnings; they are not a
            wage forecast.
          </p>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field id="state-label" label="State">
              <Select name="state" required value={state || undefined} onValueChange={(v) => { userIntentRef.current = true; trackCalculatorEvent('Calculator Intent', 'fastrack:analytics:calculator-intent'); setState(v) }}>
                <SelectTrigger aria-labelledby="state-label" aria-required="true" className="h-12 w-full rounded-lg border-slate-300 bg-white text-base text-[#080b53] focus:ring-2 focus:ring-[#605dba]/30">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {states.map((s) => (
                    <SelectItem key={s.state} value={s.state}>{STATE_NAMES[s.state] ?? s.state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field id="residency-label" label="Residency">
              <Select name="residency" required value={residency || undefined} onValueChange={(v) => { userIntentRef.current = true; trackCalculatorEvent('Calculator Intent', 'fastrack:analytics:calculator-intent'); modalReturnFocusRef.current = residencyActionRef.current; setResidency(v as 'inState' | 'outOfState') }}>
                <SelectTrigger ref={residencyActionRef} aria-labelledby="residency-label" aria-required="true" className="h-12 w-full rounded-lg border-slate-300 bg-white text-base text-[#080b53] focus:ring-2 focus:ring-[#605dba]/30">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inState">In state</SelectItem>
                  <SelectItem value="outOfState">Out of state</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field id="college-label" label="College">
              <CollegeCombobox
                options={colleges}
                value={college}
                onChange={(c) => { userIntentRef.current = true; trackCalculatorEvent('Calculator Intent', 'fastrack:analytics:calculator-intent'); modalReturnFocusRef.current = collegeActionRef.current; setCollege(c) }}
                disabled={!state}
                loading={isCollegesLoading}
                placeholder={state ? 'Select' : 'Pick a state first'}
                emptyLabel={`No colleges found in ${STATE_NAMES[state] ?? state}`}
                labelId="college-label"
                onActionReady={(action) => { collegeActionRef.current = action }}
              />
            </Field>
          </div>

          {hint && !isResultLoading && <p role="status" aria-live="polite" className="mt-4 text-sm text-slate-500">{hint}</p>}

          {college && residency && !result && !isResultLoading && (
            <div className="mt-5 flex justify-center">
              <button
                ref={requestResultsActionRef}
                type="button"
                onClick={requestResults}
                className="rounded-lg bg-[#605dba] px-8 py-3 text-base font-semibold text-white hover:bg-[#4e4a9e]"
              >
                See my savings, free
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 border border-red-200">{error}</p>
          )}
        </section>

        {isResultLoading && (
          <div role="status" aria-live="polite" aria-busy="true" className="mt-8 space-y-3">
            <span className="sr-only">Calculating your results.</span>
            <div className="h-48 rounded-xl border border-slate-200 bg-white animate-pulse" />
            <div className="h-24 rounded-xl border border-slate-200 bg-white animate-pulse" />
          </div>
        )}

        {result && !isResultLoading && (
          <div className="mt-8 space-y-6">
            {/* One aligned comparison rather than two floating cards. Same rows,
                same baseline, so the eye reads across and the gap is the point. */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 ref={resultHeadingRef} tabIndex={-1} className="text-lg font-semibold tracking-tight focus:outline-none">{result.college.name}</h2>
                {result.college.city && (
                  <p className="text-sm text-slate-500">
                    {result.college.city}, {result.college.state} &middot;{' '}
                    {result.residency === 'inState' ? 'In state' : 'Out of state'}
                  </p>
                )}
              </div>

              {/* The label column is dropped below `sm`. At 375px a three-column
                  layout squeezes six-figure numbers into two characters per line;
                  stacking the label above the pair keeps the comparison readable. */}
              <table className="w-full table-fixed">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70">
                    <th className="hidden w-2/5 px-5 py-3 sm:table-cell" />
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-600 sm:px-5 sm:text-xs">
                      Four years
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#1a6b3c] sm:px-5 sm:text-xs">
                      Modeled dual-credit scenario
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['Total cost of the degree', money(result.standard.totalCost), money(result.fastrack.totalCost)],
                    ['Years of income to earn it back', result.standard.recoupLabel, result.fastrack.recoupLabel],
                  ] as const).map(([label, a, b], i) => (
                    <React.Fragment key={label}>
                      <tr className="sm:hidden">
                        <td colSpan={2} className={`px-4 pt-4 text-sm text-slate-600 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                          {label}
                        </td>
                      </tr>
                      <tr className={i > 0 ? 'sm:border-t sm:border-slate-100' : ''}>
                        <td className="hidden px-5 py-4 text-sm text-slate-600 sm:table-cell">{label}</td>
                        <td className="px-4 pb-4 pt-1 text-right text-lg font-semibold tabular-nums text-[#080b53] sm:px-5 sm:py-4 sm:text-2xl lg:text-[1.75rem]">
                          {a}
                        </td>
                        <td className="px-4 pb-4 pt-1 text-right text-lg font-semibold tabular-nums text-[#1a6b3c] sm:px-5 sm:py-4 sm:text-2xl lg:text-[1.75rem]">
                          {b}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-xl bg-[#080b53] px-6 py-7 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Estimated scenario advantage</p>
              <p className="mt-1.5 text-4xl md:text-5xl font-bold tracking-tight tabular-nums">
                {money(result.totalAdvantage)}
              </p>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 border-t border-white/15 pt-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-white/70">Modeled cost difference</span>
                  <span className="text-base font-semibold tabular-nums">{money(result.savings)}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-white/70">Two modeled years of median earnings</span>
                  <span className="text-base font-semibold tabular-nums">{money(result.earlyEarnings)}</span>
                </div>
              </div>
            </section>

            {/* Grid gap + inner borders rather than `divide-*`, which only draws
                between DOM siblings and so leaves the 2-column mobile layout with
                horizontal rules but no vertical one. */}
            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
              {([
                ['Cost per year', money(result.annualCost)],
                ['Scorecard median earnings', money(result.averageSalary)],
                ['Cost of living', money(result.costOfLiving)],
                ['Left over yearly', money(result.discretionaryIncome)],
              ] as const).map(([label, value]) => (
                <div key={label} className="bg-white px-4 py-4 sm:px-5">
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 sm:text-xs">{label}</p>
                  <p className="mt-1 text-base font-semibold tabular-nums sm:text-lg">{value}</p>
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-[#605dba]/30 bg-[#605dba]/5 px-6 py-7 text-center">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight">
                Modeled difference: {money(result.totalAdvantage)} across a {result.yearsSaved}-year scenario.
              </h2>
              <p className="mx-auto mt-2.5 max-w-lg text-slate-600 leading-relaxed">
                This is an estimate, not a promised result. Credits must transfer and apply to the intended degree,
                and a receiving college can change or interpret its rules. A two-year path may not be available.
              </p>
              <Link href={creditMapHref} className="mt-5 inline-block">
                <Button className="h-12 rounded-lg bg-[#605dba] px-7 text-base font-semibold text-white hover:bg-[#080b53] transition-colors">
                  Explore the $497 Credit Map
                </Button>
              </Link>
            </section>

            <ul className="space-y-1.5 text-sm leading-relaxed text-slate-600">
              {result.notes.map((n) => <li key={n}>{n}</li>)}
              <li>
                Cost and earnings data from the U.S. Department of Education College Scorecard. Net price is an average
                for federal-aid recipients, not a personalized aid offer. The early-earnings and total-advantage figures
                add two years of Scorecard median post-enrollment earnings and are not an individual wage forecast.
                The modeled scenario assumes {result.fastrack.years} years of enrollment plus 60 dual-credit
                hours at $80 per credit. Individual results vary with residency, aid, state, school, degree,
                transfer decisions, course availability, and course selection.
              </li>
            </ul>
          </div>
        )}
      </main>

      {/* Navy, not white, the logo artwork is white and disappears on a light ground. */}
      <footer className="mt-auto bg-[#080b53] pt-0">
        <div className="mx-auto max-w-6xl px-5 py-10 flex flex-col items-center gap-4 text-center">
          <Image src="/logo.png" alt="Fastrack" width={140} height={40} className="h-8 w-auto" />
          <address className="not-italic text-sm leading-relaxed text-white/60">
            1007 N Orange St, Wilmington, Delaware<br />
            <a href="mailto:info@fastrack.school" className="hover:text-white">info@fastrack.school</a>
          </address>
          <Link href="/privacypolicy" className="text-xs text-white/40 hover:text-white">Privacy Policy</Link>
        </div>
      </footer>

      <Dialog open={isEmailModalOpen} onOpenChange={handleEmailModalOpenChange}>
        <DialogContent onCloseAutoFocus={handleEmailModalCloseAutoFocus} className="sm:max-w-md rounded-xl border-slate-200 bg-white p-6">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="text-xl font-bold tracking-tight text-[#080b53]">
              Where should we send your results?
            </DialogTitle>
            <DialogDescription className="text-slate-600 leading-relaxed">
              Your numbers appear as soon as you submit. We&apos;ll also email you a copy along with
              a short series on how families actually capture these savings.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEmailSubmit} className="mt-2 space-y-4">
            <div className="hidden" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input id="website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                Email
              </label>
              <Input id="email" name="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailInvalid(false) }}
                onInvalid={() => setEmailInvalid(true)} aria-invalid={emailInvalid || undefined}
                aria-describedby={emailInvalid ? 'email-error' : undefined}
                placeholder="you@example.com" required autoComplete="email" inputMode="email"
                className="h-11 rounded-lg border-slate-300 text-base" />
              {emailInvalid && <p id="email-error" role="alert" className="text-sm text-red-700">Enter a valid email address.</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="phone" className="block text-xs font-medium uppercase tracking-wider text-slate-500">
                Phone <span className="normal-case tracking-normal text-slate-400">(optional)</span>
              </label>
              <Input id="phone" name="phone" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="(555) 123-4567" autoComplete="tel" inputMode="tel"
                className="h-11 rounded-lg border-slate-300 text-base" />
            </div>

            {phoneNumber.trim() && (
              <label className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3 cursor-pointer">
                <input name="smsConsent" type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#605dba] focus:ring-[#605dba]" />
                <span className="text-sm leading-relaxed text-slate-600">
                  Text me my results and occasional college-planning tips. Message and data rates may
                  apply. Reply STOP at any time to opt out.
                </span>
              </label>
            )}

            {captureError && (
              <p ref={captureErrorRef} tabIndex={-1} role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 focus:outline-none">{captureError}</p>
            )}

            <Button type="submit" disabled={isSubmitting}
              className="h-11 w-full rounded-lg bg-[#605dba] text-base font-semibold text-white hover:bg-[#080b53] transition-colors disabled:opacity-60">
              {isSubmitting ? 'Calculating…' : 'Show my results'}
            </Button>

            <p className="text-center text-sm leading-relaxed text-slate-600">
              We never sell your information. <Link href="/privacypolicy" className="underline hover:text-[#605dba]">Privacy Policy</Link>
            </p>
          </form>
        </DialogContent>
      </Dialog>

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
      {isProductionAnalyticsHost && (
        <>
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
        </>
      )}
    </div>
  )
}
