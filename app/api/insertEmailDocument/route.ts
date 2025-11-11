import { NextResponse } from 'next/server'

const API_BASE_URL = 'https://us-east-1.aws.data.mongodb-api.com/app/roitoolapp-jnjed/endpoint'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const response = await fetch(`${API_BASE_URL}/insertEmailDocument`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error inserting email document:', error)
    return NextResponse.json({ error: 'Failed to insert email document' }, { status: 500 })
  }
}