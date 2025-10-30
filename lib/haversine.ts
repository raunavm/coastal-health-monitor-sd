// Calculate distance between two lat/lng points using Haversine formula

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversine(lat1, lng1, lat2, lng2)
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function findNearestBeach(
  lat: number,
  lng: number,
  beaches: { id: number; lat: number; lng: number; name: string }[],
): { id: number; lat: number; lng: number; name: string } | null {
  if (beaches.length === 0) return null

  let nearest = beaches[0]
  let minDistance = haversineDistance(lat, lng, nearest.lat, nearest.lng)

  for (const beach of beaches) {
    const distance = haversineDistance(lat, lng, beach.lat, beach.lng)
    if (distance < minDistance) {
      minDistance = distance
      nearest = beach
    }
  }

  return nearest
}
