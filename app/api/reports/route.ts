import { NextResponse } from "next/server"
import { seedAdapter } from "@/lib/data/seedAdapter"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const beachId = searchParams.get("beach_id")
  const all = searchParams.get("all") === "true"

  try {
    let reports = await seedAdapter.listReports()

    // Filter by approval status unless admin requests all
    if (!all) {
      reports = reports.filter((r) => r.moderated && r.approved)
    }

    if (beachId) {
      reports = reports.filter((r) => r.beach_id === Number.parseInt(beachId))
    }

    return NextResponse.json({ reports })
  } catch (error) {
    console.error("[reports] Error fetching reports:", error)
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type")

    // Handle multipart form data for photo uploads
    if (contentType?.includes("multipart/form-data")) {
      // TODO: Implement photo upload with EXIF stripping
      // const { buffer, filename } = await stripExifFromForm(request)
      return NextResponse.json({ error: "Photo upload not yet implemented" }, { status: 501 })
    }

    // Handle JSON body
    const body = await request.json()
    const { type, severity, lat, lng, note, photo_url } = body

    if (!type || !severity || !lat || !lng) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!["odor", "debris"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 })
    }

    if (![1, 2, 3].includes(severity)) {
      return NextResponse.json({ error: "Invalid severity" }, { status: 400 })
    }

    // Fetch beaches to snap to nearest
    const baseUrl = request.url.split("/api/")[0]
    const beachesRes = await fetch(`${baseUrl}/api/sd/beaches`)
    const beachesData = await beachesRes.json()

    let nearestBeachId = 1
    if (beachesData.beaches && beachesData.beaches.length > 0) {
      let minDist = Number.POSITIVE_INFINITY
      for (const beach of beachesData.beaches) {
        const dist = Math.sqrt(Math.pow(beach.lat - lat, 2) + Math.pow(beach.lng - lng, 2))
        if (dist < minDist) {
          minDist = dist
          nearestBeachId = beach.id
        }
      }
    }

    const report = await seedAdapter.addReport({
      type,
      severity,
      lat,
      lng,
      beach_id: nearestBeachId,
      note: note || undefined,
      photo_url: photo_url || undefined,
    })

    return NextResponse.json({ success: true, report })
  } catch (error) {
    console.error("[reports] Error creating report:", error)
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 })
  }
}
