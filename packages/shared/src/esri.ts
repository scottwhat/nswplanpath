import type { MultiPolygon, Polygon, Position } from 'geojson'

/**
 * Esri JSON polygon → GeoJSON.
 *
 * The NSW cadastre advertises `f=geojson` but answers 503 for it, so we take
 * Esri JSON and convert here. The two formats disagree on ring winding:
 *
 *   Esri:    exterior rings clockwise, holes counter-clockwise
 *   GeoJSON: exterior rings counter-clockwise, holes clockwise (RFC 7946)
 *
 * so every ring is reversed, and holes are attached to the exterior ring that
 * precedes them.
 */

export interface EsriPolygon {
  rings: Position[][]
  spatialReference?: { wkid?: number; latestWkid?: number }
}

/** Shoelace. Positive is counter-clockwise, negative is clockwise. */
function signedArea(ring: Position[]): number {
  let total = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    total += xj * yi - xi * yj
  }
  return total / 2
}

function isEsriExterior(ring: Position[]): boolean {
  return signedArea(ring) < 0
}

function closed(ring: Position[]): Position[] {
  if (ring.length === 0) return ring
  const [first] = ring
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
}

export function esriPolygonToGeoJSON(input: unknown): Polygon | MultiPolygon | null {
  const esri = input as EsriPolygon | null
  if (!esri || !Array.isArray(esri.rings) || esri.rings.length === 0) return null

  const polygons: Position[][][] = []
  for (const raw of esri.rings) {
    if (!Array.isArray(raw) || raw.length < 4) continue
    const ring = closed(raw)
    const exterior = isEsriExterior(ring)
    const rewound = [...ring].reverse()

    // A hole before any exterior ring is malformed; treat it as its own polygon
    // rather than dropping geometry on the floor.
    if (exterior || polygons.length === 0) {
      polygons.push([rewound])
    } else {
      polygons[polygons.length - 1].push(rewound)
    }
  }

  if (polygons.length === 0) return null
  if (polygons.length === 1) return { type: 'Polygon', coordinates: polygons[0] }
  return { type: 'MultiPolygon', coordinates: polygons }
}
