import Image from 'next/image'
import Link from 'next/link'

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-gray-100">
      <div className="mx-auto max-w-6xl px-5 py-10 flex flex-col items-center gap-4 text-center">
        <Image src="/logo-color.png" alt="Fastrack" width={140} height={40} className="h-8 w-auto" />
        <address className="not-italic text-sm leading-relaxed text-gray-600">
          1007 N Orange St, Wilmington, Delaware<br />
          <a href="mailto:info@fastrack.school" className="hover:text-gray-900">info@fastrack.school</a>
        </address>
        <Link href="/privacypolicy" className="text-xs text-gray-500 hover:text-gray-900">Privacy Policy</Link>
      </div>
    </footer>
  )
}
