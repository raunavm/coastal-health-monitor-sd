"use client"

import { useI18n } from "@/lib/i18n"
import type { AlertsResponse } from "@/lib/types"

interface BeachDetailClientProps {
  data: AlertsResponse
}

export function BeachDetailClient({ data }: BeachDetailClientProps) {
  const { t } = useI18n()

  return (
    <>
      {/* Ocean Conditions */}
      <div className="rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 shadow-sm">
        <h3 className="text-xl font-semibold mb-4">{t("ui.oceanConditions")}</h3>
        <div className="grid grid-cols-2 gap-4">
          {data.ocean.water_temp_f !== null && (
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{t("ui.waterTemperature")}</div>
              <div className="text-2xl font-bold">{data.ocean.water_temp_f.toFixed(1)}°F</div>
            </div>
          )}
          {data.ocean.swell.height_ft !== null && (
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{t("ui.waveHeight")}</div>
              <div className="text-2xl font-bold">{data.ocean.swell.height_ft.toFixed(1)} ft</div>
            </div>
          )}
          {data.ocean.swell.period_s !== null && (
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{t("ui.wavePeriod")}</div>
              <div className="text-2xl font-bold">{data.ocean.swell.period_s.toFixed(0)}s</div>
            </div>
          )}
          {data.ocean.tide_state && (
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{t("tide")}</div>
              <div className="text-2xl font-bold capitalize">{data.ocean.tide_state}</div>
            </div>
          )}
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{t("ui.uvIndex")}</div>
            <div className="text-2xl font-bold">
              {data.weather.uv_index.toFixed(1)}
              <span className="text-sm font-normal ml-1 text-gray-500 dark:text-gray-400">
                {data.weather.uv_index >= 8
                  ? `(${t("ui.uv.level.veryHigh")})`
                  : data.weather.uv_index >= 6
                    ? `(${t("ui.uv.level.high")})`
                    : data.weather.uv_index >= 3
                      ? `(${t("ui.uv.level.moderate")})`
                      : `(${t("ui.uv.level.low")})`}
              </span>
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{t("ui.wind")}</div>
            <div className="text-2xl font-bold">
              {data.weather.wind_mph.toFixed(0)} mph
              <span className="text-sm font-normal ml-1 text-gray-500 dark:text-gray-400">
                {data.weather.wind_dir_deg ? `${Math.round(data.weather.wind_dir_deg)}°` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Community Reports */}
      {data.community && data.community.level !== "none" && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-6">
          <h3 className="font-semibold text-amber-900 dark:text-amber-400 mb-3 text-lg">{t("ui.communityReports")}</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-amber-800 dark:text-amber-300">{t("ui.reportLevel")}</span>
              <span className="font-semibold text-amber-900 dark:text-amber-200 capitalize">
                {data.community.level}
              </span>
            </div>
            {data.community.type && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-amber-800 dark:text-amber-300">{t("ui.primaryIssue")}</span>
                <span className="font-semibold text-amber-900 dark:text-amber-200 capitalize">
                  {data.community.type}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-amber-200 dark:border-amber-800">
              <div>
                <div className="text-xs text-amber-700 dark:text-amber-400">{t("ui.last2Hours")}</div>
                <div className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  {data.community.counts.odor_2h} {t("odor").toLowerCase()}, {data.community.counts.debris_2h}{" "}
                  {t("debris").toLowerCase()}
                </div>
              </div>
              <div>
                <div className="text-xs text-amber-700 dark:text-amber-400">{t("ui.last24Hours")}</div>
                <div className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  {data.community.counts.odor_24h} {t("odor").toLowerCase()}, {data.community.counts.debris_24h}{" "}
                  {t("debris").toLowerCase()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sewage Warning */}
      {data.pollution.south_bay_flag && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-6">
          <h3 className="font-semibold text-red-900 dark:text-red-400 mb-2 text-lg">{t("ui.sewageRiskAlert")}</h3>
          <p className="text-red-800 dark:text-red-300 mb-3">{data.pollution.official_reason}</p>
          <a
            href={data.pollution.pfm_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-red-700 dark:text-red-400 underline font-medium"
          >
            {t("ui.viewPFMData")}
          </a>
        </div>
      )}
    </>
  )
}
