"use client"

import type { AlertsResponse } from "@/lib/types"
import { useI18n } from "@/lib/i18n"

interface ComfortCardProps {
  data: AlertsResponse
}

export function ComfortCard({ data }: ComfortCardProps) {
  const { t } = useI18n()

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400"
    if (score >= 60) return "text-amber-600 dark:text-amber-400"
    return "text-red-600 dark:text-red-400"
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{t("ui.comfortScore")}</h2>
        <span className={`text-4xl font-bold ${getScoreColor(data.comfort.score_now)}`}>{data.comfort.score_now}</span>
      </div>

      {/* Why chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {data.comfort.why.map((reason, i) => (
          <span key={i} className="px-3 py-1 bg-gray-100 dark:bg-neutral-800 rounded-full text-sm">
            {reason}
          </span>
        ))}
      </div>

      {/* Best time today */}
      {data.comfort.best_window_today && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3 mb-4">
          <div className="text-sm font-medium text-blue-900 dark:text-blue-400">{t("bestTimeToday")}</div>
          <div className="text-lg font-semibold text-blue-700 dark:text-blue-300">
            {data.comfort.best_window_today.start} - {data.comfort.best_window_today.end}
          </div>
        </div>
      )}

      {/* Mini outlook */}
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("ui.now")}</div>
          <div className={`text-lg font-bold ${getScoreColor(data.comfort.score_now)}`}>{data.comfort.score_now}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("ui.plus24h")}</div>
          <div className={`text-lg font-bold ${getScoreColor(data.comfort.score_24h)}`}>{data.comfort.score_24h}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("ui.plus48h")}</div>
          <div className={`text-lg font-bold ${getScoreColor(data.comfort.score_48h)}`}>{data.comfort.score_48h}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t("ui.plus72h")}</div>
          <div className={`text-lg font-bold ${getScoreColor(data.comfort.score_72h)}`}>{data.comfort.score_72h}</div>
        </div>
      </div>
    </div>
  )
}
