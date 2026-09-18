import type { Position } from 'geojson'
import { z } from 'zod'

/** All spatial work is EPSG:4326 (CLAUDE.md §Conventions). */
export const lngLatSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
})
export type LngLat = z.infer<typeof lngLatSchema>

/** [west, south, east, north] */
export const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])
export type Bbox = z.infer<typeof bboxSchema>

export const lotSchema = z.object({
  /** e.g. "127//DP1971" as held by the DCDB */
  lotIdString: z.string(),
  lotNumber: z.string().nullable(),
  sectionNumber: z.string().nullable(),
  planLabel: z.string().nullable(),
  /** Area from the plan. Null is common — `unknown` is never `false`. */
  planLotArea: z.number().nullable(),
})
export type Lot = z.infer<typeof lotSchema>

/** "Lot 127 DP1971" — the label a planner expects to read. */
export function formatLotLabel(lot: Pick<Lot, 'lotNumber' | 'sectionNumber' | 'planLabel'>): string {
  const parts = ['Lot', lot.lotNumber ?? '?']
  if (lot.sectionNumber) parts.push(`Sec ${lot.sectionNumber}`)
  if (lot.planLabel) parts.push(lot.planLabel)
  return parts.join(' ')
}

/**
 * "127//DP1971" → the lot's parts. The DCDB packs lot/section/plan into one
 * string with an empty middle segment when there is no section, so this is the
 * inverse of that: it never fetches, and a shape it cannot read returns null
 * rather than a half-parsed lot.
 */
export function parseLotIdString(
  lotIdString: string,
): Pick<Lot, 'lotNumber' | 'sectionNumber' | 'planLabel'> | null {
  const parts = lotIdString.split('/')
  if (parts.length !== 3) return null
  const [lotNumber, sectionNumber, planLabel] = parts
  if (!lotNumber || !planLabel) return null
  return {
    lotNumber,
    sectionNumber: sectionNumber || null,
    planLabel,
  }
}

export const addressSuggestionSchema = z.object({
  /** NSW Geocoded Addressing Theme id — stable, and what the address point is keyed by. */
  gurasid: z.number().int(),
  /** As held by the address layer, e.g. "12 SMITH STREET MARRICKVILLE". */
  address: z.string(),
  longitude: z.number(),
  latitude: z.number(),
})
export type AddressSuggestion = z.infer<typeof addressSuggestionSchema>

/** "12 SMITH STREET MARRICKVILLE" → "12 Smith Street Marrickville". */
export function titleCaseAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\b[a-z]/g, (character) => character.toUpperCase())
    .replace(/\b(Nsw)\b/g, 'NSW')
}

/** [west, south, east, north] over a Polygon/MultiPolygon coordinate array. */
export function bboxOfPositions(coordinates: Position[][][] | Position[][]): Bbox {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity

  const visit = (position: Position) => {
    const [x, y] = position
    if (x < west) west = x
    if (x > east) east = x
    if (y < south) south = y
    if (y > north) north = y
  }

  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return
    if (typeof node[0] === 'number') {
      visit(node as Position)
      return
    }
    for (const child of node) walk(child)
  }

  walk(coordinates)
  return [west, south, east, north]
}
