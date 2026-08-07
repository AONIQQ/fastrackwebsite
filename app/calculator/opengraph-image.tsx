import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Free college savings calculator by Fastrack'

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
        <div style={{ fontSize: 40, color: '#8f93e8', textTransform: 'uppercase', letterSpacing: 6 }}>Free Tool</div>
        <div style={{ fontSize: 68, fontWeight: 700, marginTop: 20, textAlign: 'center', maxWidth: 1000 }}>
          What does college really cost your family?
        </div>
        <div style={{ fontSize: 34, marginTop: 28, color: '#c7c9f2' }}>
          6,000+ colleges &middot; real federal data &middot; fastrack.school/calculator
        </div>
      </div>
    ),
    size,
  )
}
