"use client"

import { useI18n } from "@/lib/i18n"
import type { Summary } from "@/lib/forecast/fromTiles"
import { AlertTriangle, CheckCircle, XCircle, Beaker } from "lucide-react"

type ForecastStripProps = {
  when: "now" | "t24" | "t48" | "t72"
  summary: Summary | null
  loading?: boolean
  error?: boolean
  devMock?: boolean
  beachName?: string
  clickable?: boolean
  onTimeClick?: (when: "now" | "t24" | "t48" | "t72") => void
}

export function ForecastStrip({
  when,
  summary,
  loading,
  error,
  devMock,
  beachName,
  clickable = false,
  onTimeClick,
}: ForecastStripProps) {
  const { t } = useI18n()

  const timeLabels = {
    now: t("ui.now"),
    t24: t("ui.plus24h"),
    t48: t("ui.plus48h"),
    t72: t("ui.plus72h"),
  }

  const safetyColors = {
    go: "bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-300 border-green-300 dark:border-green-800",
    slow: "bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800",
    nogo: "bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-800",
  }

  const safetyIcons = {
    go: <CheckCircle className="h-5 w-5" />,
    slow: <AlertTriangle className="h-5 w-5" />,
    nogo: <XCircle className="h-5 w-5" />,
  }

  const safetyLabels = {
    go: t("ui.go"),
    slow: t("ui.slow"),
    nogo: t("ui.nogo"),
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded w-16 mb-3" />
        <div className="h-6 bg-gray-200 dark:bg-neutral-800 rounded w-24 mb-2" />
        <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded w-full" />
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="rounded-xl border border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 p-4">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{timeLabels[when]}</div>
        <div className="text-sm text-gray-600 dark:text-gray-400">{t("forecast.unavailable")}</div>
        <div className="mt-2 h-1 bg-gray-200 dark:bg-neutral-800 rounded" />
      </div>
    )
  }

  const content = (
    <div
      className={`rounded-xl border ${safetyColors[summary.safety]} p-4 transition-all ${clickable ? "cursor-pointer hover:shadow-md" : ""
        }`}
      onClick={() => clickable && onTimeClick?.(when)}
    >
      {/* Time Label + Dev Mock Badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold uppercase tracking-wide">{timeLabels[when]}</div>
        <div className="flex items-center gap-2">
          {devMock && (
            <div
              className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 flex items-center gap-1"
              title="Dev mock data"
            >
              <Beaker className="h-3 w-3" />
              <span>{t("forecast.devMock")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Safety Status */}
      <div className="flex items-center gap-2 mb-3">
        {safetyIcons[summary.safety]}
        <span className="font-bold text-lg">{safetyLabels[summary.safety]}</span>
      </div>

      {/* Comfort Score */}
      <div className="mb-3">
        <div className="text-xs opacity-80 mb-1">{t("comfort")}</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-white/50 dark:bg-black/20 rounded-full overflow-hidden">
            <div className="h-full bg-current transition-all" style={{ width: `${summary.comfort}%` }} />
          </div>
          <span className="text-sm font-semibold">{summary.comfort}</span>
        </div>
      </div>

      {/* Why Chips */}
      {summary.why.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {summary.why.slice(0, 2).map((reason, i) => (
            <span key={i} className="text-xs px-2 py-1 rounded-full bg-white/50 dark:bg-black/20 font-medium">
              {reason.includes(":") || reason.includes("(") ? reason : t(reason)}
            </span>
          ))}
        </div>
      )}

      {/* Simple AI Badge */}
      <div className="mt-3 pt-3 border-t border-current/20 flex items-center justify-between">
        <span className="text-xs opacity-70">{t("aiForecast")}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-white/40 dark:bg-black/30 font-medium">
          {summary.uncertainty < 0.4 ? t("highConfidence") : t("moderateConfidence")}
        </span>
      </div>
    </div>
  )

  return content
}

export function ForecastStripSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded w-16 mb-3" />
      <div className="h-6 bg-gray-200 dark:bg-neutral-800 rounded w-24 mb-2" />
      <div className="h-4 bg-gray-200 dark:bg-neutral-800 rounded w-full mb-2" />
      <div className="h-2 bg-gray-200 dark:bg-neutral-800 rounded w-full" />
    </div>
  )
}
