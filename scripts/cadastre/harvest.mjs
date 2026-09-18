#!/usr/bin/env node
/**
 * One-time bulk harvest of the NSW cadastre and address layers to local NDJSON.
 *
 * Why: every lot query and every address keystroke in the app currently hits
 * portal.spatial.nsw.gov.au directly. That is fine for one developer and a bad
 * idea for a public release — we would be a rate-limit incident waiting to
 * happen, and an outage there is an outage here. So we pull the data down once,
 * build static assets from it, and serve those ourselves.
 *
 * Paging strategy: keyset, not offset. `resultOffset` on a spatially filtered
 * query makes the server walk the whole result set again on every page, so deep
 * pages crawl. Instead the objectid space is split into fixed chunks and each
 * chunk is walked with `objectid > cursor AND objectid <= chunkEnd` ordered by
 * objectid — every request is an index seek, and the cursor is a resume point.
 *
 * Usage:
 *   node scripts/cadastre/harvest.mjs lots
 *   node scripts/cadastre/harvest.mjs addresses
 *   node scripts/cadastre/harvest.mjs lots --concurrency=6
 *
 * Re-running resumes from the checkpoint; nothing is re-downloaded.
 */

import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { esriPolygonToGeoJSON, roundGeometry } from './esri-geojson.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT_DIR = join(ROOT, 'data', 'cadastre', 'raw')

/**
 * Greater Sydney, generous at the edges: west to the Blue Mountains, north past
 * Hawkesbury, south to Wollondilly, east to the coast. Lots outside this box
 * fall back to the live service (see apps/web/src/lib/lots.ts).
 */
const SYDNEY_BBOX = { xmin: 150.0, ymin: -34.35, xmax: 151.65, ymax: -33.2 }

const PARCEL_SERVICE =
  'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/FeatureServer'
const ADDRESS_SERVICE =
  'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Geocoded_Addressing_Theme/FeatureServer'

const DATASETS = {
  lots: {
    url: `${PARCEL_SERVICE}/8/query`,
    oidField: 'objectid',
    fields: [
      'objectid',
      'lotidstring',
      'lotnumber',
      'sectionnumber',
      'planlabel',
      'planlotarea',
      'planlotareaunits',
    ],
    geometry: 'polygon',
    bbox: SYDNEY_BBOX,
    // Comfortably above the observed max objectid (4,135,292) so a few months
    // of new parcels are still covered without re-probing.
    oidMax: 4_600_000,
    chunkSize: 100_000,
  },
  addresses: {
    url: `${ADDRESS_SERVICE}/1/query`,
    oidField: 'rid',
    fields: ['rid', 'gurasid', 'address', 'housenumber'],
    geometry: 'point',
    // Statewide: address typeahead is the highest-volume caller and points are
    // cheap (no rings). ~4.25M records, a few hundred MB.
    bbox: null,
    oidMax: 5_200_000,
    chunkSize: 100_000,
  },
}

const PAGE_SIZE = 2000
const MAX_ATTEMPTS = 5

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      flags[key] = value ?? 'true'
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The service answers 503 under load rather than 429, and a transient 503 is
 * indistinguishable from a real one, so back off and retry either way. Failing
 * a chunk outright is fine — the checkpoint means a re-run picks it back up.
 */
async function fetchPage(dataset, cursor, chunkEnd) {
  const params = new URLSearchParams({
    where: `${dataset.oidField} > ${cursor} AND ${dataset.oidField} <= ${chunkEnd}`,
    outFields: dataset.fields.join(','),
    returnGeometry: 'true',
    outSR: '4326',
    orderByFields: dataset.oidField,
    resultRecordCount: String(PAGE_SIZE),
    f: 'json',
  })
  if (dataset.bbox) {
    params.set('geometry', JSON.stringify({ ...dataset.bbox, spatialReference: { wkid: 4326 } }))
    params.set('geometryType', 'esriGeometryEnvelope')
    params.set('spatialRel', 'esriSpatialRelIntersects')
    params.set('inSR', '4326')
  }

  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(dataset.url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params,
        signal: AbortSignal.timeout(180_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      const data = await response.json()
      if (data.error) throw new Error(data.error.message ?? 'query error')

      // Assert the CRS rather than trusting outSR — the same rule the app uses.
      const wkid = data.spatialReference?.latestWkid ?? data.spatialReference?.wkid
      if (data.features?.length && wkid !== 4326) {
        throw new Error(`expected EPSG:4326, got EPSG:${wkid ?? 'unknown'}`)
      }
      return data.features ?? []
    } catch (error) {
      lastError = error
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1))
    }
  }
  throw new Error(`page ${cursor}..${chunkEnd} failed after ${MAX_ATTEMPTS} attempts: ${lastError}`)
}

