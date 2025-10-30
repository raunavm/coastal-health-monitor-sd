import { NextResponse } from "next/server"
import { seedAdapter } from "@/lib/data/seedAdapter"

// Access the in-memory reports array (in production, use database)
const reports: any[] = []

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await request.json()
    const { approved } = body

    if (typeof approved !== "boolean") {
      return NextResponse.json({ error: "Invalid approved value" }, { status: 400 })
    }

    await seedAdapter.moderate(id, approved ? "approve" : "reject")

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[moderate] Error moderating report:", error)
    return NextResponse.json({ error: "Failed to moderate report" }, { status: 500 })
  }
}
