import { NextResponse } from "next/server";

const PY = process.env.PY_URL || "http://127.0.0.1:8000";

export async function GET() {
  try {
    const [healthRes, metricsRes] = await Promise.all([
      fetch(`${PY}/healthz`, { cache: "no-store" }),
      fetch(`${PY}/metrics`, { cache: "no-store" }),
    ]);

    // If FastAPI isn’t running or returns non-200, capture gracefully
    const health = healthRes.ok ? await healthRes.json() : { ok: false };
    const metrics = metricsRes.ok ? await metricsRes.json() : null;

    return NextResponse.json({ health, metrics });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), health: null, metrics: null },
      { status: 500 },
    );
  }
}
