import type { RiskLevel } from "./types"

// Calculate risk level based on environmental factors

export interface RiskFactors {
  rain72h: number // mm
  windSpeed: number // mph
  windDir: number // degrees
  waveHeight: number // meters
  uvIndex: number
  crowdReports?: number
}

export function calculateRiskPoints(factors: RiskFactors): number {
  let points = 0

  // Rain in last 72h
  if (factors.rain72h >= 25) points += 2
  else if (factors.rain72h >= 15) points += 1

  // Onshore wind (assume W→E for SD, so westerly winds 210-330° are onshore)
  const isOnshore =
    (factors.windDir >= 210 && factors.windDir <= 330) || (factors.windDir >= 180 && factors.windDir <= 360)
  if (isOnshore && factors.windSpeed > 12) points += 1

  // Wave height
  if (factors.waveHeight >= 1.5) points += 1

  // UV index
  if (factors.uvIndex >= 7) points += 1

  // Crowd reports (optional)
  if (factors.crowdReports && factors.crowdReports >= 2) points += 1

  return points
}

export function riskPointsToLevel(points: number): RiskLevel {
  if (points >= 3) return "High"
  if (points === 2) return "Moderate"
  return "Low"
}

export function riskLevelToSafety(
  risk: RiskLevel,
  officialStatus?: "open" | "advisory" | "closure",
): "Go" | "Slow" | "No-Go" {
  // Official status overrides
  if (officialStatus === "closure") return "No-Go"
  if (officialStatus === "advisory") return "Slow"

  // Risk-based
  if (risk === "High") return "No-Go"
  if (risk === "Moderate") return "Slow"
  return "Go"
}
