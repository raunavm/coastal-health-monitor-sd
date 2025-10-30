import beachesData from "@/seed/beaches.json"
import metricsData from "@/seed/metrics.json"
import observationsData from "@/seed/observations.json"
import type { Report } from "@/lib/types"
import type { Adapter } from "./adapter"

// In-memory cache for reports (seeded from JSON, then mutable)
let reportsCache: Report[] | null = null

export const seedAdapter: Adapter = {
  async listBeaches() {
    if (!beachesData) return []

    // Transform seed format to Beach format
    return (beachesData as any[]).map((beach) => ({
      id: Number.parseInt(beach.id),
      name: beach.name,
      lat: beach.coords[1],
      lng: beach.coords[0],
      city: beach.city,
    }))
  },

  async getMetrics() {
    return metricsData ?? { routes: {}, updated_at: new Date().toISOString() }
  },

  async listReports() {
    if (!reportsCache) {
      reportsCache = observationsData?.reports ?? []
    }
    return reportsCache
  },

  async addReport(r: any) {
    if (!reportsCache) {
      await this.listReports()
    }

    const report: Report = {
      id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...r,
      moderated: false,
      approved: false,
      created_at: new Date().toISOString(),
    }

    reportsCache!.push(report)
    return report
  },

  async moderate(id: string, action: "approve" | "reject") {
    if (!reportsCache) {
      await this.listReports()
    }

    const report = reportsCache!.find((r) => r.id === id)
    if (report) {
      report.moderated = true
      report.approved = action === "approve"
    }
  },
}
