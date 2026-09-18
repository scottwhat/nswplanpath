import {
  escapeSqlLiteral,
  getLayer,
  layerQueryUrl,
  normaliseAddressQuery,
  type AddressSuggestion,
} from '@planpath/shared'

/**
 * Address suggestions from the NSW Geocoded Addressing Theme — real NSW address
 * points, so a picked suggestion is an address that exists rather than a
 * best-effort match from a general-purpose geocoder.
 *
 * The `address` column is indexed for prefix matching only: `LIKE 'X%'` answers
 * in ~0.2s, while an embedded wildcard took 12s when probed. So the query is
 * anchored, and the user has to type in the layer's own order
 * ("12 Smith Street Marrickville") — which is the order people type anyway.
 */

const LAYER_ID = 'address_point'

/** Below this, a prefix match returns thousands of rows and helps nobody. */
export const MIN_QUERY_LENGTH = 4

interface EsriPointResponse {
  spatialReference?: { wkid?: number; latestWkid?: number }
  features?: { attributes: Record<string, unknown>; geometry: { x: number; y: number } | null }[]
  error?: { message?: string }
}

export async function suggestAddresses(
  rawQuery: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const normalised = normaliseAddressQuery(rawQuery)
  if (normalised.length < MIN_QUERY_LENGTH) return []

  const layer = getLayer(LAYER_ID)
  const fields = layer.key_fields

  const params = new URLSearchParams({
    where: `${fields.address} LIKE '${escapeSqlLiteral(normalised)}%'`,
    outFields: [fields.address, fields.gurasid].join(','),
    returnGeometry: 'true',
    outSR: '4326',
    orderByFields: fields.address,
    resultRecordCount: '8',
    f: 'json',
  })

  const response = await fetch(`${layerQueryUrl(LAYER_ID)}?${params}`, { signal })
  if (!response.ok) {
    throw new Error(`Address lookup failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as EsriPointResponse
  if (data.error) {
    throw new Error(`Address lookup failed: ${data.error.message ?? 'unknown error'}`)
  }

  const wkid = data.spatialReference?.latestWkid ?? data.spatialReference?.wkid
  if (data.features?.length && wkid !== 4326) {
    throw new Error(`Address layer returned EPSG:${wkid ?? 'unknown'}, expected EPSG:4326`)
  }

  return (data.features ?? []).flatMap((feature) => {
    const address = feature.attributes[fields.address]
    const gurasid = feature.attributes[fields.gurasid]
    if (typeof address !== 'string' || typeof gurasid !== 'number' || !feature.geometry) {
      return []
    }
    return [
      {
        gurasid,
        address,
        longitude: feature.geometry.x,
        latitude: feature.geometry.y,
      },
    ]
  })
}
