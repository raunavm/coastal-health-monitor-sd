export type EnvBundle = {
  wind: number
  sst: number
  uv?: number
  waves?: number
  airTemp?: number
  feelsLike?: number
}

export type TimeHorizon = "now" | "t24" | "t48" | "t72"

const HORIZON_TO_HOURS: Record<TimeHorizon, number> = {
  now: 0,
  t24: 24,
  t48: 48,
  t72: 72,
}

export async function getEnvAtHorizon(lat: number, lng: number, when: TimeHorizon = "now"): Promise<EnvBundle> {
  try {
    const [oceanRes, envRes] = await Promise.all([
      fetch(`/api/sd/ocean?lat=${lat}&lng=${lng}`).catch(() => null),
      fetch(`/api/sd/env?lat=${lat}&lng=${lng}`).catch(() => null),
    ])

    let wind = 8
    let sst = 18
    let uv: number | undefined
    let waves: number | undefined
    let airTemp: number | undefined
    let feelsLike: number | undefined

    const hourOffset = HORIZON_TO_HOURS[when]

    if (envRes?.ok) {
      const envData = await envRes.json()
      const hourly = envData.hourly

      // Find index for the target hour (forecast arrays are hourly)
      const idx = Math.min(hourOffset, (hourly?.time?.length || 1) - 1)

      if (hourly?.wind_spd?.[idx] != null) wind = hourly.wind_spd[idx]
      if (hourly?.uv?.[idx] != null) uv = hourly.uv[idx]
      if (hourly?.wave_h?.[idx] != null) waves = hourly.wave_h[idx]
      if (hourly?.temp?.[idx] != null) airTemp = hourly.temp[idx]
      if (hourly?.app_temp?.[idx] != null) feelsLike = hourly.app_temp[idx]
    }

    if (oceanRes?.ok) {
      const oceanData = await oceanRes.json()
      if (oceanData.water_temp_now?.value != null) {
        sst = (oceanData.water_temp_now.value - 32) * (5 / 9) // Convert F to C
      }
    }

    return { wind, sst, uv, waves, airTemp, feelsLike }
  } catch (error) {
    console.error("[v0] Error fetching env data:", error)
    return { wind: 8, sst: 18 }
  }
}

// Backwards compatibility wrapper
export async function getNowEnv(lat: number, lng: number): Promise<EnvBundle> {
  return getEnvAtHorizon(lat, lng, "now")
}

