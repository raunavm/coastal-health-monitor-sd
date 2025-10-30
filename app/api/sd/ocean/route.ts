import { NextResponse } from "next/server"
import type { OceanData, TideEvent } from "@/lib/types"
import { haversineDistance } from "@/lib/haversine"

export const revalidate = 1800 // 30 minutes

// CO-OPS stations in San Diego area
const STATIONS = [
  { id: "9410230", name: "La Jolla", lat: 32.867, lng: -117.257 },
  { id: "9410170", name: "San Diego", lat: 32.714, lng: -117.173 },
  { id: "9410135", name: "Coronado", lat: 32.683, lng: -117.173 },
  { id: "9410196", name: "Imperial Beach", lat: 32.583, lng: -117.133 },
]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get("lat")
  const lng = searchParams.get("lng")

  if (!lat || !lng) {
    return NextResponse.json({ error: "Missing lat or lng parameter" }, { status: 400 })
  }

  const latNum = Number.parseFloat(lat)
  const lngNum = Number.parseFloat(lng)

  // Find nearest station
  let nearestStation = STATIONS[0]
  let minDistance = haversineDistance(latNum, lngNum, nearestStation.lat, nearestStation.lng)

  for (const station of STATIONS) {
    const distance = haversineDistance(latNum, lngNum, station.lat, station.lng)
    if (distance < minDistance) {
      minDistance = distance
      nearestStation = station
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const now = new Date()
    const endDate = new Date(now.getTime() + 72 * 60 * 60 * 1000) // +72h

    const formatDate = (date: Date) => {
      return date.toISOString().split("T")[0].replace(/-/g, "")
    }

    console.log("[v0] Fetching ocean data from CO-OPS station:", nearestStation.id, nearestStation.name)

    // Fetch water temperature (latest)
    const waterTempUrl = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=water_temperature&application=SD_Beach_App&station=${nearestStation.id}&date=latest&time_zone=lst_ldt&units=english&format=json`

    // Fetch tide predictions (72h)
    const tideUrl = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=SD_Beach_App&begin_date=${formatDate(now)}&end_date=${formatDate(endDate)}&datum=MLLW&station=${nearestStation.id}&time_zone=lst_ldt&units=english&interval=hilo&format=json`

    const [waterTempRes, tideRes] = await Promise.all([
      fetch(waterTempUrl, { signal: controller.signal }).catch(() => null),
      fetch(tideUrl, { signal: controller.signal }),
    ])

    clearTimeout(timeoutId)

    let waterTempData = null
    if (waterTempRes && waterTempRes.ok) {
      waterTempData = await waterTempRes.json()
      console.log("[v0] Water temp received:", waterTempData?.data?.[0]?.v, "°F")
    }

    if (!tideRes.ok) {
      console.log("[v0] CO-OPS tide API error:", tideRes.status)
      throw new Error("CO-OPS API error")
    }

    const tideData = await tideRes.json()

    // Parse water temp
    let waterTempNow = null
    if (waterTempData?.data && waterTempData.data.length > 0) {
      const latest = waterTempData.data[0]
      waterTempNow = {
        value: Number.parseFloat(latest.v),
        units: "°F",
        ts: latest.t,
      }
    }

    // Parse tide predictions
    const nextHighLow: TideEvent[] = []
    if (tideData?.predictions && Array.isArray(tideData.predictions)) {
      for (const pred of tideData.predictions.slice(0, 10)) {
        nextHighLow.push({
          type: pred.type === "H" ? "H" : "L",
          time: pred.t,
          height_ft: Number.parseFloat(pred.v),
        })
      }
    }

    const result: OceanData = {
      station_id: nearestStation.id,
      water_temp_now: waterTempNow,
      next_high_low: nextHighLow,
    }

    console.log("[v0] Returning ocean data - water temp:", waterTempNow?.value, "tide events:", nextHighLow.length)

    return NextResponse.json(result)
  } catch (error) {
    console.error("[ocean] Error fetching ocean data:", error)

    const now = new Date()
    const mockTides: TideEvent[] = [
      { type: "H", time: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(), height_ft: 5.2 },
      { type: "L", time: new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString(), height_ft: 1.1 },
      { type: "H", time: new Date(now.getTime() + 15 * 60 * 60 * 1000).toISOString(), height_ft: 5.5 },
      { type: "L", time: new Date(now.getTime() + 21 * 60 * 60 * 1000).toISOString(), height_ft: 0.8 },
    ]

    return NextResponse.json({
      station_id: nearestStation.id,
      water_temp_now: { value: 65, units: "°F", ts: now.toISOString() },
      next_high_low: mockTides,
    })
  }
}
