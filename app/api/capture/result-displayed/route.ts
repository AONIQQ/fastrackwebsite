import { NextResponse } from 'next/server'
import { acknowledgeCaptureResultDisplay } from '@/lib/db'
import { isAllowedCaptureOrigin } from '@/lib/capture.mjs'

export const dynamic = 'force-dynamic'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  if (!isAllowedCaptureOrigin(request.headers.get('origin'), request.url)) {
    return NextResponse.json({ error: 'Request origin is not allowed' }, { status: 403 })
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0)
  if (declaredLength > 256) return NextResponse.json({ error: 'Request is too large' }, { status: 413 })
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > 256) return NextResponse.json({ error: 'Request is too large' }, { status: 413 })
    const body = JSON.parse(raw)
    if (!body || typeof body !== 'object' || !UUID_V4.test(body.captureId)) {
      return NextResponse.json({ error: 'Invalid acknowledgement' }, { status: 400 })
    }
    const outcome = await acknowledgeCaptureResultDisplay(body.captureId.toLowerCase())
    if (!outcome.acknowledged && !outcome.first_display) {
      return NextResponse.json({ error: 'Unknown capture' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, first_display: outcome.first_display })
  } catch {
    return NextResponse.json({ error: 'Acknowledgement unavailable' }, { status: 503 })
  }
}
