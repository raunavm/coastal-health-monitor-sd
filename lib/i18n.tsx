"use client"

import React, { createContext, useContext, useMemo } from "react"
import translations from "./translations.json"

type Locale = "en" | "es"
const I18nCtx = createContext<{ locale: Locale; t: (k: string, p?: Record<string, any>) => string }>({
  locale: "en",
  t: (k) => k,
})

function format(str: string, params?: Record<string, any>) {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`))
}

export function I18nProvider({ children, locale: initialLocale }: { children: React.ReactNode; locale?: Locale }) {
  const [locale, setLocale] = React.useState<Locale>(initialLocale || "en")

  React.useEffect(() => {
    // Load locale from localStorage on mount
    const saved = localStorage.getItem("locale")
    if (saved === "en" || saved === "es") {
      setLocale(saved)
    }
  }, [])

  const value = useMemo(() => {
    const t = (key: string, params?: Record<string, any>) => {
      const byLoc = (l: Locale) => (translations as any)[l]?.[key] as string | undefined
      // 1) try current locale  2) fallback to EN  3) show key (never blank)
      const raw = byLoc(locale) ?? byLoc("en") ?? key
      return format(raw, params)
    }
    return { locale, t }
  }, [locale])

  // Expose setLocale for language toggle
  ;(value as any).setLocale = (newLocale: Locale) => {
    setLocale(newLocale)
    localStorage.setItem("locale", newLocale)
  }

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nCtx)
  return { ...ctx, setLocale: (ctx as any).setLocale }
}
