import type { Beach } from "../types"

export type Safety = "go" | "slow" | "nogo"
export type RiskClass = "low" | "medium" | "high"

export type Summary = {
  safety: Safety
  comfort: number
  riskClass: RiskClass
  why: string[]
  uncertainty: number
}

function safetyFrom(risk: RiskClass, official?: "open" | "advisory" | "closed"): Safety {
  if (official === "closed") return "nogo"
  if (risk === "high") return "nogo"
  if (risk === "medium") return "slow"
  return "go"
}

function comfortFrom(env: { wind: number; sst: number; uv?: number; waves?: number }): number {
  const sstScore = Math.max(0, Math.min(1, (env.sst - 12) / 12))
  const windScore = 1 - Math.max(0, Math.min(1, env.wind / 15))
  const wavesScore = env.waves != null ? 1 - Math.min(1, Math.abs(env.waves - 1.2) / 2.5) : 0.8
  const uvScore = env.uv != null ? 1 - Math.min(1, env.uv / 10) : 0.8

  return Math.round(100 * (0.35 * sstScore + 0.3 * windScore + 0.2 * wavesScore + 0.15 * uvScore))
}

export function summarizeTilesNearBeach(
  cells: { lon: number; lat: number; riskClass: RiskClass; uncertainty: number }[],
  beach: Beach,
  envNow: any,
  official?: "open" | "advisory" | "closed",
): Summary {
  // Naive nearest-cell pick; can improve by radius/median
  if (!cells.length) {
    return {
      safety: "slow",
      comfort: 50,
      riskClass: "medium",
      why: ["noData"],
      uncertainty: 1,
    }
  }

  // TODO: Select nearest cell by geographic distance
  const risk = cells[0].riskClass
  const uncertainty = cells[0].uncertainty

  const comfort = comfortFrom({
    wind: envNow?.wind ?? 8,
    sst: envNow?.sst ?? 18,
    uv: envNow?.uv,
    waves: envNow?.waves,
  })

  const safety = safetyFrom(risk, official)
  const why: string[] = [] // TODO: Add risk drivers once available

  return { safety, comfort, riskClass: risk, why, uncertainty }
}
