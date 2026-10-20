import Link from 'next/link'
import type { Metadata } from 'next'
import SiteFooter from '@/components/SiteFooter'
import { STATE_NAMES, stateSlug } from '@/lib/states'
import SiteHeader from '@/components/SiteHeader'

export const metadata: Metadata = {
  title: 'Dual Credit College Savings by State | Fastrack',
  description:
    'See what families actually pay for college in every state, and how much dual enrollment in high school can save, with real U.S. Department of Education net-price data.',
}

export default function SavingsIndex() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-100 text-gray-900">
      <SiteHeader />

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
              className="rounded-lg border border-gray-200 bg-white px-4 py-3 font-medium text-gray-900 shadow-sm hover:border-[#605dba] hover:text-[#605dba]"
            >
              {STATE_NAMES[code]}
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
