"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { MapCanvas } from "@/components/map-canvas"
import { BeachSheet } from "@/components/beach-sheet"
import type { Beach } from "@/lib/types"
import { Button } from "@/components/ui/button"

export default function MapPage() {
  const [selectedBeach, setSelectedBeach] = useState<Beach | null>(null)
  const router = useRouter()

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3">
        <h1 className="text-xl font-semibold">San Diego Beach Map</h1>
      </header>

      <div className="flex-1 relative">
        <Button
          onClick={() => router.push("/")}
          variant="outline"
          size="sm"
          className="fixed left-4 top-20 z-50 rounded-lg border px-3 py-1.5 bg-white/90 dark:bg-neutral-900/90 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          aria-label="Back to Home"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        <MapCanvas onBeachClick={(beach) => setSelectedBeach(beach)} />
      </div>

      {selectedBeach && <BeachSheet beach={selectedBeach} onClose={() => setSelectedBeach(null)} />}
    </div>
  )
}
