import { NextResponse } from 'next/server'

const API_BASE_URL = 'https://us-east-1.aws.data.mongodb-api.com/app/roitoolapp-jnjed/endpoint'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const college = searchParams.get('college')

  if (!college) {
    return NextResponse.json({ error: 'College parameter is required' }, { status: 400 })
  }

  try {
    const response = await fetch(`${API_BASE_URL}/collegeDetails?college=${encodeURIComponent(college)}`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching college details:', error)
    return NextResponse.json({ error: 'Failed to fetch college details' }, { status: 500 })
  }
}