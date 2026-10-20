'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { withAttributionQuery } from '@/lib/attribution-url.mjs'

export default function SiteHeader() {
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [offerHref, setOfferHref] = useState('/credit-map')

  useEffect(() => {
    setOfferHref(withAttributionQuery('/credit-map', window.location.search))
  }, [])

  const links = [
    { href: offerHref, path: '/credit-map', label: 'Credit Map' },
    { href: '/calculator', path: '/calculator', label: 'Calculator' },
  ]
  const isActive = (path: string) => pathname === path || pathname?.startsWith(`${path}/`)

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-6">
        <Link href="/" aria-label="Fastrack home">
          <Image src="/logo-color.png" alt="Fastrack" width={160} height={37} className="h-8 w-auto" priority />
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {links.map((link) => (
            <Link
              key={link.path}
              href={link.href}
              aria-current={isActive(link.path) ? 'page' : undefined}
              className={`text-[15px] font-medium transition-colors ${
                isActive(link.path) ? 'text-[#605dba]' : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="-mr-2 p-2 text-gray-900 md:hidden"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label="Toggle menu"
          aria-expanded={isMenuOpen}
        >
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {isMenuOpen && (
        <nav className="border-t border-gray-200 px-5 pb-3 md:hidden" aria-label="Main">
          {links.map((link) => (
            <Link key={link.path} href={link.href} className="block py-3 text-base font-medium text-gray-800">
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
