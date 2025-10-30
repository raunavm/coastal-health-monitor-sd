"use client"

import { useI18n } from "@/lib/i18n"
import { Button } from "@/components/ui/button"

export function LanguageToggle() {
  const { locale, setLocale } = useI18n()

  return (
    <div className="flex gap-1 bg-gray-100 dark:bg-neutral-800 rounded-lg p-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocale("en")}
        className={`${locale === "en" ? "bg-white dark:bg-neutral-950 shadow-sm" : "bg-transparent"}`}
      >
        EN
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocale("es")}
        className={`${locale === "es" ? "bg-white dark:bg-neutral-950 shadow-sm" : "bg-transparent"}`}
      >
        ES
      </Button>
    </div>
  )
}
