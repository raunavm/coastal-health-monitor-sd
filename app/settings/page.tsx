"use client"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"

export default function SettingsPage() {
  const { t } = useI18n()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-900">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-950 border-b border-gray-200 dark:border-neutral-800 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">{t("settings")}</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Language */}
        <div className="bg-white dark:bg-neutral-950 rounded-2xl border border-gray-200 dark:border-neutral-800 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">{t("language")}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t("settings.languageDescription")}</p>
        </div>

        {/* Units */}
        <div className="bg-white dark:bg-neutral-950 rounded-2xl border border-gray-200 dark:border-neutral-800 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">{t("units")}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{t("settings.unitsDescription")}</p>
        </div>

        {/* Disclaimer */}
        <div className="bg-white dark:bg-neutral-950 rounded-2xl border border-gray-200 dark:border-neutral-800 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">{t("disclaimer")}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{t("settings.disclaimerFull")}</p>
        </div>

        {/* About */}
        <div className="bg-white dark:bg-neutral-950 rounded-2xl border border-gray-200 dark:border-neutral-800 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">{t("about")}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{t("settings.aboutDescription")}</p>
          <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            <p>{t("dataSources")}:</p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>{t("settings.dataSource1")}</li>
              <li>{t("settings.dataSource2")}</li>
              <li>{t("settings.dataSource3")}</li>
              <li>{t("settings.dataSource4")}</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  )
}
