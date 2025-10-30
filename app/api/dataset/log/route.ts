export const runtime = "nodejs"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import { join } from "path"

type LogRequest = {
  regionId: string
  lat: number
  lon: number
  when: string
  beachId: string
  features: {
    rainfall: number
    wind: number
    tides: number
    waves: number
    sst: number
    community: number
    geomId_index: string
  }
  label: string
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LogRequest

    // Check if logging is enabled
    if (process.env.LOG_DATASET !== "1") {
      return NextResponse.json({ ok: true, logged: false })
    }

    // Resolve base directory
    const base = process.env.REGION_DATASET_DIR || "./data"
    const regionDir = join(base, body.regionId || "unknown")

    // Create YYYYMM filename
    const now = new Date()
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
    const filename = `dataset_${yyyymm}.jsonl`
    const filepath = join(regionDir, filename)

    // Ensure directory exists
    if (!existsSync(regionDir)) {
      await mkdir(regionDir, { recursive: true })
    }

    // Build JSONL row
    const row = {
      ts: now.toISOString(),
      regionId: body.regionId,
      lat: body.lat,
      lon: body.lon,
      when: body.when,
      beachId: body.beachId,
      features: body.features,
      label: body.label,
    }

    // Append to file (JSONL format)
    const line = JSON.stringify(row) + "\n"
    await writeFile(filepath, line, { flag: "a" })

    return NextResponse.json({ ok: true, logged: true, file: filepath })
  } catch (err: any) {
    // Fail soft on serverless/ephemeral FS errors
    console.error("[dataset/log] Error:", err.message)
    return NextResponse.json({ ok: true, note: "ephemeral fs, not persisted" })
  }
}
