import { NextResponse } from 'next/server'
import { alexisCalculatorUrl } from '@/lib/alexis-creator.mjs'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: { video: string } }) {
  const url = new URL(request.url)
  const destination = alexisCalculatorUrl({ platform: url.searchParams.get('source'), video: params.video })
  if (!destination) return NextResponse.redirect(new URL('/alexis', url.origin), 302)
  return NextResponse.redirect(destination, 302)
}
