import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://www.fastrack.school'),
  title: 'Fastrack',
  description: 'Free college-cost scenarios and sourced dual-credit planning for families comparing college options.',
  openGraph: {
    title: 'Fastrack',
    description: 'Free college-cost scenarios and sourced dual-credit planning for families comparing college options.',
    url: 'https://www.fastrack.school',
    siteName: 'Fastrack',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fastrack',
    description: 'Free college-cost scenarios and sourced dual-credit planning for families comparing college options.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
