'use client'

import { useState } from 'react'

const buttonClasses = 'inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-semibold text-[#080b53] shadow-lg transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-70'

export function GuideCheckoutButton({ checkoutRef, fallbackUrl }: { checkoutRef: string | null; fallbackUrl: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function openCheckout() {
    if (!checkoutRef) { window.location.assign(fallbackUrl); return }
    setLoading(true)
    setError('')
    try {
      const body = JSON.stringify({ checkout_ref: checkoutRef })
      const response = await fetch('/api/checkout/guide', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body,
      })
      const data = await response.json()
      if (!response.ok || typeof data.url !== 'string') throw new Error('unavailable')
      window.location.assign(data.url)
    } catch {
      setError('The checkout could not be opened. Please try again.')
      setLoading(false)
    }
  }

  if (!checkoutRef) return <a href={fallbackUrl} className={`${buttonClasses} mt-8`}>Continue to the Fastrack Guide checkout ($47)</a>

  return (
    <div className="mt-8">
      <button type="button" onClick={openCheckout} disabled={loading} className={buttonClasses}>
        {loading ? 'Preparing checkout…' : 'Continue to the Fastrack Guide checkout ($47)'}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
    </div>
  )
}
