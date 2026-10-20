import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Free college savings calculator by Fastrack'

export default async function Image() {
  const logo = await fetch(new URL('../../public/logo-color.png', import.meta.url)).then((res) => res.arrayBuffer())
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
          color: '#111827',
          fontFamily: 'Arial',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={logo as unknown as string} width={320} height={73} style={{ marginBottom: 36 }} />
        <div style={{ fontSize: 40, color: '#605dba', textTransform: 'uppercase', letterSpacing: 6 }}>Free Tool</div>
        <div style={{ fontSize: 68, fontWeight: 700, marginTop: 20, textAlign: 'center', maxWidth: 1000 }}>
          What does college really cost your family?
        </div>
        <div style={{ fontSize: 34, marginTop: 28, color: '#4b5563' }}>
          6,000+ colleges &middot; real federal data &middot; fastrack.school/calculator
        </div>
      </div>
    ),
    size,
  )
}
