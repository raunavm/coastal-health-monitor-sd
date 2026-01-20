"use client"

import { useState, useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import type { Beach } from "@/lib/types"
import { ForecastStrip } from "./forecast-strip"
import { summarizeTilesNearBeach, type Summary } from "@/lib/forecast/fromTiles"
import { getEnvAtHorizon, type TimeHorizon } from "@/lib/env/nowEnv"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type BeachForecastPanelProps = {
  beach: Beach
  officialStatus?: "open" | "advisory" | "closed"
}

export function BeachForecastPanel({ beach, officialStatus }: BeachForecastPanelProps) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<"now" | "t24" | "t48" | "t72">("now")
  const [forecasts, setForecasts] = useState<Record<string, { summary: Summary | null; devMock?: boolean }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchForecasts = async () => {
      setLoading(true)
      setError(false)

      try {
        const timeHorizons: Array<TimeHorizon> = ["now", "t24", "t48", "t72"]

        const results = await Promise.all(
          timeHorizons.map(async (when) => {
            try {
              // Fetch env data specific to this time horizon
              const envBundle = await getEnvAtHorizon(beach.lat, beach.lng, when)

              const res = await fetch(`/api/tiles?when=${when}`)
              if (!res.ok) throw new Error("Tiles API error")
              const data = await res.json()

              if (!data.success) {
                return { when, summary: null, devMock: false }
              }

              const summary = summarizeTilesNearBeach(data.data?.cells || [], beach, envBundle, officialStatus)
              return { when, summary, devMock: data.devMock || false }
            } catch (err) {
              console.error(`[v0] Error fetching ${when} forecast:`, err)
              return { when, summary: null, devMock: false }
            }
          }),
        )

        const newForecasts: Record<string, { summary: Summary | null; devMock?: boolean }> = {}
        results.forEach(({ when, summary, devMock }) => {
          newForecasts[when] = { summary, devMock }
        })
        setForecasts(newForecasts)
      } catch (error) {
        console.error("[v0] Error fetching forecasts:", error)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchForecasts()
  }, [beach, officialStatus])

  const getScoreColor = (score: number | undefined) => {
    if (!score) return "text-gray-400"
    if (score >= 80) return "text-green-600 dark:text-green-400"
    if (score >= 60) return "text-amber-600 dark:text-amber-400"
    return "text-red-600 dark:text-red-400"
  }

  return (
    <div className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-neutral-950 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold">{t("aiPredictions")}</h3>
      </div>

      {/* Comfort Score Summary Grid */}
      <div className="mb-4 p-4 rounded-xl bg-gray-50 dark:bg-neutral-900">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t("ui.comfortScore")}</h4>
          <span className={`text-3xl font-bold ${getScoreColor(forecasts.now?.summary?.comfort)}`}>
            {loading ? "—" : forecasts.now?.summary?.comfort ?? "—"}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("ui.now")}</div>
            <div className={`text-lg font-bold ${getScoreColor(forecasts.now?.summary?.comfort)}`}>
              {loading ? "—" : forecasts.now?.summary?.comfort ?? "—"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("ui.plus24h")}</div>
            <div className={`text-lg font-bold ${getScoreColor(forecasts.t24?.summary?.comfort)}`}>
              {loading ? "—" : forecasts.t24?.summary?.comfort ?? "—"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("ui.plus48h")}</div>
            <div className={`text-lg font-bold ${getScoreColor(forecasts.t48?.summary?.comfort)}`}>
              {loading ? "—" : forecasts.t48?.summary?.comfort ?? "—"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("ui.plus72h")}</div>
            <div className={`text-lg font-bold ${getScoreColor(forecasts.t72?.summary?.comfort)}`}>
              {loading ? "—" : forecasts.t72?.summary?.comfort ?? "—"}
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="now">Now</TabsTrigger>
          <TabsTrigger value="t24">24h</TabsTrigger>
          <TabsTrigger value="t48">48h</TabsTrigger>
          <TabsTrigger value="t72">72h</TabsTrigger>
        </TabsList>
        <TabsContent value="now" className="mt-4">
          <ForecastStrip
            when="now"
            summary={forecasts.now?.summary || null}
            loading={loading}
            error={error}
            devMock={forecasts.now?.devMock}
          />
        </TabsContent>
        <TabsContent value="t24" className="mt-4">
          <ForecastStrip
            when="t24"
            summary={forecasts.t24?.summary || null}
            loading={loading}
            error={error}
            devMock={forecasts.t24?.devMock}
          />
        </TabsContent>
        <TabsContent value="t48" className="mt-4">
          <ForecastStrip
            when="t48"
            summary={forecasts.t48?.summary || null}
            loading={loading}
            error={error}
            devMock={forecasts.t48?.devMock}
          />
        </TabsContent>
        <TabsContent value="t72" className="mt-4">
          <ForecastStrip
            when="t72"
            summary={forecasts.t72?.summary || null}
            loading={loading}
            error={error}
            devMock={forecasts.t72?.devMock}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

