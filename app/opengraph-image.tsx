import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Fastrack: earn college credit in high school, save on tuition'

export default function Image() {
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
          background: '#080b53',
          color: '#ffffff',
          fontFamily: 'Arial',
        }}
      >
        <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>Fastrack</div>
        <div style={{ fontSize: 36, marginTop: 24, color: '#c7c9f2', textAlign: 'center', maxWidth: 900 }}>
          Earn college credit in high school. Graduate sooner. Save on tuition.
        </div>
      </div>
    ),
    size,
  )
}
