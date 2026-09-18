import { z } from 'zod'
import registryJson from '../../../data/layer-registry.json'

/**
 * `data/layer-registry.json` is the only place a service URL, layer id or field
 * name is allowed to live (CLAUDE.md §Conventions). Validated on load so a
 * moved layer or a typo fails here rather than as an empty map.
 */

const layerSchema = z.object({
  name: z.string(),
  service: z.string().url(),
  layer_id: z.number().int(),
  geometry_type: z.string(),
  service_crs: z.string(),
  query_out_crs: z.literal('EPSG:4326'),
  max_record_count: z.number().int().optional(),
  min_scale: z.number().optional(),
  query_format: z.enum(['esriJSON', 'geoJSON']),
  cors: z.string().optional(),
  key_fields: z.record(z.string(), z.string()),
})

const registrySchema = z.object({
  verified_at: z.string(),
  layers: z.record(z.string(), layerSchema),
  geocoder: z.object({
    provider: z.literal('nsw_address_point'),
  }),
})

export type LayerEntry = z.infer<typeof layerSchema>

export const layerRegistry = registrySchema.parse(registryJson)

export function getLayer(id: string): LayerEntry {
  const layer = layerRegistry.layers[id]
  if (!layer) {
    throw new Error(`Unknown layer "${id}" — check data/layer-registry.json`)
  }
  return layer
}

/** `{service}/{layer_id}/query` — built from the registry, never hardcoded. */
export function layerQueryUrl(id: string): string {
  const layer = getLayer(id)
  return `${layer.service}/${layer.layer_id}/query`
}
