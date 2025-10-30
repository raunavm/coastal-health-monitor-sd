export interface RecentBeach {
  id: string
  name: string
  lat: number
  lng: number
  lastViewed: number
}

const MAX_RECENT_BEACHES = 10
const STORAGE_KEY = "recentBeaches"

export function addRecentBeach(beach: Omit<RecentBeach, "lastViewed">): void {
  if (typeof window === "undefined") return

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    let recent: RecentBeach[] = stored ? JSON.parse(stored) : []

    // Remove existing entry for this beach if it exists
    recent = recent.filter((b) => b.id !== beach.id)

    // Add new entry at the beginning
    recent.unshift({
      ...beach,
      lastViewed: Date.now(),
    })

    // Keep only the most recent beaches
    recent = recent.slice(0, MAX_RECENT_BEACHES)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent))
  } catch (error) {
    console.error("Error saving recent beach:", error)
  }
}

export function getRecentBeaches(): RecentBeach[] {
  if (typeof window === "undefined") return []

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch (error) {
    console.error("Error loading recent beaches:", error)
    return []
  }
}

export function clearRecentBeaches(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(STORAGE_KEY)
}
