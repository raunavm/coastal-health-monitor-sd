// Community feedback aggregation from approved reports

import type { Report } from "./types"
import { haversine } from "./haversine"

export interface CommunitySummary {
  level: "none" | "minor" | "moderate" | "strong"
  type: "odor" | "debris" | null
  counts: {
    odor_2h: number
    debris_2h: number
    odor_24h: number
    debris_24h: number
  }
  why: string[]
}

interface SummarizeOptions {
  beachId: number
  beachLat: number
  beachLng: number
  now?: Date
  radiusMeters?: number
  reports: Report[]
}

export async function summarizeCommunityForBeach({
  beachId,
  beachLat,
  beachLng,
  now = new Date(),
  radiusMeters = 500,
  reports,
}: SummarizeOptions): Promise<CommunitySummary> {
  // Filter to approved reports only
  const approved = reports.filter((r) => r.moderated && r.approved)

  // Filter by distance
  const nearby = approved.filter((r) => {
    const distMeters = haversine(beachLat, beachLng, r.lat, r.lng) * 1000
    return distMeters <= radiusMeters
  })

  const nowMs = now.getTime()
  const twoHoursAgo = nowMs - 2 * 60 * 60 * 1000
  const twentyFourHoursAgo = nowMs - 24 * 60 * 60 * 1000

  // Count by type and time window
  const odor_2h = nearby.filter((r) => r.type === "odor" && new Date(r.created_at).getTime() >= twoHoursAgo).length
  const debris_2h = nearby.filter((r) => r.type === "debris" && new Date(r.created_at).getTime() >= twoHoursAgo).length
  const odor_24h = nearby.filter(
    (r) => r.type === "odor" && new Date(r.created_at).getTime() >= twentyFourHoursAgo,
  ).length
  const debris_24h = nearby.filter(
    (r) => r.type === "debris" && new Date(r.created_at).getTime() >= twentyFourHoursAgo,
  ).length

  const total_2h = odor_2h + debris_2h
  const total_24h = odor_24h + debris_24h

  // Determine level based on thresholds
  let level: CommunitySummary["level"] = "none"
  if (total_2h >= 4 || total_24h >= 6) {
    level = "strong"
  } else if (total_2h >= 2) {
    level = "moderate"
  } else if (total_2h >= 1) {
    level = "minor"
  }

  // Determine dominant type (from 2h window)
  let type: "odor" | "debris" | null = null
  if (total_2h > 0) {
    type = odor_2h >= debris_2h ? "odor" : "debris"
  }

  // Build why array
  const why: string[] = []
  if (total_2h > 0) {
    if (odor_2h > 0 && debris_2h > 0) {
      why.push(`${odor_2h} odor + ${debris_2h} debris reports in last 2h within ${radiusMeters}m`)
    } else if (odor_2h > 0) {
      why.push(`${odor_2h} odor report${odor_2h > 1 ? "s" : ""} in last 2h within ${radiusMeters}m`)
    } else if (debris_2h > 0) {
      why.push(`${debris_2h} debris report${debris_2h > 1 ? "s" : ""} in last 2h within ${radiusMeters}m`)
    }
  }

  if (total_24h > total_2h) {
    why.push(`${total_24h} total reports in last 24h`)
  }

  return {
    level,
    type,
    counts: {
      odor_2h,
      debris_2h,
      odor_24h,
      debris_24h,
    },
    why,
  }
}
