import { NextResponse } from 'next/server'

const API_BASE_URL = 'https://us-east-1.aws.data.mongodb-api.com/app/roitoolapp-jnjed/endpoint'

export async function GET(request: Request) {
  console.log('GET /api/colleges route hit')
  const { searchParams } = new URL(request.url)
  const state = searchParams.get('state')

  if (!state) {
    console.log('State parameter missing')
    return NextResponse.json({ error: 'State parameter is required' }, { status: 400 })
  }

  try {
    console.log(`Fetching colleges for state: ${state}`)
    const response = await fetch(`${API_BASE_URL}/colleges?state=${encodeURIComponent(state)}`)
    
    if (!response.ok) {
      console.log(`Error response from MongoDB: ${response.status}`)
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    console.log(`Successfully fetched colleges for ${state}`)
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching colleges:', error)
    return NextResponse.json({ error: 'Failed to fetch colleges' }, { status: 500 })
  }
}