#!/usr/bin/env node
/**
 * NDJSON filter: raw DCDB attribute names -> the app's LotProperties shape.
 *
 * The harvested files stay exactly as the service returned them (lowercase,
 * unabbreviated, no derived fields) so they remain a faithful copy of the
 * source. The tiles, though, are read directly by the map, so the rename and
 * the label happen here — on the way into tippecanoe — rather than in either
 * the harvest or the browser.
 *
 * `label` is baked in because the alternative is a mapbox `concat` expression
 * reimplementing formatLotLabel() in a second language.
 *
 * Usage: cat chunk-*.ndjson | node scripts/cadastre/to-app-shape.mjs > lots.ndjson
 */

import { createInterface } from 'node:readline'

/** Must match formatLotLabel() in packages/shared/src/geo.ts. */
function formatLotLabel(lotNumber, sectionNumber, planLabel) {
  const parts = ['Lot', lotNumber ?? '?']
  if (sectionNumber) parts.push(`Sec ${sectionNumber}`)
  if (planLabel) parts.push(planLabel)
  return parts.join(' ')
}

const asString = (value) => (typeof value === 'string' && value.length > 0 ? value : null)

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
const out = []

for await (const line of lines) {
  if (!line) continue
  const feature = JSON.parse(line)
  const p = feature.properties ?? {}

  const lotNumber = asString(p.lotnumber)
  const sectionNumber = asString(p.sectionnumber)
  const planLabel = asString(p.planlabel)

  const properties = {
    lotIdString: asString(p.lotidstring) ?? '',
    label: formatLotLabel(lotNumber, sectionNumber, planLabel),
  }
  // Omit nulls rather than encoding them — tippecanoe would store a key per
  // feature for something the client already treats as absent.
  if (lotNumber) properties.lotNumber = lotNumber
  if (sectionNumber) properties.sectionNumber = sectionNumber
  if (planLabel) properties.planLabel = planLabel
  if (typeof p.planlotarea === 'number') properties.planLotArea = p.planlotarea

  out.push(JSON.stringify({ type: 'Feature', geometry: feature.geometry, properties }))
  if (out.length >= 5000) {
    process.stdout.write(`${out.join('\n')}\n`)
    out.length = 0
  }
}

if (out.length > 0) process.stdout.write(`${out.join('\n')}\n`)
