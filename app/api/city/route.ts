import { NextRequest, NextResponse } from 'next/server'
import { getPopulation } from '@/lib/server/population'
import { getPois } from '@/lib/server/pois'

// City dossier endpoint - weather, AQI, timezone, population, POIs
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const name = searchParams.get('name') || 'Unknown'
  // Exact OSM object from the search result (e.g. "R1543125"), when the city came from search.
  const osmParam = searchParams.get('osm')
  const osmRef = osmParam && /^[NWR]\d+$/.test(osmParam) ? osmParam : null

  if (!lat || !lng) {
    return NextResponse.json(
      { error: 'Latitude and longitude are required' },
      { status: 400 }
    )
  }

  const latitude = parseFloat(lat)
  const longitude = parseFloat(lng)

  try {
    // Fetch all data in parallel
    const [weatherData, aqiData, timezoneData, poisData, population] = await Promise.all([
      fetchWeather(latitude, longitude),
      fetchAirQuality(latitude, longitude),
      fetchTimezone(latitude, longitude),
      getPois(latitude, longitude, name),
      getPopulation({ osmRef, name }),
    ])

    return NextResponse.json({
      localTime: timezoneData.localTime,
      timezone: timezoneData.timezone,
      weather: weatherData,
      airQuality: aqiData,
      population,
      pois: poisData,
    })
  } catch (error) {
    console.error('City data API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch city data' },
      { status: 500 }
    )
  }
}

// Weather descriptions
const weatherDescriptions: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Moderate showers',
  82: 'Violent showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm',
}

async function fetchWeather(lat: number, lng: number) {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?` +
      new URLSearchParams({
        latitude: lat.toString(),
        longitude: lng.toString(),
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,visibility',
        timezone: 'auto',
      }),
      { next: { revalidate: 300 } } // Cache for 5 minutes
    )

    if (!response.ok) throw new Error('Weather fetch failed')

    const data = await response.json()
    const current = data.current

    return {
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      visibility: Math.round((current.visibility || 10000) / 1000),
      code: current.weather_code,
      description: weatherDescriptions[current.weather_code] || 'Unknown',
    }
  } catch {
    return {
      temperature: 20,
      feelsLike: 20,
      humidity: 50,
      windSpeed: 10,
      visibility: 10,
      code: 0,
      description: 'Data unavailable',
    }
  }
}

async function fetchAirQuality(lat: number, lng: number) {
  try {
    const response = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?` +
      new URLSearchParams({
        latitude: lat.toString(),
        longitude: lng.toString(),
        current: 'us_aqi,pm10,pm2_5',
      }),
      { next: { revalidate: 600 } } // Cache for 10 minutes
    )

    if (!response.ok) throw new Error('AQI fetch failed')

    const data = await response.json()
    const current = data.current

    return {
      aqi: current.us_aqi || 50,
      pm25: current.pm2_5 || 0,
      pm10: current.pm10 || 0,
    }
  } catch {
    return {
      aqi: 50,
      pm25: 10,
      pm10: 20,
    }
  }
}

async function fetchTimezone(lat: number, lng: number) {
  try {
    // Use timezone from weather API response or calculate
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?` +
      new URLSearchParams({
        latitude: lat.toString(),
        longitude: lng.toString(),
        current: 'temperature_2m',
        timezone: 'auto',
      })
    )

    if (!response.ok) throw new Error('Timezone fetch failed')

    const data = await response.json()
    const timezone = data.timezone || 'UTC'
    
    // Get local time for this timezone
    const localTime = new Date().toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    return {
      localTime,
      timezone,
    }
  } catch {
    return {
      localTime: new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
      }),
      timezone: 'UTC',
    }
  }
}
