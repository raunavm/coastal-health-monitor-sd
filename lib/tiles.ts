import { beachToGeomId } from "@/lib/geom"

export async function buildTilesUrl(when: string, beach?: {name: string, lat: number, lng: number}) {
  let b = beach
  if (!b) {
    const j = await fetch("/api/sd/beaches", { cache: "no-store" }).then(r => r.json())
    b = (j?.beaches && j.beaches[0]) || { name: "Imperial Beach", lat: 32.5742, lng: -117.1331 }
  }
  const geomId = beachToGeomId(b.name)
  return `/api/tiles?when=${when}&geomId=${geomId}&lat=${b.lat}&lng=${b.lng}`
}
