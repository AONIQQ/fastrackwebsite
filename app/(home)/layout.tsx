import type { Metadata } from 'next'

const title = 'College Cost & Dual Credit Tools | Fastrack'
const description =
  "Explore Fastrack's free college savings calculator and sourced dual-credit planning for 11th- and 12th-grade students considering a target college."

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title,
    description,
    url: 'https://www.fastrack.school/',
    siteName: 'Fastrack',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return children
}
