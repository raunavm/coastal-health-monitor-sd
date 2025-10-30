import { NextResponse } from "next/server"
import * as cheerio from "cheerio"
import type { CountyStatusResponse } from "@/lib/types"

export const revalidate = 1800 // 30 minutes

const COUNTY_URL = "https://www.sdbeachinfo.com/"

export async function GET(req: Request) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(COUNTY_URL, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SD-Beach-Safety-App/1.0",
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`County website error: ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const beaches: CountyStatusResponse["beaches"] = []

    // Parse Closures section
    $("h2:contains('Closures'), h3:contains('Closures')").each((_, elem) => {
      const section = $(elem).next("ul, div, p")
      section.find("li, p").each((_, item) => {
        const text = $(item).text().trim()
        if (text) {
          const match = text.match(/^([^:]+?)(?:\s*[-–—:]\s*(.+))?$/)
          if (match) {
            const name = match[1].trim()
            const reason = match[2]?.trim()
            beaches.push({
              name,
              status: "closure",
              reason: reason || "Beach closed",
            })
          }
        }
      })
    })

    // Parse Advisories section
    $("h2:contains('Advisories'), h3:contains('Advisories'), h2:contains('Advisory'), h3:contains('Advisory')").each(
      (_, elem) => {
        const section = $(elem).next("ul, div, p")
        section.find("li, p").each((_, item) => {
          const text = $(item).text().trim()
          if (text) {
            const match = text.match(/^([^:]+?)(?:\s*[-–—:]\s*(.+))?$/)
            if (match) {
              const name = match[1].trim()
              const reason = match[2]?.trim()
              beaches.push({
                name,
                status: "advisory",
                reason: reason || "Water quality advisory",
              })
            }
          }
        })
      },
    )

    // Detect sewage-related reasons (flag by preserving original reason)
    const sewageRegex = /sewage|transboundary|tijuana|wastewater|spill/i
    beaches.forEach((beach) => {
      if (beach.reason && sewageRegex.test(beach.reason)) {
        beach.reason = beach.reason
      }
    })

    // Fallback: if county scrape produced no items, use local beaches list with neutral status
    if (beaches.length === 0) {
      try {
        const origin = new URL(req.url).origin
        const resp = await fetch(origin + "/api/sd/beaches", { next: { revalidate: 60 } })
        if (resp.ok) {
          const j = await resp.json()
          const arr = Array.isArray(j) ? j : (Array.isArray(j.beaches) ? j.beaches : [])
          for (const b of arr) {
            if (b?.name) beaches.push({ name: b.name, status: "unknown" })
          }
        }
      } catch {
        // keep empty if fetch fails
      }
    }

    const result: CountyStatusResponse = {
      last_updated: new Date().toISOString(),
      beaches,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[status] Error fetching county status:", error)

    return NextResponse.json({
      last_updated: new Date().toISOString(),
      beaches: [],
    })
  }
}
