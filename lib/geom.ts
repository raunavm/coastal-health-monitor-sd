export function beachToGeomId(name: string): string {
    const map: Record<string, string> = {
      "Imperial Beach": "IB",
      "Coronado Beach": "COR",
      "Pacific Beach": "PL",
      "La Jolla Shores": "LJS",
      "Mission Beach": "MB",
      "Ocean Beach": "OB",
    }
    return map[name] ?? "IB"
  }
  