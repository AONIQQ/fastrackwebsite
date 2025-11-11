'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Menu, X } from 'lucide-react'

const policyHighlights = [
  {
    title: 'Transparency First',
    description: 'Know exactly what information we collect and the purpose behind every data point.',
  },
  {
    title: 'Secure By Design',
    description: 'We apply administrative and technical safeguards to keep your information protected.',
  },
  {
    title: 'You Stay in Control',
    description: 'Contact us any time to review, update, or remove the information you have shared.',
  },
]

const policySections = [
  {
    title: '1. Introduction',
    paragraphs: [
      'This Privacy Policy outlines how we handle your personal and non-personal information when you use our Service.',
      'Your continued use of our Service signifies your acceptance of this policy.',
    ],
  },
  {
    title: '2. Information Collection',
    subsections: [
      {
        subtitle: '2.1. Personal Identification Information',
        paragraphs: [
          'We may collect personal identification information from Users in a variety of ways, including, but not limited to, when Users visit our site, register on the site, place an order, subscribe to the newsletter, respond to a survey, fill out a form, and in connection with other activities, services, features, or resources we make available on our Site. Users may be asked for, as appropriate, name, email address, mailing address, and phone number. Users may, however, visit our Site anonymously. We will collect personal identification information from Users only if they voluntarily submit such information to us.',
        ],
      },
      {
        subtitle: '2.2. Non-Personal Identification Information',
        paragraphs: [
          "We may collect non-personal identification information about Users whenever they interact with our Site. Non-personal identification information may include the browser name, the type of computer, and technical information about Users' means of connection to our Site, such as the operating system and the Internet service providers utilized and other similar information.",
        ],
      },
    ],
  },
  {
    title: '3. Information Usage',
    paragraphs: ['We use collected information for the following purposes:'],
    list: [
      'To provide and improve our Service',
      'To communicate with you about changes to our services, updates, and promotional offers',
      'To provide customer support',
      'To monitor the usage of our Service',
      'To detect, prevent, and address technical issues',
    ],
  },
  {
    title: '4. Information Protection',
    paragraphs: [
      'We adopt appropriate data collection, storage, and processing practices and security measures to protect against unauthorized access, alteration, disclosure, or destruction of your personal information, username, password, transaction information, and data stored on our Site.',
    ],
  },
  {
    title: '5. Sharing Personal Information',
    paragraphs: [
      "We do not sell, trade, or rent Users' personal identification information to others. We may share generic aggregated demographic information not linked to any personal identification information regarding visitors and users with our business partners, trusted affiliates, and advertisers for the purposes outlined above.",
    ],
  },
  {
    title: '6. Third-Party Websites',
    paragraphs: [
      'Users may find advertising or other content on our Site that link to the sites and services of our partners, suppliers, advertisers, sponsors, licensors, and other third parties. We do not control the content or links that appear on these sites and are not responsible for the practices employed by websites linked to or from our Site.',
    ],
  },
  {
    title: '7. Changes to this Privacy Policy',
    paragraphs: [
      'FASTRACK EDU LLC has the discretion to update this privacy policy at any time. When we do, we will post a notification on the main page of our Site and send you an email. We encourage Users to frequently check this page for any changes to stay informed about how we are helping to protect the personal information we collect.',
    ],
  },
  {
    title: '8. Your Acceptance of These Terms',
    paragraphs: [
      'By using this Site, you signify your acceptance of this policy. If you do not agree to this policy, please do not use our Site. Your continued use of the Site following the posting of changes to this policy will be deemed your acceptance of those changes.',
    ],
  },
  {
    title: '9. Contacting Us',
    paragraphs: [
      'If you have any questions about this Privacy Policy, the practices of this site, or your dealings with this site, please contact us:',
    ],
    contact: ['FASTRACK EDU LLC', 'info@fastrack.school'],
    footerNote: 'This document was last updated on June 22, 2023.',
  },
]

