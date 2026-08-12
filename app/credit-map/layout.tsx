import type { Metadata } from 'next'
import type { ReactNode } from 'react'

const title = 'Sourced Dual Credit Plan | Fastrack Credit Map'
const description =
  'Review the $497 Fastrack Credit Map: a term-by-term plan with source links, open questions, and items to confirm with the receiving college.'

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/credit-map',
  },
  openGraph: {
    title,
    description,
    url: 'https://www.fastrack.school/credit-map',
    siteName: 'Fastrack',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

export default function CreditMapLayout({ children }: { children: ReactNode }) {
  return children
}