function toFeature(dataset, esri) {
  const attributes = esri.attributes ?? {}
  let geometry = null

  if (dataset.geometry === 'polygon') {
    const converted = esriPolygonToGeoJSON(esri.geometry)
    if (!converted) return null
    geometry = roundGeometry(converted)
  } else {
    const { x, y } = esri.geometry ?? {}
    if (typeof x !== 'number' || typeof y !== 'number') return null
    geometry = { type: 'Point', coordinates: [Math.round(x * 1e7) / 1e7, Math.round(y * 1e7) / 1e7] }
  }

  // Drop nulls: at this record count the empty keys cost real megabytes.
  const properties = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined && value !== '') properties[key] = value
  }
  return { type: 'Feature', geometry, properties }
}

async function loadCheckpoint(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return { done: [], counts: {} }
  }
}

async function saveCheckpoint(path, checkpoint) {
  await writeFile(`${path}.tmp`, JSON.stringify(checkpoint, null, 2))
  await rename(`${path}.tmp`, path)
}

async function harvestChunk(dataset, name, chunkStart, chunkEnd) {
  const path = join(OUT_DIR, name, `chunk-${String(chunkStart).padStart(9, '0')}.ndjson`)
  const stream = createWriteStream(`${path}.partial`)
  let cursor = chunkStart
  let written = 0

  for (;;) {
    const features = await fetchPage(dataset, cursor, chunkEnd)
    if (features.length === 0) break

    let lines = ''
    for (const esri of features) {
      const feature = toFeature(dataset, esri)
      if (feature) lines += `${JSON.stringify(feature)}\n`
      const oid = esri.attributes?.[dataset.oidField]
      if (typeof oid === 'number' && oid > cursor) cursor = oid
    }
    if (lines && !stream.write(lines)) {
      await new Promise((resolve) => stream.once('drain', resolve))
    }
    written += features.length
    if (features.length < PAGE_SIZE) break
  }

  await new Promise((resolve, reject) => {
    stream.end((error) => (error ? reject(error) : resolve()))
  })
  await rename(`${path}.partial`, path)
  return written
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2))
  const name = positional[0]
  const dataset = DATASETS[name]
  if (!dataset) {
    console.error(`usage: node scripts/cadastre/harvest.mjs <${Object.keys(DATASETS).join('|')}>`)
    process.exit(1)
  }

  const concurrency = Number(flags.concurrency ?? 6)
  // `--oid-max` exists so a short range can be run as a smoke test before
  // committing to the full harvest.
  if (flags['oid-max']) dataset.oidMax = Number(flags['oid-max'])
  await mkdir(join(OUT_DIR, name), { recursive: true })
  const checkpointPath = join(OUT_DIR, name, 'checkpoint.json')
  const checkpoint = await loadCheckpoint(checkpointPath)
  const done = new Set(checkpoint.done)

  const chunks = []
  for (let start = 0; start < dataset.oidMax; start += dataset.chunkSize) {
    if (!done.has(start)) chunks.push(start)
  }

  console.log(
    `[${name}] ${chunks.length} chunks to fetch (${done.size} already done), concurrency ${concurrency}`,
  )

  const startedAt = Date.now()
  let index = 0
  let completed = 0
  const failures = []

  async function worker() {
    for (;;) {
      const chunkStart = chunks[index++]
      if (chunkStart === undefined) return
      const chunkEnd = chunkStart + dataset.chunkSize
      try {
        const written = await harvestChunk(dataset, name, chunkStart, chunkEnd)
        checkpoint.done.push(chunkStart)
        checkpoint.counts[chunkStart] = written
        done.add(chunkStart)
      } catch (error) {
        failures.push({ chunkStart, message: String(error) })
        console.error(`  ! chunk ${chunkStart}: ${error}`)
      }
      completed += 1
      if (completed % 5 === 0 || completed === chunks.length) {
        await saveCheckpoint(checkpointPath, checkpoint)
        const total = Object.values(checkpoint.counts).reduce((a, b) => a + b, 0)
        const mins = (Date.now() - startedAt) / 60_000
        console.log(
          `  ${completed}/${chunks.length} chunks · ${total.toLocaleString()} features · ${mins.toFixed(1)} min`,
        )
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  await saveCheckpoint(checkpointPath, checkpoint)

  const total = Object.values(checkpoint.counts).reduce((a, b) => a + b, 0)
  console.log(`[${name}] done: ${total.toLocaleString()} features in ${checkpoint.done.length} chunks`)
  if (failures.length > 0) {
    console.error(`[${name}] ${failures.length} chunks failed — re-run to retry them`)
    process.exit(1)
  }
}

await main()
