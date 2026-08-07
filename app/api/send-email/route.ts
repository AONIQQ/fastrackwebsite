import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { insertSignup, markSignupNotified } from '@/lib/db'
import { sendMail } from '@/lib/mail'

export const dynamic = 'force-dynamic'

/**
 * Counselor / district signup form.
 *
 * This used to email info@fastrack.school and nothing else, so when the Gmail
 * refresh token expired every submission was lost with no trace and no error
 * shown to the person filling it in. The submission is now written to Postgres
 * FIRST and the notification is a best-effort follow-up, so a mail outage can
 * never again cost a lead.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      schoolDistrict, state, attendeeNames, attendeeEmails,
      numberOfAttendees, pocName, pocEmail,
    } = body ?? {}

    if (!pocEmail && !attendeeEmails) {
      return NextResponse.json({ message: 'An email address is required' }, { status: 400 })
    }

    const signup = await insertSignup({
      schoolDistrict, state, attendeeNames, attendeeEmails,
      attendeeCount: numberOfAttendees, pocName, pocEmail,
      userAgent: request.headers.get('user-agent'),
    })

    waitUntil(
      sendMail({
        to: process.env.LEAD_NOTIFY_TO || 'info@fastrack.school',
        replyTo: pocEmail || attendeeEmails,
        subject: `New sign-up: ${schoolDistrict || 'unknown district'}${state ? ` (${state})` : ''}`,
        text: [
          `School/District:   ${schoolDistrict ?? '-'}`,
          `State:             ${state ?? '-'}`,
          `Attendee names:    ${attendeeNames ?? '-'}`,
          `Attendee emails:   ${attendeeEmails ?? '-'}`,
          `Number attending:  ${numberOfAttendees ?? '-'}`,
          `Contact name:      ${pocName ?? '-'}`,
          `Contact email:     ${pocEmail ?? '-'}`,
          '',
          'Saved to the database regardless of whether this email arrived.',
        ].join('\n'),
      })
        .then(() => markSignupNotified(signup.id))
        .catch((err) => console.error('[signup notify]', signup.id, err)),
    )

    return NextResponse.json({ message: 'Email sent successfully' })
  } catch (error) {
    console.error('Error handling signup:', error)
    return NextResponse.json({ message: 'Failed to submit' }, { status: 500 })
  }
}
