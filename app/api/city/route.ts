import { NextRequest, NextResponse } from 'next/server'

// Comprehensive city data endpoint - weather, AQI, traffic, timezone, POIs
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const name = searchParams.get('name') || 'Unknown'

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
    const [weatherData, aqiData, timezoneData, poisData] = await Promise.all([
      fetchWeather(latitude, longitude),
      fetchAirQuality(latitude, longitude),
      fetchTimezone(latitude, longitude),
      fetchPOIs(latitude, longitude),
    ])

    // Simulated traffic (would be replaced with real API in production)
    const traffic = simulateTraffic()

    // Get population estimate (simplified)
    const population = await fetchPopulation(name)

    return NextResponse.json({
      localTime: timezoneData.localTime,
      timezone: timezoneData.timezone,
      weather: weatherData,
      airQuality: aqiData,
      traffic,
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

async function fetchPOIs(lat: number, lng: number) {
  try {
    // Use Overpass API for POIs from OpenStreetMap
    const radius = 2000 // 2km radius
    const query = `
      [out:json][timeout:10];
      (
        node["tourism"~"attraction|museum|viewpoint"](around:${radius},${lat},${lng});
        node["amenity"~"restaurant|cafe|theatre|cinema"](around:${radius},${lat},${lng});
        node["historic"](around:${radius},${lat},${lng});
      );
      out body 10;
    `

    const response = await fetch(
      'https://overpass-api.de/api/interpreter',
      {
        method: 'POST',
        body: query,
        headers: {
          'Content-Type': 'text/plain',
        },
        next: { revalidate: 3600 }, // Cache for 1 hour
      }
    )

    if (!response.ok) throw new Error('POI fetch failed')

    const data = await response.json()
    
    return data.elements?.slice(0, 10).map((el: { tags?: { name?: string; tourism?: string; amenity?: string; historic?: string } }) => ({
      name: el.tags?.name || 'Unnamed',
      type: el.tags?.tourism || el.tags?.amenity || el.tags?.historic || 'Place',
    })) || []
  } catch {
    // Return some generic POIs as fallback
    return [
      { name: 'City Center', type: 'landmark' },
      { name: 'Main Square', type: 'attraction' },
    ]
  }
}

function simulateTraffic() {
  // Simulate traffic based on time of day
  const hour = new Date().getHours()
  const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)
  const isWeekend = [0, 6].includes(new Date().getDay())

  let baseLevel = 0.3
  if (isRushHour && !isWeekend) baseLevel = 0.7
  if (isWeekend) baseLevel = 0.2

  // Add some randomness
  const level = Math.min(1, Math.max(0, baseLevel + (Math.random() - 0.5) * 0.3))
  const delay = Math.round(level * 15) // 0-15 minutes delay

  return {
    level,
    delay,
  }
}

async function fetchPopulation(cityName: string) {
  // Population estimates for major cities (simplified)
  const populations: Record<string, number> = {
    'new york': 8336817,
    'london': 8982000,
    'tokyo': 13960000,
    'paris': 2161000,
    'sydney': 5312000,
    'dubai': 3331000,
    'singapore': 5454000,
    'shanghai': 24870000,
    'mumbai': 12478447,
    'berlin': 3645000,
    'moscow': 12506468,
    'rio de janeiro': 6748000,
    'los angeles': 3979576,
    'toronto': 2930000,
    'seoul': 9733509,
    'beijing': 21540000,
    'hong kong': 7500700,
    'chicago': 2693976,
    'san francisco': 873965,
    'barcelona': 1620343,
    'amsterdam': 872680,
    'rome': 2873000,
    'miami': 442241,
    'boston': 675647,
  }

  const normalized = cityName.toLowerCase()
  return populations[normalized] || null
}
