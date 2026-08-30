import { NextResponse } from 'next/server'
import { fastrackSocialCalculatorUrl } from '@/lib/fastrack-social.mjs'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const destination = fastrackSocialCalculatorUrl({ platform: url.searchParams.get('source') })
  if (!destination) return NextResponse.redirect(new URL('/calculator', url.origin), 302)
  return NextResponse.redirect(destination, 302)
}
