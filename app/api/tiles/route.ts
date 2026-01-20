import { NextRequest } from "next/server"
import { predictRisk } from "@/lib/inference"

function num(q: URLSearchParams, k: string, dflt: number) {
  const v = q.get(k)
  if (v === null || v === "") return dflt
  const n = Number(v)
  return Number.isFinite(n) ? n : dflt
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams

  const when = q.get("when") ?? "now"
  const geomId = q.get("geomId") ?? "IB"

  const rainfall = num(q, "rainfall", 0)
  const wind = num(q, "wind", 1)
  const tides = num(q, "tides", 0)
  const waves = num(q, "waves", 0.5)
  const sst = num(q, "sst", 19)
  const community = num(q, "community", 0.2)

  // optional center for grid
  const lat = q.get("lat") ? Number(q.get("lat")) : undefined
  const lng = q.get("lng") ? Number(q.get("lng")) : undefined

  try {
    // Run inference locally (Serverless / Node.js)
    const result = await predictRisk({
      geomId,
      rainfall,
      wind,
      tides,
      waves,
      sst,
      community,
      lat,
      lng
    })

    return Response.json({
      success: true,
      data: result,
      forwarded: { when, geomId, rainfall, wind, tides, waves, sst, community, lat, lng },
      meta: { onnx: true, source: "serverless-ts" },
    })
  } catch (e: any) {
    console.error("Inference failed:", e)
    return new Response(JSON.stringify({ success: false, error: `Inference failed: ${e?.message || e}` }), { status: 500 })
  }
}
