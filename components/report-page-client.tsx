"use client"

import { useI18n } from "@/lib/i18n"

export function ReportPageTitle() {
  const { t } = useI18n()
  return <h1 className="text-xl font-semibold">{t("ui.reportIssue")}</h1>
}
