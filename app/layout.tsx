import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://www.fastrack.school'),
  title: 'Fastrack',
  description: 'Dual credit planning that helps high school students earn real college credit, graduate sooner, and save on tuition.',
  openGraph: {
    title: 'Fastrack',
    description: 'Free tools and done-for-you plans that help students earn real college credit in high school, graduate sooner, and save on tuition.',
    url: 'https://www.fastrack.school',
    siteName: 'Fastrack',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fastrack',
    description: 'Free tools and done-for-you plans that help students earn college credit in high school and save on tuition.',
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