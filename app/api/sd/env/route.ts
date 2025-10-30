import { NextResponse } from "next/server"
import type { WeatherData } from "@/lib/types"

export const revalidate = 1800 // 30 minutes

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get("lat")
  const lng = searchParams.get("lng")

  if (!lat || !lng) {
    return NextResponse.json({ error: "Missing lat or lng parameter" }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    // Open-Meteo Weather API
    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast")
    weatherUrl.searchParams.set("latitude", lat)
    weatherUrl.searchParams.set("longitude", lng)
    weatherUrl.searchParams.set(
      "hourly",
      "temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,precipitation,uv_index,cloud_cover",
    )
    weatherUrl.searchParams.set("temperature_unit", "fahrenheit")
    weatherUrl.searchParams.set("wind_speed_unit", "mph")
    weatherUrl.searchParams.set("precipitation_unit", "mm")
    weatherUrl.searchParams.set("timezone", "America/Los_Angeles")
    weatherUrl.searchParams.set("forecast_days", "3")

    // Open-Meteo Marine API
    const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine")
    marineUrl.searchParams.set("latitude", lat)
    marineUrl.searchParams.set("longitude", lng)
    marineUrl.searchParams.set(
      "hourly",
      "wave_height,wave_period,wave_direction,ocean_current_velocity,ocean_current_direction",
    )
    marineUrl.searchParams.set("length_unit", "imperial")
    marineUrl.searchParams.set("timezone", "America/Los_Angeles")
    marineUrl.searchParams.set("forecast_days", "3")

    const [weatherRes, marineRes] = await Promise.all([
      fetch(weatherUrl.toString(), { signal: controller.signal }),
      fetch(marineUrl.toString(), { signal: controller.signal }),
    ])

    clearTimeout(timeoutId)

    if (!weatherRes.ok || !marineRes.ok) {
      throw new Error("Open-Meteo API error")
    }

    const weatherData = await weatherRes.json()
    const marineData = await marineRes.json()

    // Merge hourly data
    const hourly = weatherData.hourly || {}
    const marineHourly = marineData.hourly || {}

    const result: WeatherData = {
      hourly: {
        time: hourly.time || [],
        temp: hourly.temperature_2m || [],
        app_temp: hourly.apparent_temperature || [],
        wind_spd: hourly.wind_speed_10m || [],
        wind_dir: hourly.wind_direction_10m || [],
        precip: hourly.precipitation || [],
        uv: hourly.uv_index || [],
        wave_h: marineHourly.wave_height || [],
        wave_p: marineHourly.wave_period || [],
        wave_dir: marineHourly.wave_direction || [],
        sst: marineHourly.ocean_current_velocity || [],
      },
      units: {
        temp: "°F",
        wind_spd: "mph",
        precip: "mm",
        wave_h: "ft",
      },
      timezone: weatherData.timezone || "America/Los_Angeles",
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[env] Error fetching weather data:", error)

    const now = new Date()
    const mockHourly = {
      time: Array.from({ length: 72 }, (_, i) => {
        const date = new Date(now.getTime() + i * 60 * 60 * 1000)
        return date.toISOString()
      }),
      temp: Array(72).fill(70),
      app_temp: Array(72).fill(68),
      wind_spd: Array(72).fill(5),
      wind_dir: Array(72).fill(270),
      precip: Array(72).fill(0),
      uv: Array(72).fill(3),
      wave_h: Array(72).fill(0.6),
      wave_p: Array(72).fill(8),
      wave_dir: Array(72).fill(270),
      sst: Array(72).fill(65),
    }

    return NextResponse.json({
      hourly: mockHourly,
      units: { temp: "°F", wind_spd: "mph", precip: "mm", wave_h: "ft" },
      timezone: "America/Los_Angeles",
    })
  }
}
