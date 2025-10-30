"use client"

import { useEffect, useRef, useState } from "react"
import type { Beach, CountyStatus } from "@/lib/types"
import { normalizeBeachName } from "@/lib/normalize"
import { useI18n } from "@/lib/i18n"

interface MapCanvasProps {
  onBeachClick?: (beach: Beach) => void
}

export function MapCanvas({ onBeachClick }: MapCanvasProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [loaded, setLoaded] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    // Load MapLibre GL JS from CDN
    const loadMapLibre = async () => {
      // Add CSS
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"
      document.head.appendChild(link)

      // Load script
      const script = document.createElement("script")
      script.src = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"
      script.async = true

      script.onload = () => {
        initMap()
      }

      document.head.appendChild(script)
    }

    const initMap = async () => {
      const maplibregl = (window as any).maplibregl

      if (!maplibregl) {
        console.error("MapLibre GL JS not loaded")
        return
      }

      const mapInstance = new maplibregl.Map({
        container: mapContainer.current!,
        style: {
          version: 8,
          sources: {
            carto: {
              type: "raster",
              tiles: [
                "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
                "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
                "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
                "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
              ],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            },
          },
          layers: [
            {
              id: "carto-voyager",
              type: "raster",
              source: "carto",
              minzoom: 0,
              maxzoom: 20,
            },
          ],
        },
        center: [-117.25, 32.75], // San Diego
        zoom: 10,
        attributionControl: true,
        logoPosition: "bottom-left",
      })

      mapRef.current = mapInstance

      mapInstance.addControl(new maplibregl.NavigationControl(), "top-right")

      mapInstance.on("load", async () => {
        setLoaded(true)
        await loadBeachData(mapInstance, maplibregl)
      })
    }

    const loadBeachData = async (mapInstance: any, maplibregl: any) => {
      try {
        if (!mapInstance) {
          console.error("Map instance is null")
          return
        }

        // Fetch beaches and status
        const [beachesRes, statusRes] = await Promise.all([fetch("/api/sd/beaches"), fetch("/api/sd/status")])

        const beachesData = await beachesRes.json()
        const statusData = await statusRes.json()

        if (!beachesData.beaches || beachesData.beaches.length === 0) {
          console.warn("No beaches data available")
          return
        }

        // Join beaches with status and fetch community data
        const beachesWithStatus = await Promise.all(
          beachesData.beaches.map(async (beach: Beach) => {
            const normalized = normalizeBeachName(beach.name)
            const status = statusData.beaches?.find((s: CountyStatus) => {
              const statusNormalized = normalizeBeachName(s.name)
              return statusNormalized === normalized || s.name.toLowerCase().includes(beach.name.toLowerCase())
            })

            // Fetch community summary
            let communityLevel = "none"
            try {
              const communityRes = await fetch(
                `/api/community/summary?beach_id=${beach.id}&lat=${beach.lat}&lng=${beach.lng}`,
              )
              if (communityRes.ok) {
                const communityData = await communityRes.json()
                communityLevel = communityData.level
              }
            } catch (error) {
              console.error(`Failed to fetch community data for ${beach.name}:`, error)
            }

            return {
              ...beach,
              status: status?.status || "open",
              reason: status?.reason,
              communityLevel,
            }
          }),
        )

        // Create GeoJSON source
        const geojson = {
          type: "FeatureCollection",
          features: beachesWithStatus.map((beach: any) => ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [beach.lng, beach.lat],
            },
            properties: {
              id: beach.id,
              name: beach.name,
              status: beach.status,
              reason: beach.reason,
              communityLevel: beach.communityLevel,
            },
          })),
        }

        mapInstance.addSource("beaches", {
          type: "geojson",
          data: geojson,
        })

        mapInstance.addLayer({
          id: "beaches-circle",
          type: "circle",
          source: "beaches",
          paint: {
            "circle-radius": 12,
            "circle-color": [
              "match",
              ["get", "status"],
              "open",
              "#10b981", // emerald-500
              "advisory",
              "#f59e0b", // amber-500
              "closure",
              "#ef4444", // red-500
              "#6b7280", // gray-500 fallback
            ],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.9,
          },
        })

        mapInstance.addLayer({
          id: "beaches-glow",
          type: "circle",
          source: "beaches",
          paint: {
            "circle-radius": 18,
            "circle-color": [
              "match",
              ["get", "status"],
              "open",
              "#10b981",
              "advisory",
              "#f59e0b",
              "closure",
              "#ef4444",
              "#6b7280",
            ],
            "circle-opacity": 0.2,
            "circle-blur": 0.8,
          },
        })

        // Add click handler
        mapInstance.on("click", "beaches-circle", (e: any) => {
          if (!e.features || e.features.length === 0) return

          const feature = e.features[0]
          const { id, name, status, reason, communityLevel } = feature.properties
          const [lng, lat] = feature.geometry.coordinates

          const statusText = status === "open" ? t("open") : status === "advisory" ? t("advisory") : t("closed")
          const communityText =
            communityLevel === "none"
              ? `${t("communityFeedback")}: ${t("communityNone")}`
              : `${t("communityFeedback")}: ${communityLevel.charAt(0).toUpperCase() + communityLevel.slice(1)}`

          const popup = new maplibregl.Popup({ offset: 20, closeButton: true, closeOnClick: false })
            .setLngLat([lng, lat])
            .setHTML(
              `
              <div style="padding: 12px; min-width: 220px; font-family: system-ui, -apple-system, sans-serif;">
                <h3 style="margin: 0 0 10px 0; font-weight: 600; font-size: 15px; color: #111827;">${name}</h3>
                <div style="margin-bottom: 10px;">
                  <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; background: ${
                    status === "open" ? "#10b981" : status === "advisory" ? "#f59e0b" : "#ef4444"
                  }; color: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    ${statusText}
                  </span>
                </div>
                ${reason ? `<p style="margin: 0 0 10px 0; font-size: 13px; color: #6b7280; line-height: 1.4;">${reason}</p>` : ""}
                <p style="margin: 0 0 12px 0; font-size: 12px; color: #9ca3af; font-weight: 500;">${communityText}</p>
                <button 
                  onclick="window.dispatchEvent(new CustomEvent('beach-click', { detail: { id: ${id}, name: '${name}', lat: ${lat}, lng: ${lng} } }))"
                  style="margin-top: 4px; padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; width: 100%; transition: background 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.1);"
                  onmouseover="this.style.background='#1d4ed8'"
                  onmouseout="this.style.background='#2563eb'"
                >
                  ${t("viewDetails")}
                </button>
              </div>
            `,
            )
            .addTo(mapInstance)
        })

        // Change cursor on hover
        mapInstance.on("mouseenter", "beaches-circle", () => {
          mapInstance.getCanvas().style.cursor = "pointer"
        })

        mapInstance.on("mouseleave", "beaches-circle", () => {
          mapInstance.getCanvas().style.cursor = ""
        })
      } catch (error) {
        console.error("Error loading beach data:", error)
      }
    }

    loadMapLibre()

    // Listen for beach click events from popup
    const handleBeachClick = (e: any) => {
      if (onBeachClick) {
        const { id, name, lat, lng } = e.detail
        onBeachClick({ id, name, lat, lng })
      }
    }

    window.addEventListener("beach-click", handleBeachClick)

    return () => {
      window.removeEventListener("beach-click", handleBeachClick)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [onBeachClick, t])

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full rounded-lg overflow-hidden" />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-neutral-900 rounded-lg">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent" />
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t("loadingMap")}</p>
          </div>
        </div>
      )}
    </div>
  )
}
