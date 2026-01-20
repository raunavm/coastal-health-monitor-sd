import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { headers } from "next/headers"
import type { Beach, AlertsResponse } from "@/lib/types"
import { SafetyCard } from "@/components/safety-card"
import { Button } from "@/components/ui/button"
import { BeachPageClient } from "@/components/beach-page-client"
import { BeachForecastPanel } from "@/components/beach-forecast-panel"
import { BeachDetailClient } from "@/components/beach-detail-client"
import { ReportButtonClient } from "@/components/report-button-client"

export default async function BeachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const headersList = await headers()
  const host = headersList.get("host") || "localhost:3000"
  const protocol = host.includes("localhost") ? "http" : "https"
  const baseUrl = `${protocol}://${host}`

  let beach: Beach | null = null
  let data: AlertsResponse | null = null
  let error = false

  try {
    const beachesRes = await fetch(`${baseUrl}/api/sd/beaches`, {
      cache: "no-store",
    })

    const contentType = beachesRes.headers.get("content-type")

    if (!beachesRes.ok) {
      const errorText = await beachesRes.text()
      console.error("[v0] Beaches API error:", errorText)
      throw new Error(`Beaches API returned ${beachesRes.status}: ${errorText}`)
    }

    if (!contentType?.includes("application/json")) {
      const responseText = await beachesRes.text()
      console.error("[v0] Non-JSON response:", responseText.substring(0, 200))
      throw new Error(`Expected JSON but got ${contentType}`)
    }

    const beachesData = await beachesRes.json()
    beach = beachesData.beaches?.find((b: Beach) => b.id === Number.parseInt(id))

    if (beach) {
      const alertsUrl = `${baseUrl}/api/alerts?beach_id=${id}&lat=${beach.lat}&lng=${beach.lng}`
      const alertsRes = await fetch(alertsUrl, { cache: "no-store" })

      const alertsContentType = alertsRes.headers.get("content-type")

      if (!alertsRes.ok) {
        const errorText = await alertsRes.text()
        console.error("[v0] Alerts API error:", errorText)
        throw new Error(`Alerts API returned ${alertsRes.status}: ${errorText}`)
      }

      if (!alertsContentType?.includes("application/json")) {
        const responseText = await alertsRes.text()
        console.error("[v0] Non-JSON alerts response:", responseText.substring(0, 200))
        throw new Error(`Expected JSON but got ${alertsContentType}`)
      }

      data = await alertsRes.json()
    }
  } catch (err) {
    console.error("[v0] Error fetching beach data:", err)
    error = true
  }

  return (
    <>
      {beach && <BeachPageClient beach={beach} />}

      <div className="min-h-screen bg-gray-50 dark:bg-neutral-900">
        {/* Header */}
        <header className="bg-white dark:bg-neutral-950 border-b border-gray-200 dark:border-neutral-800 px-4 py-4">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold">{beach?.name || "Beach Details"}</h1>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {error || !data || !beach ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {error ? "Error loading beach data" : "Beach not found"}
              </p>
            </div>
          ) : (
            <>
              {/* Beach Info */}
              <div className="text-center">
                <h2 className="text-3xl font-bold mb-2">{beach.name}</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {beach.lat.toFixed(4)}, {beach.lng.toFixed(4)}
                </p>
              </div>

              {/* Forecast Panel */}
              <BeachForecastPanel
                beach={beach}
                officialStatus={
                  data.safety.official.state === "Closed" ? "closed" :
                    data.safety.official.state === "Advisory" ? "advisory" : "open"
                }
              />

              {/* Safety Card */}
              <SafetyCard data={data} />

              <BeachDetailClient data={data} />

              <div className="flex justify-center">
                <Link href="/report" className="w-full">
                  <Button variant="outline" className="w-full h-12 bg-white dark:bg-neutral-950">
                    <ReportButtonClient />
                  </Button>
                </Link>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  )
}
