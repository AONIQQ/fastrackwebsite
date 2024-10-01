import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { google } from 'googleapis'

const OAuth2 = google.auth.OAuth2

export async function POST(request: Request) {
  const body = await request.json()
  const {
    schoolDistrict,
    state,
    attendeeNames,
    attendeeEmails,
    numberOfAttendees,
    pocName,
    pocEmail
  } = body

  const oauth2Client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  )

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  })

  try {
    const accessToken = await oauth2Client.getAccessToken()

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        type: 'OAuth2',
        user: process.env.EMAIL_USER,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
        accessToken: accessToken?.token || '',
      },
    })

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: 'info@fastrack.school',
      subject: 'New Sign-up Form Submission',
      text: `
        School/District: ${schoolDistrict}
        State: ${state}
        Attendee Name(s): ${attendeeNames}
        Attendee Email Address(s): ${attendeeEmails}
        Number of Attendees: ${numberOfAttendees}
        Point of contact name: ${pocName}
        Point of contact email: ${pocEmail}
      `
    }

    await transporter.sendMail(mailOptions)
    return NextResponse.json({ message: 'Email sent successfully' })
  } catch (error) {
    console.error('Error sending email:', error as Error) // Type assertion
    return NextResponse.json({ message: 'Failed to send email', error: (error as Error).message }, { status: 500 })
  }
}