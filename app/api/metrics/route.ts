import { NextResponse } from "next/server"
import { getMetrics } from "@/lib/metrics"

export async function GET() {
  const metrics = getMetrics()

  let pythonServiceHealth = null

  if (process.env.RISK_PY_URL) {
    try {
      const healthRes = await fetch(`${process.env.RISK_PY_URL}/healthz`, {
        signal: AbortSignal.timeout(3000), // 3 second timeout
      })

      if (healthRes.ok) {
        const healthData = await healthRes.json()
        pythonServiceHealth = {
          reachable: true,
          onnx_loaded: healthData.onnx_loaded ?? false,
        }
      } else {
        pythonServiceHealth = {
          reachable: false,
          onnx_loaded: false,
        }
      }
    } catch (error) {
      pythonServiceHealth = {
        reachable: false,
        onnx_loaded: false,
      }
    }
  }

  return NextResponse.json({
    ...metrics,
    python_service: pythonServiceHealth,
  })
}
