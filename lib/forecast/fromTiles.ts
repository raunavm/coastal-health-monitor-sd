import type { Beach } from "../types"
import { calculateComfortScore } from "../comfort"

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

  // Convert SST from Celsius to Fahrenheit for the unified comfort calculation
  const waterTempF = envNow?.sst != null ? (envNow.sst * 9 / 5) + 32 : null

  // Use the unified comfort score calculation from lib/comfort.ts
  const comfort = calculateComfortScore({
    airTemp: envNow?.airTemp ?? 70,
    feelsLike: envNow?.feelsLike ?? envNow?.airTemp ?? 70,
    waterTemp: waterTempF,
    windSpeed: envNow?.wind ?? 8,
    windDir: 270, // Default westerly wind if not available
    uvIndex: envNow?.uv ?? 5,
    waveHeight: envNow?.waves ?? 2,
  })

  const safety = safetyFrom(risk, official)
  const why: string[] = [] // TODO: Add risk drivers once available

  return { safety, comfort, riskClass: risk, why, uncertainty }
}

