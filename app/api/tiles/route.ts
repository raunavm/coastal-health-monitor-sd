import { NextRequest } from "next/server"

const PY_URL = process.env.PY_PREDICT_URL || "http://127.0.0.1:8000/predict"

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

  const rainfall  = num(q, "rainfall",  0)
  const wind      = num(q, "wind",      1)
  const tides     = num(q, "tides",     0)
  const waves     = num(q, "waves",     0.5)
  const sst       = num(q, "sst",       19)
  const community = num(q, "community", 0.2)

  // optional center for grid (your Python can ignore if not provided)
  const lat = q.get("lat")
  const lng = q.get("lng")

  const body: any = { when, geomId, rainfall, wind, tides, waves, sst, community }
  if (lat && lng) { body.lat = Number(lat); body.lng = Number(lng) }

  let py
  try {
    const r = await fetch(PY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      // avoid hanging the client forever
      cache: "no-store",
    })
    if (!r.ok) {
      const txt = await r.text()
      return new Response(JSON.stringify({ success: false, error: `py ${r.status}: ${txt}` }), { status: 500 })
    }
    py = await r.json()
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: `py fetch failed: ${e?.message || e}` }), { status: 500 })
  }

  return Response.json({
    success: true,
    data: py,                    // Python returns { cells:[...], meta:{...} }
    forwarded: { when, geomId, rainfall, wind, tides, waves, sst, community, lat, lng },
    meta: { onnx: py?.meta?.onnx ?? false, source: "tiles-route" },
  })
}
