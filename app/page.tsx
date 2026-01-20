"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { MapPin, FileText, Settings, Sparkles, TrendingUp, Waves, Sun } from "lucide-react"
import { LanguageToggle } from "@/components/language-toggle"
import { SearchBar } from "@/components/search-bar"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/lib/i18n"
import { haversine } from "@/lib/haversine"
import { getRecentBeaches } from "@/lib/recent-beaches"
import { ForecastStrip, ForecastStripSkeleton } from "@/components/forecast-strip"
import { summarizeTilesNearBeach, type Summary } from "@/lib/forecast/fromTiles"
import { getNowEnv } from "@/lib/env/nowEnv"
import { useRouter } from "next/navigation"

interface Beach {
  id: string
  name: string
  lat: number
  lng: number
  distance?: number
}

export default function HomePage() {
  const { t } = useI18n()
  const router = useRouter()
  const [beaches, setBeaches] = useState<Beach[]>([])
  const [loading, setLoading] = useState(true)
  const [locationStatus, setLocationStatus] = useState<"checking" | "granted" | "denied" | "unavailable">("checking")
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

  const [forecastBeach, setForecastBeach] = useState<Beach | null>(null)
  const [forecasts, setForecasts] = useState<Record<string, { summary: Summary | null; devMock?: boolean }>>({})
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastError, setForecastError] = useState(false)

  useEffect(() => {
    const initializePage = async () => {
      setLoading(true)

      // Try to get user location
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const userLat = position.coords.latitude
            const userLng = position.coords.longitude
            setUserLocation({ lat: userLat, lng: userLng })
            setLocationStatus("granted")

            // Fetch all beaches and calculate distances
            try {
              const res = await fetch("/api/sd/beaches")
              if (res.ok) {
                const data = await res.json()
                const beachesWithDistance = data.features.map((feature: any) => ({
                  id: feature.properties.OBJECTID?.toString() || feature.properties.name,
                  name: feature.properties.name || "Unknown Beach",
                  lat: feature.geometry.coordinates[1],
                  lng: feature.geometry.coordinates[0],
                  distance: haversine(
                    userLat,
                    userLng,
                    feature.geometry.coordinates[1],
                    feature.geometry.coordinates[0],
                  ),
                }))

                // Sort by distance and take top 5
                beachesWithDistance.sort((a: Beach, b: Beach) => (a.distance || 0) - (b.distance || 0))
                setBeaches(beachesWithDistance.slice(0, 5))
              }
            } catch (error) {
              console.error("Error fetching beaches:", error)
            }

            setLoading(false)
          },
          () => {
            setLocationStatus("denied")
            // Load recent beaches instead
            const recent = getRecentBeaches()
            if (recent.length > 0) {
              setBeaches(
                recent.slice(0, 5).map((b) => ({
                  id: b.id,
                  name: b.name,
                  lat: b.lat,
                  lng: b.lng,
                })),
              )
            }
            setLoading(false)
          },
        )
      } else {
        setLocationStatus("unavailable")
        // Load recent beaches
        const recent = getRecentBeaches()
        if (recent.length > 0) {
          setBeaches(
            recent.slice(0, 5).map((b) => ({
              id: b.id,
              name: b.name,
              lat: b.lat,
              lng: b.lng,
            })),
          )
        }
        setLoading(false)
      }
    }

    initializePage()
  }, [])

  useEffect(() => {
    if (!forecastBeach) return

    const fetchForecasts = async () => {
      setForecastLoading(true)
      setForecastError(false)

      try {
        const envBundle = await getNowEnv(forecastBeach.lat, forecastBeach.lng)
        const timeHorizons: Array<"now" | "t24" | "t48" | "t72"> = ["now", "t24"]

        const results = await Promise.all(
          timeHorizons.map(async (when) => {
            try {
              const res = await fetch(`/api/tiles?when=${when}`)
              const data = await res.json()

              if (!res.ok || !data.success) {
                const errorMsg = data.error || `HTTP ${res.status}`
                console.error(`[v0] Error fetching ${when} forecast:`, errorMsg)
                return { when, summary: null, devMock: false }
              }

              const summary = summarizeTilesNearBeach(data.data?.cells || [], forecastBeach, envBundle, undefined)
              return { when, summary, devMock: data.devMock || false }
            } catch (err) {
              console.error(`[v0] Error fetching ${when} forecast:`, err)
              return { when, summary: null, devMock: false }
            }
          }),
        )

        const newForecasts: Record<string, { summary: Summary | null; devMock?: boolean }> = {}
        results.forEach(({ when, summary, devMock }) => {
          newForecasts[when] = { summary, devMock }
        })
        setForecasts(newForecasts)
      } catch (error) {
        console.error("[v0] Error fetching forecasts:", error)
        setForecastError(true)
      } finally {
        setForecastLoading(false)
      }
    }

    fetchForecasts()
  }, [forecastBeach])

  useEffect(() => {
    if (beaches.length > 0 && !forecastBeach) {
      setForecastBeach(beaches[0])
    }
  }, [beaches, forecastBeach])

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-50 dark:from-neutral-950 dark:to-neutral-900">
      {/* Header */}
      <header className="bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm border-b border-gray-200 dark:border-neutral-800 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            {t("appTitle")}
          </h1>
          <LanguageToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* AI Predictions Banner */}
        <div className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-600 rounded-xl">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-xl font-bold text-blue-900 dark:text-blue-400">{t("aiPredictions")}</h2>
                <span className="px-2 py-0.5 text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                  {t("aiAccuracy")}
                </span>
              </div>
              <p className="text-blue-800 dark:text-blue-300 text-sm mb-2">{t("aiDescription")}</p>
              <p className="text-blue-600 dark:text-blue-400 text-xs mb-3 flex items-center gap-1">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                {t("aiDataSource")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-blue-900 dark:text-blue-300">{t("safetyTrends")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Waves className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-blue-900 dark:text-blue-300">{t("waterQualityRisk")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Sun className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-blue-900 dark:text-blue-300">{t("comfortScores")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-blue-900 dark:text-blue-300">{t("bestTimeWindows")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {forecastBeach && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {t("aiPredictions")} - {forecastBeach.name}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {forecastLoading ? (
                <>
                  <ForecastStripSkeleton />
                  <ForecastStripSkeleton />
                </>
              ) : (
                <>
                  <ForecastStrip
                    when="now"
                    summary={forecasts.now?.summary || null}
                    error={forecastError}
                    devMock={forecasts.now?.devMock}
                    clickable
                    onTimeClick={(when) => router.push(`/map?when=${when}`)}
                  />
                  <ForecastStrip
                    when="t24"
                    summary={forecasts.t24?.summary || null}
                    error={forecastError}
                    devMock={forecasts.t24?.devMock}
                    clickable
                    onTimeClick={(when) => router.push(`/map?when=${when}`)}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* Search Bar */}
        <SearchBar />

        {/* Beach List or Empty State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
          </div>
        ) : beaches.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">
              {locationStatus === "granted" ? t("nearbyBeaches") : t("recentlyViewed")}
            </h2>
            <div className="space-y-3">
              {beaches.map((beach) => (
                <Link key={beach.id} href={`/beach/${beach.id}`}>
                  <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{beach.name}</h3>
                        {beach.distance !== undefined && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {beach.distance < 1
                              ? `${(beach.distance * 1000).toFixed(0)}${t("metersAway")}`
                              : `${beach.distance.toFixed(1)}${t("kmAway")}`}
                          </p>
                        )}
                      </div>
                      <div className="text-blue-600 dark:text-blue-400">→</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-6">
            <div className="inline-block p-6 bg-blue-100 dark:bg-blue-950/20 rounded-full">
              <MapPin className="h-12 w-12 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">{t("findPerfectBeach")}</h2>
              <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">{t("searchExplainer")}</p>
            </div>
            {locationStatus === "denied" && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-4 max-w-md mx-auto">
                <p className="text-sm text-amber-800 dark:text-amber-300">{t("enableLocation")}</p>
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          <Link href="/map">
            <Button variant="outline" className="w-full h-20 flex flex-col gap-2 bg-white dark:bg-neutral-950">
              <MapPin className="h-6 w-6" />
              <span className="text-sm">{t("map")}</span>
            </Button>
          </Link>
          <Link href="/report">
            <Button variant="outline" className="w-full h-20 flex flex-col gap-2 bg-white dark:bg-neutral-950">
              <FileText className="h-6 w-6" />
              <span className="text-sm">{t("report")}</span>
            </Button>
          </Link>
          <Link href="/settings">
            <Button variant="outline" className="w-full h-20 flex flex-col gap-2 bg-white dark:bg-neutral-950">
              <Settings className="h-6 w-6" />
              <span className="text-sm">{t("settings")}</span>
            </Button>
          </Link>
        </div>
      </main>
    </div>
  )
}
