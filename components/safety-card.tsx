"use client"

import type { AlertsResponse } from "@/lib/types"
import { useI18n } from "@/lib/i18n"

interface SafetyCardProps {
  data: AlertsResponse
}

export function SafetyCard({ data }: SafetyCardProps) {
  const { t } = useI18n()

  const statusColor =
    data.safety.status === "Go"
      ? "bg-green-600 text-white"
      : data.safety.status === "Slow"
        ? "bg-amber-500 text-white"
        : "bg-red-600 text-white"

  const translateRisk = (risk: string) => {
    if (risk === "Low") return t("ui.uv.level.low")
    if (risk === "Moderate") return t("ui.uv.level.moderate")
    return t("ui.uv.level.high")
  }

  const translateStatus = (status: string) => {
    if (status === "Go") return t("ui.go")
    if (status === "Slow") return t("ui.slow")
    return t("ui.nogo")
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{t("ui.beachSafety")}</h2>
        <span className={`px-4 py-2 rounded-full text-sm font-semibold ${statusColor}`}>
          {translateStatus(data.safety.status)}
        </span>
      </div>

      {/* Why chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {data.safety.why.map((reason, i) => (
          <span key={i} className="px-3 py-1 bg-gray-100 dark:bg-neutral-800 rounded-full text-sm">
            {reason}
          </span>
        ))}
      </div>

      {/* Mini outlook */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("ui.now")}</div>
          <div
            className={`text-xs font-medium px-2 py-1 rounded ${data.safety.risk_now === "Low"
                ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400"
                : data.safety.risk_now === "Moderate"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
                  : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400"
              }`}
          >
            {translateRisk(data.safety.risk_now)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("ui.plus24h")}</div>
          <div
            className={`text-xs font-medium px-2 py-1 rounded ${data.safety.risk_24h === "Low"
                ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400"
                : data.safety.risk_24h === "Moderate"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
                  : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400"
              }`}
          >
            {translateRisk(data.safety.risk_24h)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("ui.plus48h")}</div>
          <div
            className={`text-xs font-medium px-2 py-1 rounded ${data.safety.risk_48h === "Low"
                ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400"
                : data.safety.risk_48h === "Moderate"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
                  : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400"
              }`}
          >
            {translateRisk(data.safety.risk_48h)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("ui.plus72h")}</div>
          <div
            className={`text-xs font-medium px-2 py-1 rounded ${data.safety.risk_72h === "Low"
                ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400"
                : data.safety.risk_72h === "Moderate"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400"
                  : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400"
              }`}
          >
            {translateRisk(data.safety.risk_72h)}
          </div>
        </div>
      </div>

      {/* Source badges */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>{t("ui.sources")}</span>
        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded font-medium">
          EPA Water Quality
        </span>
        {data.safety.sources.map((source, i) => (
          <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-neutral-800 rounded">
            {source}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">{t("ui.asOfJustNow")}</p>
        <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full">
          AI-Powered
        </span>
      </div>
    </div>
  )
}
