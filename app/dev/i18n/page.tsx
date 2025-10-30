"use client"

import { useEffect } from "react"
import { useI18n } from "@/lib/i18n"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function I18nSmokePage() {
  const { t, setLocale } = useI18n()

  // Force Spanish locale on mount
  useEffect(() => {
    setLocale("es")
  }, [setLocale])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-900">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-950 border-b border-gray-200 dark:border-neutral-800 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Spanish i18n Smoke Test</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white dark:bg-neutral-950 rounded-2xl border border-gray-200 dark:border-neutral-800 p-6 shadow-sm space-y-4">
          <h2 className="text-2xl font-bold mb-4">Spanish Translation Tests</h2>

          <div className="space-y-3">
            <TestRow
              label='t("ui.highWaves", { height: "8.0" })'
              expected="Olas altas: 8.0 ft"
              actual={t("ui.highWaves", { height: "8.0" })}
            />

            <TestRow
              label='t("ui.waterTempF", { temp: "66" })'
              expected="Agua 66°F"
              actual={t("ui.waterTempF", { temp: "66" })}
            />

            <TestRow label='t("ui.go")' expected="Adelante" actual={t("ui.go")} />

            <TestRow label='t("ui.slow")' expected="Precaución" actual={t("ui.slow")} />

            <TestRow label='t("ui.nogo")' expected="No entrar" actual={t("ui.nogo")} />

            <TestRow label='t("ui.now")' expected="Ahora" actual={t("ui.now")} />

            <TestRow label='t("ui.plus24h")' expected="+24 h" actual={t("ui.plus24h")} />

            <TestRow label='t("ui.plus48h")' expected="+48 h" actual={t("ui.plus48h")} />

            <TestRow label='t("ui.plus72h")' expected="+72 h" actual={t("ui.plus72h")} />

            <TestRow label='t("ui.searchPlaceholder")' expected="Buscar playas…" actual={t("ui.searchPlaceholder")} />
          </div>

          <div className="mt-6 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
            <p className="text-green-800 dark:text-green-300 font-medium">
              ✅ All translations should appear in Spanish above
            </p>
            <p className="text-sm text-green-700 dark:text-green-400 mt-1">
              If you see raw keys like "ui.highWaves" or English text, there's an i18n issue.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function TestRow({ label, expected, actual }: { label: string; expected: string; actual: string }) {
  const isMatch = actual === expected
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-neutral-800">
      <div className="flex-shrink-0 mt-1">
        {isMatch ? (
          <span className="text-green-600 dark:text-green-400 text-xl">✅</span>
        ) : (
          <span className="text-red-600 dark:text-red-400 text-xl">❌</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-mono text-gray-600 dark:text-gray-400 mb-1">{label}</div>
        <div className="text-base font-medium">
          <span className="text-gray-500 dark:text-gray-400">Expected: </span>
          <span className="text-gray-900 dark:text-gray-100">{expected}</span>
        </div>
        <div className="text-base font-medium">
          <span className="text-gray-500 dark:text-gray-400">Actual: </span>
          <span className={isMatch ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
            {actual}
          </span>
        </div>
      </div>
    </div>
  )
}
