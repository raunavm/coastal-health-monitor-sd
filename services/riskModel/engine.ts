// TODO: Implement NN residual + advection-diffusion; keep signature stable.
// This is a stub implementation that returns mock risk predictions.
// Replace with actual neural network model when ready.

export type RiskInputs = {
  rainfall: number // mm in last 72h
  wind: number // mph
  tides: number // tide height in feet
  waves: number // wave height in feet
  sst: number // sea surface temp in °F
  community: number // community signal count
  geomId: string // beach identifier
}

export type RiskCell = {
  lon: number
  lat: number
  riskClass: "low" | "medium" | "high"
  uncertainty: number // 0-1
}

export type RiskMeta = {
  when: string // "now" | "t24" | "t48" | "t72"
  modelVersion: string
  lastTrained: string
}

/**
 * Runs hybrid risk model combining neural network predictions with
 * advection-diffusion physics. Currently returns mock data.
 */
export async function runHybridRisk(
  inputs: RiskInputs,
  when: "now" | "t24" | "t48" | "t72",
): Promise<{ cells: RiskCell[]; meta: RiskMeta }> {
  // TODO(real-data): Replace with actual NN inference
  // For now, generate mock risk cells based on simple heuristics

  const baseRisk = calculateBaseRisk(inputs)
  const cells: RiskCell[] = generateMockCells(inputs, baseRisk)

  return {
    cells,
    meta: {
      when,
      modelVersion: "0.1.0-stub",
      lastTrained: "2025-01-01T00:00:00Z",
    },
  }
}

function calculateBaseRisk(inputs: RiskInputs): "low" | "medium" | "high" {
  let riskScore = 0

  // Rain contribution
  if (inputs.rainfall > 25) riskScore += 3
  else if (inputs.rainfall > 15) riskScore += 2
  else if (inputs.rainfall > 5) riskScore += 1

  // Wind contribution (onshore winds increase risk)
  if (inputs.wind > 15) riskScore += 2
  else if (inputs.wind > 10) riskScore += 1

  // Wave contribution
  if (inputs.waves > 6) riskScore += 2
  else if (inputs.waves > 4) riskScore += 1

  // Community reports
  if (inputs.community >= 4) riskScore += 2
  else if (inputs.community >= 2) riskScore += 1

  if (riskScore >= 5) return "high"
  if (riskScore >= 3) return "medium"
  return "low"
}

function generateMockCells(inputs: RiskInputs, baseRisk: "low" | "medium" | "high"): RiskCell[] {
  // Generate a 3x3 grid of cells around the beach location
  // In production, this would be actual model output
  const cells: RiskCell[] = []
  const centerLat = 32.75 // San Diego area
  const centerLon = -117.25
  const gridSize = 0.05 // ~5km spacing

  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const lat = centerLat + i * gridSize
      const lon = centerLon + j * gridSize

      // Add some variation to risk based on distance from center
      const distance = Math.sqrt(i * i + j * j)
      let cellRisk = baseRisk
      let uncertainty = 0.2

      if (distance > 1) {
        // Cells further from center have higher uncertainty
        uncertainty = 0.4
        // Randomly vary risk for outer cells
        if (Math.random() > 0.5 && baseRisk === "high") {
          cellRisk = "medium"
        } else if (Math.random() > 0.7 && baseRisk === "low") {
          cellRisk = "medium"
        }
      }

      cells.push({
        lat,
        lon,
        riskClass: cellRisk,
        uncertainty,
      })
    }
  }

  return cells
}
