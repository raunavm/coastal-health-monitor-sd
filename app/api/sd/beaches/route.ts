import { NextResponse } from "next/server"
import type { Beach } from "@/lib/types"
import { trackStart, trackError, setRevalidate } from "@/lib/metrics"

export const revalidate = 21600 // 6 hours

// Replace with real API when available
const MOCK_BEACHES: Beach[] = [
  {
    id: 1,
    name: "La Jolla Shores",
    lat: 32.8473,
    lng: -117.2742,
    agency: "San Diego County",
  },
  {
    id: 2,
    name: "Pacific Beach",
    lat: 32.7941,
    lng: -117.2542,
    agency: "San Diego County",
  },
  {
    id: 3,
    name: "Mission Beach",
    lat: 32.7714,
    lng: -117.2528,
    agency: "San Diego County",
  },
  {
    id: 4,
    name: "Ocean Beach",
    lat: 32.7503,
    lng: -117.2494,
    agency: "San Diego County",
  },
  {
    id: 5,
    name: "Coronado Beach",
    lat: 32.6859,
    lng: -117.1831,
    agency: "San Diego County",
  },
  {
    id: 6,
    name: "Imperial Beach",
    lat: 32.5742,
    lng: -117.1331,
    agency: "San Diego County",
  },
  {
    id: 7,
    name: "Torrey Pines State Beach",
    lat: 32.9275,
    lng: -117.2578,
    agency: "San Diego County",
  },
  {
    id: 8,
    name: "Del Mar Beach",
    lat: 32.9595,
    lng: -117.2653,
    agency: "San Diego County",
  },
]

export async function GET() {
  const end = trackStart("/api/sd/beaches")
  setRevalidate("/api/sd/beaches", revalidate)

  try {
    // TODO: Replace with real ArcGIS API call when endpoint is available
    const result = {
      beaches: MOCK_BEACHES,
      count: MOCK_BEACHES.length,
      last_updated: new Date().toISOString(),
      source: "mock",
    }

    end()
    return NextResponse.json(result)
  } catch (error) {
    trackError("/api/sd/beaches")
    throw error
  }
}
