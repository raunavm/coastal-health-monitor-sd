"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useI18n } from "@/lib/i18n"
import { haversine } from "@/lib/haversine"
import type { ReportType, Beach } from "@/lib/types"

export function ReportForm() {
  const { t } = useI18n()
  const [type, setType] = useState<ReportType>("odor")
  const [severity, setSeverity] = useState<1 | 2 | 3>(2)
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const [beaches, setBeaches] = useState<Beach[]>([])
  const [selectedBeachId, setSelectedBeachId] = useState<string>("")
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationWarning, setLocationWarning] = useState(false)
  const [loadingLocation, setLoadingLocation] = useState(false)

  useEffect(() => {
    const fetchBeaches = async () => {
      try {
        const res = await fetch("/api/sd/beaches")
        if (res.ok) {
          const data = await res.json()
          if (data.features) {
            const beachList: Beach[] = data.features.map((f: any) => ({
              id: f.properties.OBJECTID?.toString() || f.properties.name,
              name: f.properties.name,
              lat: f.geometry.coordinates[1],
              lng: f.geometry.coordinates[0],
            }))
            setBeaches(beachList)
            if (beachList.length > 0) {
              setSelectedBeachId(beachList[0].id)
            }
          }
        }
      } catch (error) {
        console.error("Error fetching beaches:", error)
      }
    }
    fetchBeaches()
  }, [])

  useEffect(() => {
    if (navigator.geolocation) {
      setLoadingLocation(true)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          })
          setLoadingLocation(false)
        },
        () => {
          setLoadingLocation(false)
        },
      )
    }
  }, [])

  useEffect(() => {
    if (userLocation && selectedBeachId) {
      const selectedBeach = beaches.find((b) => b.id === selectedBeachId)
      if (selectedBeach) {
        const distance = haversine(userLocation.lat, userLocation.lng, selectedBeach.lat, selectedBeach.lng)
        setLocationWarning(distance > 5)
      }
    }
  }, [userLocation, selectedBeachId, beaches])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedBeachId) {
      alert(t("selectBeach"))
      return
    }

    const selectedBeach = beaches.find((b) => b.id === selectedBeachId)
    if (!selectedBeach) return

    setSubmitting(true)

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          severity,
          lat: selectedBeach.lat,
          lng: selectedBeach.lng,
          note: note.trim() || undefined,
        }),
      })

      if (res.ok) {
        setSuccess(true)
        setNote("")
        setTimeout(() => setSuccess(false), 3000)
      } else {
        alert(t("error"))
      }
    } catch (error) {
      console.error("Error submitting report:", error)
      alert(t("error"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="bg-white dark:bg-neutral-950 rounded-2xl border border-gray-200 dark:border-neutral-800 p-6 shadow-sm mb-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">{t("helpKeepBeachesClean")}</h2>
          <p className="text-gray-600 dark:text-gray-400">{t("reportDescription")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label className="text-base font-semibold mb-3 block">{t("selectBeach")}</Label>
            <select
              value={selectedBeachId}
              onChange={(e) => setSelectedBeachId(e.target.value)}
              className="w-full p-3 rounded-lg border-2 border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
            >
              {beaches.map((beach) => (
                <option key={beach.id} value={beach.id}>
                  {beach.name}
                </option>
              ))}
            </select>
            {loadingLocation && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t("gettingLocation")}</p>}
          </div>

          {locationWarning && userLocation && (
            <div className="rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20 p-4">
              <h4 className="font-semibold text-amber-900 dark:text-amber-400 mb-2">⚠️ {t("locationWarning")}</h4>
              <p className="text-sm text-amber-800 dark:text-amber-300 mb-3">{t("locationFarWarning")}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLocationWarning(false)}
                  className="text-amber-900 dark:text-amber-400"
                >
                  {t("continueAnyway")}
                </Button>
              </div>
            </div>
          )}

          {/* Type Selection */}
          <div>
            <Label className="text-base font-semibold mb-3 block">{t("reportType")}</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType("odor")}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  type === "odor"
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950/20"
                    : "border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
                }`}
              >
                <div className="text-2xl mb-1">👃</div>
                <div className="font-medium">{t("odor")}</div>
              </button>
              <button
                type="button"
                onClick={() => setType("debris")}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  type === "debris"
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950/20"
                    : "border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
                }`}
              >
                <div className="text-2xl mb-1">🗑️</div>
                <div className="font-medium">{t("debris")}</div>
              </button>
            </div>
          </div>

          {/* Severity Selection */}
          <div>
            <Label className="text-base font-semibold mb-3 block">{t("severity")}</Label>
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSeverity(level as 1 | 2 | 3)}
                  className={`p-3 rounded-lg border-2 transition-colors ${
                    severity === level
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-950/20"
                      : "border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
                  }`}
                >
                  <div className="font-semibold">{level}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    {level === 1 ? t("mild") : level === 2 ? t("moderate") : t("severe")}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <Label htmlFor="note" className="text-base font-semibold mb-3 block">
              {t("additionalDetails")}
            </Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("describeObservation")}
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Submit Button */}
          <Button type="submit" disabled={submitting} className="w-full h-12 text-base font-semibold">
            {submitting ? t("submitting") : t("submitReport")}
          </Button>

          {success && (
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4 text-center">
              <p className="text-green-800 dark:text-green-300 font-medium">{t("reportSuccess")}</p>
              <p className="text-sm text-green-700 dark:text-green-400 mt-1">{t("reportReview")}</p>
            </div>
          )}
        </form>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-400 mb-2">{t("aboutReports")}</h3>
        <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
          <li>• {t("reportsBullet1")}</li>
          <li>• {t("reportsBullet2")}</li>
          <li>• {t("reportsBullet3")}</li>
        </ul>
      </div>
    </div>
  )
}
