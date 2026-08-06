import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { insertLead, markResultsEmailSent } from '@/lib/db'
import { sendResultsEmail, notifyNewLead } from '@/lib/mail'
import { sendSms, resultsSms } from '@/lib/sms'

// Never cache a write.
export const dynamic = 'force-dynamic'

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      email, phone, state, residency, college,
      smsConsent, referrer, utm,
      ...snapshot
    } = body ?? {}

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    const lead = await insertLead({
      email: email.trim().toLowerCase(),
      phone: str(phone),
      state: str(state),
      residency: str(residency),
      college: str(college),
      snapshot,
      userAgent: request.headers.get('user-agent'),
      smsConsent: smsConsent === true,
      referrer: str(referrer) ?? request.headers.get('referer'),
      utm: utm && typeof utm === 'object' ? utm : null,
    })

    // Respond as soon as the lead is durable, but hand the delivery work to
    // waitUntil. A bare floating promise does not survive here: the serverless
    // function is frozen the moment the response is returned, so the mail calls
    // were being killed mid-flight and every results email was silently lost.
    const collegeName = str(college) ?? 'your school'
    const totalAdvantage = num(snapshot.totalAdvantage)

    const deliver = async () => {
      const results = {
        to: email.trim().toLowerCase(),
        collegeName,
        residency: str(residency) ?? '',
        annualCost: num(snapshot.annualCost) ?? 0,
        standardTotal: num(snapshot.standardTotal) ?? 0,
        standardRecoup: str(snapshot.standardRecoup) ?? '—',
        fastrackTotal: num(snapshot.fastrackTotal) ?? 0,
        fastrackRecoup: str(snapshot.fastrackRecoup) ?? '—',
        savings: num(snapshot.savings) ?? 0,
        earlyEarnings: num(snapshot.earlyEarnings),
        totalAdvantage,
        yearsSaved: num(snapshot.yearsSaved) ?? 2,
      }

      const outcomes = await Promise.allSettled([
        sendResultsEmail(results).then(() => markResultsEmailSent(lead.id)),
        notifyNewLead({
          email: results.to,
          phone: str(phone),
          state: str(state),
          residency: str(residency),
          college: collegeName,
          totalAdvantage,
        }),
        // Only ever when they ticked the box. See lib/sms.ts.
        smsConsent === true && str(phone)
          ? sendSms(String(phone), resultsSms(collegeName, totalAdvantage))
          : Promise.resolve(false),
      ])

      for (const o of outcomes) {
        if (o.status === 'rejected') console.error('[lead delivery]', lead.id, o.reason)
      }
    }

    waitUntil(deliver().catch((err) => console.error('[lead delivery]', err)))

    return NextResponse.json({ ok: true, id: lead.id })
  } catch (error) {
    console.error('Error inserting lead:', error)
    return NextResponse.json({ error: 'Failed to insert email document' }, { status: 500 })
  }
}
