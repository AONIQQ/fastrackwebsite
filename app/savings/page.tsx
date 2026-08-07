import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { STATE_NAMES, stateSlug } from '@/lib/states'

export const metadata: Metadata = {
  title: 'Dual Credit College Savings by State | Fastrack',
  description:
    'See what families actually pay for college in every state, and how much dual enrollment in high school can save, with real U.S. Department of Education net-price data.',
}

export default function SavingsIndex() {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="bg-[#080b53] text-white p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="Fastrack Logo" width={180} height={180} className="rounded-full" />
          </Link>
          <nav className="hidden md:flex items-center space-x-6 text-base">
            <Link href="/calculator" className="hover:text-blue-200">Calculator</Link>
            <Link href="/credit-map" className="hover:text-blue-200">Credit Map</Link>
            <Link href="/guide" className="hover:text-blue-200">Guide</Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16 pb-24">
        <h1 className="mx-auto max-w-3xl text-center text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
          Dual credit savings, state by state
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg text-gray-700">
          Pick your state to see what college actually costs there, real net-price data for every major school, and
          how much of it your student can avoid by earning college credit in high school.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Object.keys(STATE_NAMES).map((code) => (
            <Link
              key={code}
              href={`/savings/${stateSlug(code)}`}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 font-medium text-[#080b53] shadow-sm hover:border-[#605dba] hover:text-[#605dba]"
            >
              {STATE_NAMES[code]}
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
