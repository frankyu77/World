import { NextRequest, NextResponse } from 'next/server'

// Geocoding API using Nominatim (OpenStreetMap)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')

  if (!query) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 })
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?` + 
      new URLSearchParams({
        q: query,
        format: 'json',
        addressdetails: '1',
        limit: '5',
      }),
      {
        headers: {
          'User-Agent': 'JarvisMap/1.0',
        },
      }
    )

    if (!response.ok) {
      throw new Error('Geocoding service error')
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Geocoding error:', error)
    return NextResponse.json({ error: 'Failed to geocode location' }, { status: 500 })
  }
}
