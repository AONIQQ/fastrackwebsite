import { NextResponse } from 'next/server'

const API_BASE_URL = 'https://us-east-1.aws.data.mongodb-api.com/app/roitoolapp-jnjed/endpoint'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const state = searchParams.get('state')

  if (!state) {
    return NextResponse.json({ error: 'State parameter is required' }, { status: 400 })
  }

  try {
    const response = await fetch(`${API_BASE_URL}/costOfLiving?state=${encodeURIComponent(state)}`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching cost of living data:', error)
    return NextResponse.json({ error: 'Failed to fetch cost of living data' }, { status: 500 })
  }
}