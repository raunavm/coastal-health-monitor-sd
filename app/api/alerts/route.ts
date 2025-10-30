import { NextResponse } from "next/server"
import type { AlertsResponse, Beach, CountyStatus, WeatherData, OceanData, CommunitySummary } from "@/lib/types"
import { normalizeBeachName } from "@/lib/normalize"
import { calculateRiskPoints, riskPointsToLevel, riskLevelToSafety } from "@/lib/risk"
import { calculateComfortScore, findBestWindow } from "@/lib/comfort"
import { metersToFeet } from "@/lib/format"
import { trackStart, trackError } from "@/lib/metrics"

// No cache - composed on demand
export const dynamic = "force-dynamic"

const SOUTH_BAY_BEACHES = ["imperial beach", "silver strand", "coronado"]

export async function GET(request: Request) {
  const end = trackStart("/api/alerts")

  try {
    const { searchParams } = new URL(request.url)
    const beachId = searchParams.get("beach_id")
    const lat = searchParams.get("lat")
    const lng = searchParams.get("lng")

    if (!lat || !lng) {
      return NextResponse.json({ error: "Missing lat or lng parameter" }, { status: 400 })
    }

    const baseUrl = request.url.split("/api/")[0]

    const beachesRes = await fetch(`${baseUrl}/api/sd/beaches`)
    const beachesData = beachesRes.ok ? await beachesRes.json() : { beaches: [] }

    // Find the beach first
    let beach: Beach | null = null
    if (beachId) {
      beach = beachesData.beaches?.find((b: Beach) => b.id === Number.parseInt(beachId)) || null
    }

    if (!beach && beachesData.beaches?.length > 0) {
      // Find nearest beach
      const latNum = Number.parseFloat(lat)
      const lngNum = Number.parseFloat(lng)
      let minDist = Number.POSITIVE_INFINITY
      for (const b of beachesData.beaches) {
        const dist = Math.sqrt(Math.pow(b.lat - latNum, 2) + Math.pow(b.lng - lngNum, 2))
        if (dist < minDist) {
          minDist = dist
          beach = b
        }
      }
    }

    if (!beach) {
      return NextResponse.json({ error: "Beach not found" }, { status: 404 })
    }

    const beachLat = beach.lat.toString()
    const beachLng = beach.lng.toString()

    // Fetch all data sources in parallel using beach coordinates
    const [statusRes, envRes, oceanRes] = await Promise.all([
      fetch(`${baseUrl}/api/sd/status`),
      fetch(`${baseUrl}/api/sd/env?lat=${beachLat}&lng=${beachLng}`),
      fetch(`${baseUrl}/api/sd/ocean?lat=${beachLat}&lng=${beachLng}`),
    ])

    const statusData = statusRes.ok ? await statusRes.json() : { beaches: [], last_updated: null }
    const envData: WeatherData = envRes.ok
      ? await envRes.json()
      : {
          hourly: {
            time: [],
            temp: [],
            app_temp: [],
            wind_spd: [],
            wind_dir: [],
            precip: [],
            uv: [],
            wave_h: [],
            wave_p: [],
            wave_dir: [],
            sst: [],
          },
          units: { temp: "°F", wind_spd: "mph", precip: "mm", wave_h: "ft" },
          timezone: "America/Los_Angeles",
        }
    const oceanData: OceanData = oceanRes.ok
      ? await oceanRes.json()
      : {
          station_id: "9410230",
          water_temp_now: null,
          next_high_low: [],
        }

    let communityData: CommunitySummary = {
      level: "none",
      type: null,
      counts: { odor_2h: 0, debris_2h: 0, odor_24h: 0, debris_24h: 0 },
      why: [],
    }

    try {
      const communityRes = await fetch(
        `${baseUrl}/api/community/summary?beach_id=${beach.id}&lat=${beach.lat}&lng=${beach.lng}`,
      )
      if (communityRes.ok) {
        communityData = await communityRes.json()
      }
    } catch (error) {
      console.error("[alerts] Failed to fetch community data:", error)
    }

    // Find county status for this beach
    const beachNormalized = normalizeBeachName(beach.name)
    const countyStatus: CountyStatus | undefined = statusData.beaches?.find((s: CountyStatus) => {
      const statusNormalized = normalizeBeachName(s.name)
      return statusNormalized === beachNormalized || s.name.toLowerCase().includes(beach!.name.toLowerCase())
    })

    const officialState =
      countyStatus?.status === "closure" ? "Closed" : countyStatus?.status === "advisory" ? "Advisory" : "Open"

    // Calculate risk for now, 24h, 48h, 72h
    const now = new Date()
    const hourly = envData.hourly

    const getRiskAtHour = (hourOffset: number) => {
      if (!hourly.time || hourly.time.length === 0) return "Low"

      const targetTime = new Date(now.getTime() + hourOffset * 60 * 60 * 1000)
      let closestIndex = 0
      let minDiff = Number.POSITIVE_INFINITY

      for (let i = 0; i < hourly.time.length; i++) {
        const hourTime = new Date(hourly.time[i])
        const diff = Math.abs(hourTime.getTime() - targetTime.getTime())
        if (diff < minDiff) {
          minDiff = diff
          closestIndex = i
        }
      }

      // Calculate rain in last 72h
      let rain72h = 0
      for (let i = Math.max(0, closestIndex - 72); i <= closestIndex; i++) {
        rain72h += hourly.precip[i] || 0
      }

      const riskPoints = calculateRiskPoints({
        rain72h,
        windSpeed: hourly.wind_spd[closestIndex] || 0,
        windDir: hourly.wind_dir[closestIndex] || 0,
        waveHeight: hourly.wave_h[closestIndex] || 0,
        uvIndex: hourly.uv[closestIndex] || 0,
      })

      let adjustedPoints = riskPoints
      if (hourOffset === 0 && (communityData.level === "moderate" || communityData.level === "strong")) {
        adjustedPoints += 1
      }

      return riskPointsToLevel(adjustedPoints)
    }

    const riskNow = getRiskAtHour(0)
    const risk24h = getRiskAtHour(24)
    const risk48h = getRiskAtHour(48)
    const risk72h = getRiskAtHour(72)

    const safetyStatus = riskLevelToSafety(riskNow, countyStatus?.status)

    // Build "why" array for safety
    const safetyWhy: string[] = []
    if (countyStatus?.status === "closure") {
      safetyWhy.push(`Beach closed: ${countyStatus.reason || "Official closure"}`)
    } else if (countyStatus?.status === "advisory") {
      safetyWhy.push(`Advisory: ${countyStatus.reason || "Water quality advisory"}`)
    }

    if (communityData.level !== "none") {
      safetyWhy.push("recent_crowd_reports")
    }

    let nowIndex = 0
    if (hourly.time && hourly.time.length > 0) {
      let minDiff = Number.POSITIVE_INFINITY
      for (let i = 0; i < hourly.time.length; i++) {
        const hourTime = new Date(hourly.time[i])
        const diff = Math.abs(hourTime.getTime() - now.getTime())
        if (diff < minDiff) {
          minDiff = diff
          nowIndex = i
        }
      }
    }

    // Add environmental factors
    if (hourly.time && hourly.time.length > 0) {
      const rain72h = hourly.precip.slice(0, 72).reduce((sum, p) => sum + (p || 0), 0)
      if (rain72h >= 15) safetyWhy.push(`Recent rain: ${rain72h.toFixed(0)}mm`)

      const windSpeed = hourly.wind_spd[nowIndex] || 0
      const windDir = hourly.wind_dir[nowIndex] || 0
      const isOnshore = (windDir >= 210 && windDir <= 330) || (windDir >= 180 && windDir <= 360)
      if (windSpeed > 12 && isOnshore) safetyWhy.push(`Strong onshore wind: ${windSpeed.toFixed(0)} mph`)

      const waveHeight = hourly.wave_h[nowIndex] || 0
      if (waveHeight >= 1.5) safetyWhy.push(`High waves: ${metersToFeet(waveHeight).toFixed(1)} ft`)

      const uvIndex = hourly.uv[nowIndex] || 0
      if (uvIndex >= 7) safetyWhy.push(`High UV: ${uvIndex.toFixed(0)}`)
    }

    // Calculate comfort scores
    const getComfortAtHour = (hourOffset: number) => {
      if (!hourly.time || hourly.time.length === 0) return 50

      const targetTime = new Date(now.getTime() + hourOffset * 60 * 60 * 1000)
      let closestIndex = 0
      let minDiff = Number.POSITIVE_INFINITY

      for (let i = 0; i < hourly.time.length; i++) {
        const hourTime = new Date(hourly.time[i])
        const diff = Math.abs(hourTime.getTime() - targetTime.getTime())
        if (diff < minDiff) {
          minDiff = diff
          closestIndex = i
        }
      }

      const airTemp = hourly.temp[closestIndex] || 70
      const feelsLike = hourly.app_temp[closestIndex] || airTemp
      const windSpeed = hourly.wind_spd[closestIndex] || 0
      const windDir = hourly.wind_dir[closestIndex] || 0
      const uvIndex = hourly.uv[closestIndex] || 0
      const waveHeight = metersToFeet(hourly.wave_h[closestIndex] || 0)

      const waterTemp = oceanData.water_temp_now?.value || null

      return calculateComfortScore({
        airTemp,
        feelsLike,
        waterTemp,
        windSpeed,
        windDir,
        uvIndex,
        waveHeight,
      })
    }

    const comfortNow = getComfortAtHour(0)
    const comfort24h = getComfortAtHour(24)
    const comfort48h = getComfortAtHour(48)
    const comfort72h = getComfortAtHour(72)

    const hourlyScores: { time: string; score: number }[] = []
    const nowHour = now.getHours()

    for (let i = 0; i < Math.min(12, hourly.time?.length || 0); i++) {
      const hourTime = new Date(hourly.time[i])
      const hour = hourTime.getHours()

      // Only include future hours during daylight (6 AM - 8 PM)
      if (hourTime > now && hour >= 6 && hour <= 20) {
        const hourOffset = Math.round((hourTime.getTime() - now.getTime()) / (60 * 60 * 1000))
        hourlyScores.push({
          time: hourly.time[i],
          score: getComfortAtHour(hourOffset),
        })
      }
    }

    const bestWindow = findBestWindow(hourlyScores, 3)
    let bestWindowFormatted = null
    if (bestWindow) {
      const startTime = new Date(bestWindow.start)
      const endTime = new Date(bestWindow.end)
      bestWindowFormatted = {
        start: startTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        end: endTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
      }
    }

    // Build "why" array for comfort
    const comfortWhy: string[] = []
    if (hourly.time && hourly.time.length > 0) {
      const uvIndex = hourly.uv[nowIndex] || 0
      if (uvIndex >= 8) comfortWhy.push(`UV ${uvIndex.toFixed(0)} (very high)`)
      else if (uvIndex >= 7) comfortWhy.push(`UV ${uvIndex.toFixed(0)} (high)`)

      const windSpeed = hourly.wind_spd[nowIndex] || 0
      const windDir = hourly.wind_dir[nowIndex] || 0
      const isOnshore = (windDir >= 210 && windDir <= 330) || (windDir >= 180 && windDir <= 360)
      if (windSpeed > 12 && isOnshore) comfortWhy.push(`Breeze ${windSpeed.toFixed(0)} mph onshore`)
      else if (windSpeed > 8) comfortWhy.push(`Breeze ${windSpeed.toFixed(0)} mph`)

      if (oceanData.water_temp_now) {
        comfortWhy.push(`Water ${oceanData.water_temp_now.value.toFixed(0)}°F`)
      }
    }

    // Determine tide state
    let tideState: "ebb" | "flood" | "low" | "high" | null = null
    if (oceanData.next_high_low && oceanData.next_high_low.length >= 2) {
      const next = oceanData.next_high_low[0]
      const nextTime = new Date(next.time)
      if (nextTime > now) {
        tideState = next.type === "H" ? "flood" : "ebb"
      }
    }

    // Sewage context
    const sewageRegex = /sewage|transboundary|tijuana|wastewater|spill/i
    const officialReason = countyStatus?.reason || null
    const isSewageRelated = officialReason ? sewageRegex.test(officialReason) : false
    const isSouthBay = SOUTH_BAY_BEACHES.some((sb) => beachNormalized.includes(sb))
    const southBayFlag = isSouthBay && isSewageRelated

    const result: AlertsResponse = {
      beach,
      as_of: new Date().toISOString(),
      safety: {
        status: safetyStatus,
        risk_now: riskNow,
        risk_24h: risk24h,
        risk_48h: risk48h,
        risk_72h: risk72h,
        official: {
          state: officialState,
          last_sample_at: statusData.last_updated || null,
        },
        why: safetyWhy,
        sources: ["County", "CO-OPS", "Open-Meteo"],
      },
      comfort: {
        score_now: comfortNow,
        score_24h: comfort24h,
        score_48h: comfort48h,
        score_72h: comfort72h,
        best_window_today: bestWindowFormatted,
        why: comfortWhy,
      },
      ocean: {
        tide_state: tideState,
        swell: {
          height_ft: hourly.wave_h && hourly.wave_h[nowIndex] ? metersToFeet(hourly.wave_h[nowIndex]) : null,
          period_s: hourly.wave_p && hourly.wave_p[nowIndex] ? hourly.wave_p[nowIndex] : null,
          dir_deg: hourly.wave_dir && hourly.wave_dir[nowIndex] ? hourly.wave_dir[nowIndex] : null,
        },
        water_temp_f: oceanData.water_temp_now?.value || null,
      },
      weather: {
        air_temp_f: hourly.temp && hourly.temp[nowIndex] ? hourly.temp[nowIndex] : 70,
        feels_like_f: hourly.app_temp && hourly.app_temp[nowIndex] ? hourly.app_temp[nowIndex] : 70,
        wind_mph: hourly.wind_spd && hourly.wind_spd[nowIndex] ? hourly.wind_spd[nowIndex] : 0,
        wind_dir_deg: hourly.wind_dir && hourly.wind_dir[nowIndex] ? hourly.wind_dir[nowIndex] : 0,
        uv_index: hourly.uv && hourly.uv[nowIndex] ? hourly.uv[nowIndex] : 0,
        pop: null,
        cloud_cover: null,
      },
      pollution: {
        official_reason: isSewageRelated ? officialReason : null,
        south_bay_flag: southBayFlag,
        pfm_link: "https://pfmweb.ucsd.edu/",
      },
      community: communityData,
    }

    end()
    return NextResponse.json(result)
  } catch (error) {
    trackError("/api/alerts")
    console.error("[alerts] Error composing alerts:", error)
    end()
    return NextResponse.json({ error: "Failed to compose alerts data" }, { status: 500 })
  }
}
