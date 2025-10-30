"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import type { Beach, AlertsResponse } from "@/lib/types"
import { formatAsOf } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"

interface BeachSheetProps {
  beach: Beach
  onClose: () => void
}

export function BeachSheet({ beach, onClose }: BeachSheetProps) {
  const { t } = useI18n()
  const [data, setData] = useState<AlertsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/alerts?beach_id=${beach.id}&lat=${beach.lat}&lng=${beach.lng}`)
        const json = await res.json()
        setData(json)
      } catch (error) {
        console.error("Error fetching beach data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [beach])

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-neutral-950 rounded-t-2xl shadow-2xl z-50 max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-neutral-950 border-b border-gray-200 dark:border-neutral-800 px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{beach.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
            </div>
          ) : data ? (
            <>
              {/* Safety Status */}
              <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{t("safety")}</h3>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      data.safety.status === "Go"
                        ? "bg-green-600 text-white"
                        : data.safety.status === "Slow"
                          ? "bg-amber-500 text-white"
                          : "bg-red-600 text-white"
                    }`}
                  >
                    {data.safety.status === "Go" ? t("go") : data.safety.status === "Slow" ? t("slow") : t("noGo")}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  {data.safety.why.map((reason, i) => (
                    <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-neutral-800 rounded text-xs">
                      {reason}
                    </span>
                  ))}
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("asOf")} {formatAsOf(data.as_of)}
                </p>
              </div>

              {data.community && data.community.level !== "none" && (
                <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{t("communityFeedback")}</h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        data.community.level === "minor"
                          ? "bg-yellow-300 text-black"
                          : data.community.level === "moderate"
                            ? "bg-amber-500 text-white"
                            : "bg-red-600 text-white"
                      }`}
                      title={t("communityTooltip")}
                    >
                      {data.community.level === "minor"
                        ? t("communityMinor")
                        : data.community.level === "moderate"
                          ? t("communityModerate")
                          : t("communityStrong")}
                    </span>
                  </div>

                  {data.community.type && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium capitalize">{data.community.type}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    {data.community.why.map((reason, i) => (
                      <p key={i} className="text-xs text-gray-600 dark:text-gray-400">
                        {reason}
                      </p>
                    ))}
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">{t("communityTooltip")}</p>
                </div>
              )}

              {/* Comfort Score */}
              <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{t("comfort")}</h3>
                  <span className="text-2xl font-bold">{data.comfort.score_now}</span>
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  {data.comfort.why.map((reason, i) => (
                    <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-neutral-800 rounded text-xs">
                      {reason}
                    </span>
                  ))}
                </div>

                {data.comfort.best_window_today && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t("bestTime")}: {data.comfort.best_window_today.start} - {data.comfort.best_window_today.end}
                  </p>
                )}
              </div>

              {/* Ocean Conditions */}
              <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 p-4">
                <h3 className="font-semibold mb-2">{t("ui.oceanConditions")}</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {data.ocean.water_temp_f && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">{t("ui.waterTemperature")}:</span>{" "}
                      <span className="font-medium">{data.ocean.water_temp_f.toFixed(0)}°F</span>
                    </div>
                  )}
                  {data.ocean.swell.height_ft && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">{t("ui.waveHeight")}:</span>{" "}
                      <span className="font-medium">{data.ocean.swell.height_ft.toFixed(1)} ft</span>
                    </div>
                  )}
                  {data.ocean.tide_state && (
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">{t("tide")}:</span>{" "}
                      <span className="font-medium capitalize">{data.ocean.tide_state}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">{t("ui.uvIndex")}:</span>{" "}
                    <span className="font-medium">{data.weather.uv_index.toFixed(0)}</span>
                  </div>
                </div>
              </div>

              {/* Sewage Risk */}
              {data.pollution.south_bay_flag && (
                <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4">
                  <h3 className="font-semibold text-red-900 dark:text-red-400 mb-2">{t("sewageRisk")}</h3>
                  <p className="text-sm text-red-800 dark:text-red-300 mb-2">{data.pollution.official_reason}</p>
                  <a
                    href={data.pollution.pfm_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-red-700 dark:text-red-400 underline"
                  >
                    {t("viewPFMData")} →
                  </a>
                </div>
              )}
            </>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t("failedToLoad")}</p>
          )}
        </div>
      </div>
    </>
  )
}
