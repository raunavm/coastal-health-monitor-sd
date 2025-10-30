"use client"

import { useI18n } from "@/lib/i18n"

export function ReportButtonClient() {
  const { t } = useI18n()
  return <>{t("ui.reportIssue")}</>
}
