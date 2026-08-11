import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Free College Savings Calculator | Fastrack',
  description:
    'A free calculator: pick any of 6,000+ U.S. colleges and see what a degree really costs, and how much your family saves when your student earns college credit in high school.',
  alternates: {
    canonical: '/calculator',
  },
  openGraph: {
    title: 'Free College Savings Calculator',
    description:
      'See what a degree really costs at 6,000+ colleges, and what dual credit in high school saves. Free, no signup to browse.',
    url: 'https://www.fastrack.school/calculator',
    siteName: 'Fastrack',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free College Savings Calculator',
    description:
      'See what a degree really costs at 6,000+ colleges, and what dual credit in high school saves. Free.',
  },
}

export default function CalculatorLayout({ children }: { children: ReactNode }) {
  return children
}
