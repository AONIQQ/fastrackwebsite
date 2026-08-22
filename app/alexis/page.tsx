import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ALEXIS_CREATOR_PLATFORMS,
  ALEXIS_CREATOR_VIDEOS,
  alexisCreatorPlatform,
} from '@/lib/alexis-creator.mjs'

export const metadata: Metadata = {
  title: 'Alexis Fastrack Videos',
  description: 'Choose the Fastrack video you watched and open the free college cost calculator.',
  robots: { index: false, follow: true },
}

export default function AlexisCreatorHub({
  searchParams,
}: {
  searchParams: { source?: string }
}) {
  const platform = alexisCreatorPlatform(searchParams.source)

  return (
    <main className="min-h-screen bg-[#080b53] px-4 py-10 text-white">
      <section className="mx-auto max-w-xl rounded-3xl bg-white p-6 text-[#080b53] shadow-2xl sm:p-8">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#605dba]">@alexisfastrack</p>
        <h1 className="mt-3 text-3xl font-black">Which video brought you here?</h1>
        <p className="mt-3 text-base leading-7 text-slate-700">
          Choose the topic you watched. We will open Fastrack&rsquo;s free college cost calculator and use the selection only to measure which videos help families.
        </p>

        {!platform && (
          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="font-bold text-amber-950">Choose where you saw Alexis</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {ALEXIS_CREATOR_PLATFORMS.filter((item) => item !== 'youtube').map((item) => (
                <Link key={item} href={`/alexis?source=${item}`} className="min-h-11 rounded-lg bg-[#605dba] px-4 py-3 text-center font-bold capitalize text-white hover:bg-[#080b53]">
                  {item}
                </Link>
              ))}
            </div>
          </div>
        )}

        {platform && (
          <>
            <p className="mt-6 text-sm font-bold uppercase tracking-wide text-[#605dba]">From {platform}</p>
            <div className="mt-3 grid gap-3">
              {ALEXIS_CREATOR_VIDEOS.map((video) => (
                <Link
                  key={video.id}
                  href={`/alexis/${video.id}?source=${platform}`}
                  className="flex min-h-14 items-center gap-4 rounded-xl border-2 border-[#605dba] px-4 py-3 font-bold hover:bg-[#f0f0f8]"
                >
                  <span className="rounded-md bg-[#605dba] px-2 py-1 text-xs text-white">{video.id.toUpperCase()}</span>
                  <span>{video.label}</span>
                </Link>
              ))}
            </div>
            <Link href="/alexis" className="mt-6 inline-block text-sm font-semibold text-[#605dba] underline">Change platform</Link>
          </>
        )}
      </section>
    </main>
  )
}
