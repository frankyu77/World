import { NextRequest, NextResponse } from 'next/server'

// Weather code descriptions
const weatherDescriptions: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
}

// Batch weather request for multiple cities
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const coordsParam = searchParams.get('coords')

  if (!coordsParam) {
    return NextResponse.json(
      { error: 'Coords parameter is required (format: lat,lng|lat,lng|...)' },
      { status: 400 }
    )
  }

  try {
    const coords = coordsParam.split('|').map(c => {
      const [lat, lng] = c.split(',')
      return { lat: parseFloat(lat), lng: parseFloat(lng) }
    })

    // Fetch weather for all coordinates in parallel
    const weatherPromises = coords.map(async ({ lat, lng }) => {
      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?` +
          new URLSearchParams({
            latitude: lat.toString(),
            longitude: lng.toString(),
            current: 'temperature_2m,weather_code',
            timezone: 'auto',
          })
        )

        if (!response.ok) return null

        const data = await response.json()
        return {
          temperature: data.current.temperature_2m,
          code: data.current.weather_code,
          description: weatherDescriptions[data.current.weather_code] || 'Unknown',
        }
      } catch {
        return null
      }
    })

    const results = await Promise.all(weatherPromises)
    return NextResponse.json(results)
  } catch (error) {
    console.error('Batch weather API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch weather data' },
      { status: 500 }
    )
  }
}
