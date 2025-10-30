"use client"
cat > lib/i18n.ts <<'TS'
"use client"

import React, { createContext, useContext, useMemo } from "react"
import translations from "./translations.json"

type Locale = "en" | "es"

type I18nShape = {
  locale: Locale
  t: (k: string, p?: Record<string, any>) => string
  setLocale: (l: Locale) => void
}

const I18nCtx = createContext<I18nShape>({
  locale: "en",
  t: (k) => k,
  setLocale: () => {},
})

function format(str: string, params?: Record<string, any>) {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`))
}

export function I18nProvider({ children, locale: initialLocale }: { children: React.ReactNode; locale?: Locale }) {
  const [locale, setLocale] = React.useState<Locale>(initialLocale || "en")

  React.useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("locale") : null
    if (saved === "en" || saved === "es") setLocale(saved)
  }, [])

  const value = useMemo<I18nShape>(() => {
    const t = (key: string, params?: Record<string, any>) => {
      const byLoc = (l: Locale) => (translations as any)[l]?.[key] as string | undefined
      const raw = byLoc(locale) ?? byLoc("en") ?? key
      return format(raw, params)
    }
    const set = (newLocale: Locale) => {
      setLocale(newLocale)
      if (typeof window !== "undefined") localStorage.setItem("locale", newLocale)
    }
    return { locale, t, setLocale: set }
  }, [locale])

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>
}

export function useI18n() {
  return useContext(I18nCtx)
}
