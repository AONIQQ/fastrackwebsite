import Image from 'next/image'
import Link from 'next/link'

export default function SiteFooter() {
  return (
    <footer className="mt-auto bg-[#080b53]">
      <div className="mx-auto max-w-6xl px-5 py-10 flex flex-col items-center gap-4 text-center">
        <Image src="/logo.png" alt="Fastrack" width={140} height={40} className="h-8 w-auto" />
        <address className="not-italic text-sm leading-relaxed text-white/60">
          1007 N Orange St, Wilmington, Delaware<br />
          <a href="mailto:info@fastrack.school" className="hover:text-white">info@fastrack.school</a>
        </address>
        <Link href="/privacypolicy" className="text-xs text-white/40 hover:text-white">Privacy Policy</Link>
      </div>
    </footer>
  )
}
