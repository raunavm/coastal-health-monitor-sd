import { NextResponse } from "next/server"
import { summarizeCommunityForBeach } from "@/lib/community"
import { trackStart, trackError } from "@/lib/metrics"

export async function GET(request: Request) {
  const end = trackStart("/api/community/summary")

  try {
    const { searchParams } = new URL(request.url)
    const beachId = searchParams.get("beach_id")
    const lat = searchParams.get("lat")
    const lng = searchParams.get("lng")

    if (!beachId || !lat || !lng) {
      return NextResponse.json({ error: "Missing beach_id, lat, or lng" }, { status: 400 })
    }

    // Fetch reports
    const baseUrl = request.url.split("/api/")[0]
    const reportsRes = await fetch(`${baseUrl}/api/reports?beach_id=${beachId}`)
    const reportsData = await reportsRes.json()

    const summary = await summarizeCommunityForBeach({
      beachId: Number.parseInt(beachId),
      beachLat: Number.parseFloat(lat),
      beachLng: Number.parseFloat(lng),
      reports: reportsData.reports || [],
    })

    end()
    return NextResponse.json(summary)
  } catch (error) {
    trackError("/api/community/summary")
    console.error("[community/summary] Error:", error)
    end()
    return NextResponse.json(
      {
        level: "none",
        type: null,
        counts: { odor_2h: 0, debris_2h: 0, odor_24h: 0, debris_24h: 0 },
        why: [],
      },
      { status: 200 },
    )
  }
}
