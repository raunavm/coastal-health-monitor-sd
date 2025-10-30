"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import type { Beach } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/lib/i18n"

export function SearchBar() {
  const { t } = useI18n()
  const [query, setQuery] = useState("")
  const [beaches, setBeaches] = useState<Beach[]>([])
  const [results, setResults] = useState<Beach[]>([])
  const [showResults, setShowResults] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch beaches on mount
  useEffect(() => {
    const fetchBeaches = async () => {
      try {
        setLoading(true)
        const res = await fetch("/api/sd/beaches")
        const data = await res.json()
        setBeaches(data.beaches || [])
      } catch (error) {
        console.error("Error fetching beaches:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchBeaches()
  }, [])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim() === "") {
        setResults([])
        setShowResults(false)
        return
      }

      const filtered = beaches.filter((beach) => beach.name.toLowerCase().includes(query.toLowerCase())).slice(0, 10)

      setResults(filtered)
      setShowResults(true)
    }, 250)

    return () => clearTimeout(timer)
  }, [query, beaches])

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = (beach: Beach) => {
    setQuery("")
    setShowResults(false)
    router.push(`/beach/${beach.id}`)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <Input
          type="text"
          placeholder={t("ui.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query && setShowResults(true)}
          className="pl-10 bg-white dark:bg-neutral-950"
        />
      </div>

      {showResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg shadow-lg max-h-80 overflow-y-auto z-50">
          {loading ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">Loading...</div>
          ) : results.length > 0 ? (
            <div className="py-2">
              {results.map((beach) => (
                <button
                  key={beach.id}
                  onClick={() => handleSelect(beach)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-neutral-900 transition-colors"
                >
                  <div className="font-medium">{beach.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {beach.lat.toFixed(4)}, {beach.lng.toFixed(4)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">No beaches found</div>
          )}
        </div>
      )}
    </div>
  )
}
