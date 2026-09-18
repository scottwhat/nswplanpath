/**
 * Esri JSON -> GeoJSON, a straight port of packages/shared/src/esri.ts.
 *
 * Kept as a separate plain-JS copy so the harvest scripts run under bare `node`
 * with no build step. If you change the winding rules here, change them there
 * too — cached geometry has to be byte-identical to what the live path draws.
 */

function signedArea(ring) {
  let total = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    total += xj * yi - xi * yj
  }
  return total / 2
}

function closed(ring) {
  if (ring.length === 0) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
}

export function esriPolygonToGeoJSON(input) {
  const esri = input
  if (!esri || !Array.isArray(esri.rings) || esri.rings.length === 0) return null

  const polygons = []
  for (const raw of esri.rings) {
    if (!Array.isArray(raw) || raw.length < 4) continue
    const ring = closed(raw)
    const exterior = signedArea(ring) < 0
    const rewound = [...ring].reverse()
    if (exterior || polygons.length === 0) polygons.push([rewound])
    else polygons[polygons.length - 1].push(rewound)
  }

  if (polygons.length === 0) return null
  if (polygons.length === 1) return { type: 'Polygon', coordinates: polygons[0] }
  return { type: 'MultiPolygon', coordinates: polygons }
}

/** Trim coordinates to ~1cm. Halves the file size and is well past cadastral accuracy. */
export function roundGeometry(geometry, precision = 7) {
  const p = 10 ** precision
  const r = (n) => Math.round(n * p) / p
  const ring = (coords) => coords.map(([x, y]) => [r(x), r(y)])
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates.map(ring) }
  }
  return { type: 'MultiPolygon', coordinates: geometry.coordinates.map((poly) => poly.map(ring)) }
}
