"use client"

import { useEffect } from "react"
import { addRecentBeach } from "@/lib/recent-beaches"
import type { Beach } from "@/lib/types"

interface BeachPageClientProps {
  beach: Beach
}

export function BeachPageClient({ beach }: BeachPageClientProps) {
  useEffect(() => {
    addRecentBeach({
      id: beach.id.toString(),
      name: beach.name,
      lat: beach.lat,
      lng: beach.lng,
    })
  }, [beach])

  return null
}
