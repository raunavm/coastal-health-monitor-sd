"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import type { Report } from "@/lib/types"
import { formatDate } from "@/lib/format"
import { useI18n } from "@/lib/i18n"

export default function AdminPage() {
  const { t } = useI18n()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      fetchReports()
    }
  }, [])

  const fetchReports = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/reports?all=true")
      const data = await res.json()
      setReports(data.reports || [])
    } catch (error) {
      console.error("Error fetching reports:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleModerate = async (reportId: string, approved: boolean) => {
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      })

      if (res.ok) {
        fetchReports()
      } else {
        alert(t("error"))
      }
    } catch (error) {
      console.error("Error moderating report:", error)
      alert(t("error"))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-900">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-950 border-b border-gray-200 dark:border-neutral-800 px-4 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold">{t("adminDashboard")}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t("moderateReports")}</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">{t("noReportsToModerate")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div
                key={report.id}
                className="bg-white dark:bg-neutral-950 rounded-2xl border border-gray-200 dark:border-neutral-800 p-6 shadow-sm"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{report.type === "odor" ? "👃" : "🗑️"}</span>
                      <div>
                        <h3 className="font-semibold capitalize">
                          {t(report.type)} {t("reportTypeLabel")}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(report.created_at)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        report.severity === 1
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400"
                          : report.severity === 2
                            ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400"
                            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400"
                      }`}
                    >
                      {t("severityLabel")} {report.severity}
                    </span>
                    {report.moderated && (
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          report.approved
                            ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        {report.approved ? t("approved") : t("rejected")}
                      </span>
                    )}
                  </div>
                </div>

                {report.note && (
                  <div className="mb-4 p-3 bg-gray-50 dark:bg-neutral-900 rounded-lg">
                    <p className="text-sm">{report.note}</p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span>
                      {t("beachId")}: {report.beach_id}
                    </span>
                    <span className="mx-2">•</span>
                    <span>
                      {t("location")}: {report.lat.toFixed(4)}, {report.lng.toFixed(4)}
                    </span>
                  </div>

                  {!report.moderated && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleModerate(report.id, false)}
                        className="bg-transparent"
                      >
                        {t("reject")}
                      </Button>
                      <Button size="sm" onClick={() => handleModerate(report.id, true)}>
                        {t("approve")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
