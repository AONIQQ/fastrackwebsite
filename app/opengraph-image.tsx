import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Fastrack: earn college credit in high school, save on tuition'

export default async function Image() {
  const logo = await fetch(new URL('../public/logo-color.png', import.meta.url)).then((res) => res.arrayBuffer())
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
        <img src={logo as unknown as string} width={560} height={128} />
        <div style={{ fontSize: 36, marginTop: 24, color: '#4b5563', textAlign: 'center', maxWidth: 900 }}>
          Earn college credit in high school. Graduate sooner. Save on tuition.
        </div>
      </div>
    ),
    size,
  )
}