export default function PrivacyPolicy() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const toggleMenu = () => {
    setIsMenuOpen((prev) => !prev)
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 transition-colors duration-300">
      <header className="bg-[#080b53] text-white p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/" className="flex items-center space-x-2">
            <Image src="/logo.png" alt="Fastrack Logo" width={180} height={180} className="rounded-full" />
          </Link>
          <nav className="hidden md:flex items-center space-x-4">
            <Link href="/">
              <Button variant="ghost" className="text-white text-base">
                Home
              </Button>
            </Link>
            <Link href="/student">
              <Button variant="ghost" className="text-white text-base">
                Student
              </Button>
            </Link>
            <Link href="/guide">
              <Button variant="ghost" className="text-white text-base">
                Guide
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost" className="text-white text-base">
                Pricing
              </Button>
            </Link>
          </nav>
          <Button
            variant="ghost"
            className="md:hidden text-white p-2"
            onClick={toggleMenu}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
        {isMenuOpen && (
          <div className="md:hidden mt-4 flex flex-col items-center space-y-2">
            <Link href="/" className="w-full flex justify-center">
              <Button variant="ghost" className="text-white text-base">
                Home
              </Button>
            </Link>
            <Link href="/student" className="w-full flex justify-center">
              <Button variant="ghost" className="text-white text-base">
                Student
              </Button>
            </Link>
            <Link href="/guide" className="w-full flex justify-center">
              <Button variant="ghost" className="text-white text-base">
                Guide
              </Button>
            </Link>
            <Link href="/pricing" className="w-full flex justify-center">
              <Button variant="ghost" className="text-white text-base">
                Pricing
              </Button>
            </Link>
          </div>
        )}
      </header>

      <main className="container mx-auto px-4 py-12 md:py-16">
        <section className="max-w-4xl mx-auto text-center space-y-4">
          <p className="uppercase tracking-[0.3em] text-xs sm:text-sm text-[#605dba]">Privacy Policy</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#080b53]">
            Privacy Policy for FASTRACK EDU LLC
          </h1>
          <p className="text-sm sm:text-base text-gray-500">Last updated: June 22, 2023</p>
          <p className="text-base sm:text-lg text-gray-700">
            This Privacy Policy governs the way FASTRACK EDU LLC (&quot;us&quot;, &quot;we&quot;, or &quot;our&quot;) collects, uses, maintains, and
            discloses information collected from users (each, a &quot;User&quot;) of our college advisory services (&quot;Service&quot;).
          </p>
          <p className="text-base sm:text-lg text-gray-700">
            Please read this Privacy Policy carefully to understand our policies and practices regarding your information
            and how we will treat it. By accessing or using our Service, you agree to this Privacy Policy.
          </p>
        </section>

        <section className="mt-12">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {policyHighlights.map((highlight) => (
              <div
                key={highlight.title}
                className="rounded-xl bg-[#605dba] text-white p-6 shadow-lg border border-[#4f4cab]"
              >
                <h3 className="text-xl font-semibold">{highlight.title}</h3>
                <p className="mt-3 text-sm sm:text-base text-blue-100">{highlight.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 space-y-6">
          {policySections.map((section) => (
            <Card key={section.title} className="rounded-xl bg-white shadow-lg border border-gray-200">
              <CardHeader>
                <CardTitle className="text-2xl font-semibold text-[#080b53]">{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-base text-gray-700">
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.subsections?.map((subsection) => (
                  <div key={subsection.subtitle} className="space-y-2">
                    <h3 className="text-lg font-semibold text-[#080b53]">{subsection.subtitle}</h3>
                    {subsection.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                ))}
                {section.list && (
                  <ul className="list-disc pl-6 space-y-2">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {section.contact && (
                  <address className="not-italic space-y-1">
                    {section.contact.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </address>
                )}
                {section.footerNote && <p className="text-sm text-gray-500">{section.footerNote}</p>}
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="bg-[#080b53] text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center">
            <Image src="/logo.png" alt="Fastrack Logo" width={200} height={200} className="mb-4" />
            <address className="text-center not-italic text-sm sm:text-base">
              1007 N Orange St<br />
              Wilmington, Delaware<br />
              info@fastrack.school
            </address>
            <Link href="/privacypolicy" className="mt-4 text-sm underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
