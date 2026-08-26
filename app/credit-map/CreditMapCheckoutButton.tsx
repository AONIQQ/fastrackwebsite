'use client'

import { useState } from 'react'
import { track } from '@vercel/analytics'
import { Button } from '@/components/ui/button'

export function CreditMapCheckoutButton() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function begin() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const checkoutRef = new URLSearchParams(window.location.search).get('checkout_ref')
      const response = await fetch('/api/checkout/credit-map', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkout_ref: checkoutRef }),
      })
      const body = await response.json()
      if (!response.ok || typeof body.url !== 'string') throw new Error('checkout')
      track('Checkout Click')
      window.location.assign(body.url)
    } catch {
      setLoading(false)
      setError('Checkout could not be opened. Please try again.')
    }
  }
  return <div>
    <Button onClick={begin} disabled={loading} className="bg-white text-[#080b53] hover:bg-blue-100 font-semibold px-8 py-6 text-lg">
      {loading ? 'Opening secure checkout...' : 'Get Your Credit Map ($497)'}
    </Button>
    {error && <p role="alert" className="mt-3 text-sm text-red-200">{error}</p>}
  </div>
}
