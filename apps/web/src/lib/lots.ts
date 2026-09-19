import {
  escapeSqlLiteral,
  esriPolygonToGeoJSON,
  formatLotLabel,
  geodesicArea,
  getLayer,
  layerQueryUrl,
  type Bbox,
  type LotArea,
} from '@planpath/shared'
import type { LngLat } from '@planpath/shared'
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson'

/**
 * Lot geometry straight from the NSW DCDB.
 *
 * The service advertises geoJSON as a supported query format but returns HTTP
 * 503 for `f=geojson` (probed 2026-09-09, recorded in data/layer-registry.json),
 * so we ask for Esri JSON in EPSG:4326 and convert. The CRS is asserted on the
 * way in rather than assumed.
 */

const LAYER_ID = 'cadastre_lot'

export interface LotProperties {
  lotIdString: string
  lotNumber: string | null
  sectionNumber: string | null
  planLabel: string | null
  planLotArea: number | null
  /** The plan area when the DCDB has one (about 2% of lots), else measured from the polygon. */
  area: LotArea
  label: string
}

export type LotFeature = Feature<Polygon | MultiPolygon, LotProperties>
export type LotCollection = FeatureCollection<Polygon | MultiPolygon, LotProperties>

interface EsriResponse {
  spatialReference?: { wkid?: number; latestWkid?: number }
  features?: { attributes: Record<string, unknown>; geometry: unknown }[]
  exceededTransferLimit?: boolean
  error?: { message?: string }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A spatial filter for `queryLots`. */
function intersecting(
  geometry: object,
  geometryType: 'esriGeometryEnvelope' | 'esriGeometryPoint',
): Record<string, string> {
  return {
    geometry: JSON.stringify(geometry),
    geometryType,
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
  }
}

/**
 * Only a square-metre plan area is trusted as-is. Every populated planlotarea
 * seen so far is "Meters"; anything else falls back to measuring rather than
 * guessing a conversion.
 */
function lotArea(
  planLotArea: number | null,
  units: string | null,
  geometry: Polygon | MultiPolygon,
): LotArea {
  if (planLotArea != null && planLotArea > 0 && units === 'Meters') {
    return { squareMetres: planLotArea, source: 'plan' }
  }
  return { squareMetres: geodesicArea(geometry), source: 'calculated' }
}

async function queryLots(
  filter: Record<string, string>,
  signal?: AbortSignal,
): Promise<LotFeature[]> {
  const layer = getLayer(LAYER_ID)
  const fields = layer.key_fields

  const params = new URLSearchParams({
    outSR: '4326',
    outFields: Object.values(fields).join(','),
    returnGeometry: 'true',
    f: 'json',
    ...filter,
  })

  const response = await fetch(`${layerQueryUrl(LAYER_ID)}?${params}`, { signal })
  if (!response.ok) {
    throw new Error(`Cadastre query failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as EsriResponse
  if (data.error) {
    throw new Error(`Cadastre query failed: ${data.error.message ?? 'unknown error'}`)
  }

  // Assert the CRS instead of trusting outSR (CLAUDE.md §Conventions).
  const wkid = data.spatialReference?.latestWkid ?? data.spatialReference?.wkid
  if (wkid !== 4326) {
    throw new Error(`Cadastre returned EPSG:${wkid ?? 'unknown'}, expected EPSG:4326`)
  }

  return (data.features ?? []).flatMap((feature) => {
    const geometry = esriPolygonToGeoJSON(feature.geometry)
    if (!geometry) return []

    const attributes = feature.attributes
    const lot = {
      lotIdString: asString(attributes[fields.lot_id]) ?? '',
      lotNumber: asString(attributes[fields.lot_number]),
      sectionNumber: asString(attributes[fields.section_number]),
      planLabel: asString(attributes[fields.plan_label]),
      planLotArea: asNumber(attributes[fields.plan_area]),
    }
    const units = asString(attributes[fields.plan_area_units])

    return [
      {
        type: 'Feature' as const,
        id: lot.lotIdString,
        geometry,
        properties: { ...lot, area: lotArea(lot.planLotArea, units, geometry), label: formatLotLabel(lot) },
      },
    ]
  })
}

/** Every lot intersecting the current viewport. */
export async function fetchLotsInBbox(bbox: Bbox, signal?: AbortSignal): Promise<LotCollection> {
  const [west, south, east, north] = bbox
  const layer = getLayer(LAYER_ID)
  const features = await queryLots(
    {
      ...intersecting(
        { xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } },
        'esriGeometryEnvelope',
      ),
      resultRecordCount: String(layer.max_record_count ?? 1000),
    },
    signal,
  )
  return { type: 'FeatureCollection', features }
}

/**
 * The one lot containing an address point. This is the spatial link between an
 * address and its parcel; the authoritative link is the propertyId, which
 * arrives with the site service (build plan step 1).
 *
 * Returns null rather than throwing when nothing intersects — an address point
 * can sit on a road reserve or in a strata block, and `unknown` is never
 * `false` (CLAUDE.md rule 4).
 */
export async function fetchLotAtPoint(
  point: LngLat,
  signal?: AbortSignal,
): Promise<LotFeature | null> {
  const features = await queryLots(
    {
      ...intersecting(
        { x: point.longitude, y: point.latitude, spatialReference: { wkid: 4326 } },
        'esriGeometryPoint',
      ),
      resultRecordCount: '1',
    },
    signal,
  )
  return features[0] ?? null
}

/** One lot by its DCDB lotidstring, e.g. "102//DP1090074". */
export async function fetchLotById(
  lotIdString: string,
  signal?: AbortSignal,
): Promise<LotFeature | null> {
  const fields = getLayer(LAYER_ID).key_fields
  const features = await queryLots(
    { where: `${fields.lot_id} = '${escapeSqlLiteral(lotIdString)}'`, resultRecordCount: '1' },
    signal,
  )
  return features[0] ?? null
}

/**
 * The layer has a 1:100,000 min scale and a 2,000-feature cap — asking for lots
 * across a whole city returns a truncated, misleading set. Only query when the
 * viewport is small enough to be honest.
 */
export const LOT_MIN_ZOOM = 15

/** Round the bbox so small map nudges reuse the cached response. */
export function quantiseBbox(bbox: Bbox, precision = 3): Bbox {
  const round = (value: number) => Number(value.toFixed(precision))
  return [round(bbox[0]), round(bbox[1]), round(bbox[2]), round(bbox[3])]
}
