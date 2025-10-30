// Normalize beach names for joining County status with GeoJSON data

export function normalizeBeachName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+beach$/i, "")
    .replace(/^beach\s+/i, "")
}
