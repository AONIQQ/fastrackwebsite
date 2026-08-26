'use client'

import { FormEvent, useState } from 'react'

export function CreditMapIntakeForm() {
  const [complete, setComplete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const body = Object.fromEntries(form.entries())
    try {
      const response = await fetch('/api/credit-map/intake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save your intake')
      setComplete(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save your intake')
    } finally { setBusy(false) }
  }
  if (complete) return <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-950">
    <h2 className="text-2xl font-bold">Your intake is saved</h2>
    <p className="mt-3">We will use these details to prepare your spreadsheet and PDF. Delivery is within 7 business days, and no call is required.</p>
  </div>
  return <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <div><label className="font-semibold" htmlFor="student_grade">Student grade</label><select required id="student_grade" name="student_grade" className="mt-1 w-full rounded border p-3"><option value="">Select</option>{['9','10','11','12'].map((g)=><option key={g} value={g}>Grade {g}</option>)}<option value="graduated">Graduated</option></select></div>
    <div><label className="font-semibold" htmlFor="current_school_program">Current high school or homeschool program</label><input required id="current_school_program" name="current_school_program" minLength={2} maxLength={240} className="mt-1 w-full rounded border p-3" /></div>
    <div><label className="font-semibold" htmlFor="graduation_year">Expected high-school graduation year</label><input required id="graduation_year" name="graduation_year" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} placeholder="2027" className="mt-1 w-full rounded border p-3" /></div>
    <div><label className="font-semibold" htmlFor="state">Home state</label><input required id="state" name="state" maxLength={2} placeholder="FL" className="mt-1 w-full rounded border p-3 uppercase" /></div>
    <div><label className="font-semibold" htmlFor="dual_enrollment_provider">Current or planned dual-enrollment college/provider</label><input required id="dual_enrollment_provider" name="dual_enrollment_provider" minLength={2} maxLength={240} placeholder="Enter Not enrolled yet if none" className="mt-1 w-full rounded border p-3" /></div>
    <div><label className="font-semibold" htmlFor="target_college">Target four-year college or university</label><input required id="target_college" name="target_college" minLength={2} maxLength={240} className="mt-1 w-full rounded border p-3" /></div>
    <div><label className="font-semibold" htmlFor="intended_major">Intended major</label><input required id="intended_major" name="intended_major" maxLength={160} placeholder="Enter undecided if not yet chosen" className="mt-1 w-full rounded border p-3" /></div>
    <div><label className="font-semibold" htmlFor="current_dual_credit">Current dual-credit courses or credits</label><textarea required id="current_dual_credit" name="current_dual_credit" maxLength={2000} rows={5} placeholder="List completed and in-progress courses, or enter None" className="mt-1 w-full rounded border p-3" /></div>
    <div><label className="font-semibold" htmlFor="planning_context">Optional planning context</label><textarea id="planning_context" name="planning_context" maxLength={2000} rows={4} placeholder="Scheduling limits or other details we should account for" className="mt-1 w-full rounded border p-3" /></div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
    <button disabled={busy} className="w-full rounded bg-[#605dba] px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? 'Saving...' : 'Start my Credit Map'}</button>
  </form>
}
