export type EnvBundle = {
  wind: number
  sst: number
  uv?: number
  waves?: number
}

export async function getNowEnv(lat: number, lng: number): Promise<EnvBundle> {
  try {
    const [oceanRes, envRes] = await Promise.all([
      fetch(`/api/sd/ocean?lat=${lat}&lng=${lng}`).catch(() => null),
      fetch(`/api/sd/env?lat=${lat}&lng=${lng}`).catch(() => null),
    ])

    let wind = 8
    let sst = 18
    let uv: number | undefined
    let waves: number | undefined

    if (envRes?.ok) {
      const envData = await envRes.json()
      if (envData.hourly?.wind_spd?.[0] != null) wind = envData.hourly.wind_spd[0]
      if (envData.hourly?.uv?.[0] != null) uv = envData.hourly.uv[0]
      if (envData.hourly?.wave_h?.[0] != null) waves = envData.hourly.wave_h[0]
    }

    if (oceanRes?.ok) {
      const oceanData = await oceanRes.json()
      if (oceanData.water_temp_now?.value != null) {
        sst = (oceanData.water_temp_now.value - 32) * (5 / 9) // Convert F to C
      }
    }

    return { wind, sst, uv, waves }
  } catch (error) {
    console.error("[v0] Error fetching env data:", error)
    return { wind: 8, sst: 18 }
  }
}
