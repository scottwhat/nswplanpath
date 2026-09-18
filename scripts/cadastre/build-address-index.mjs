#!/usr/bin/env node
/**
 * Harvested address NDJSON -> a static prefix-sharded search index.
 *
 * Vector tiles are the wrong shape for a typeahead: the user is searching a
 * string, not looking at a map extent. So addresses get their own structure —
 * a set of gzipped JSON shards keyed by address prefix, plus a manifest.
 *
 * Shards are adaptive. A fixed prefix length splits terribly on NSW addresses:
 * "12 " alone matches every number-12 address in the state. Instead a shard
 * starts at PREFIX_MIN characters and any shard over TARGET_SHARD_SIZE is split
 * by extending its prefix a character at a time until the pieces fit. The
 * manifest lists the prefixes that survived, so the client takes the longest
 * manifest prefix matching what has been typed, fetches that one file, and
 * filters in memory.
 *
 * The result is one ~30-60 KB request per new prefix instead of one API call
 * per keystroke, and it is all static files behind a CDN.
 *
 * Usage: node scripts/cadastre/build-address-index.mjs
 */

import { createReadStream } from 'node:fs'
import { mkdir, writeFile, rm, readdir } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RAW = join(ROOT, 'data', 'cadastre', 'raw', 'addresses')
const OUT = join(ROOT, 'apps', 'web', 'public', 'address-index')

/** Below this the client should not query at all — matches MIN_QUERY_LENGTH. */
const PREFIX_MIN = 4
/** Deepest prefix we will split to. Beyond this a shard is just allowed to be big. */
const PREFIX_MAX = 8
/** Records per shard. ~2k rows gzips to roughly 40 KB. */
const TARGET_SHARD_SIZE = 2000

/**
 * Must stay identical to normaliseAddressQuery() in packages/shared — the
 * shard key is derived from it, so any drift silently misses matches.
 */
function normalise(input) {
  return input
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\bNEW SOUTH WALES\b|\bNSW\b/g, ' ')
    .replace(/\b\d{4}\b\s*$/, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Prefixes become filenames; keep them to a safe, case-stable alphabet. */
function encodePrefix(prefix) {
  return Buffer.from(prefix, 'utf8').toString('hex')
}

async function main() {
  let files
  try {
    files = (await readdir(RAW)).filter((f) => f.endsWith('.ndjson'))
  } catch {
    console.error(`no harvested addresses in ${RAW} — run: node scripts/cadastre/harvest.mjs addresses`)
    process.exit(1)
  }
  if (files.length === 0) {
    console.error(`no .ndjson chunks in ${RAW}`)
    process.exit(1)
  }

  // Pass 1: bucket every address by its PREFIX_MIN-character prefix. Rows are
  // kept as compact tuples — at 4.25M records the JSON key names would cost
  // more than the data.
  console.log(`==> reading ${files.length} chunk files`)
  const buckets = new Map()
  let total = 0
  let skipped = 0

  for (const file of files) {
    const stream = createInterface({
      input: createReadStream(join(RAW, file)),
      crlfDelay: Infinity,
    })
    for await (const line of stream) {
      if (!line) continue
      const feature = JSON.parse(line)
      const address = feature.properties?.address
      const gurasid = feature.properties?.gurasid
      const coordinates = feature.geometry?.coordinates
      if (typeof address !== 'string' || typeof gurasid !== 'number' || !coordinates) {
        skipped += 1
        continue
      }
      const normalised = normalise(address)
      if (normalised.length < PREFIX_MIN) {
        skipped += 1
        continue
      }
      const key = normalised.slice(0, PREFIX_MIN)
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = []
        buckets.set(key, bucket)
      }
      // [address, gurasid, lon, lat] — coordinates already rounded on harvest.
      bucket.push([normalised, gurasid, coordinates[0], coordinates[1]])
      total += 1
    }
    process.stdout.write(`    ${total.toLocaleString()} addresses\r`)
  }
  console.log(`\n    ${total.toLocaleString()} addresses (${skipped.toLocaleString()} skipped)`)

  // Pass 2: split any oversized bucket by lengthening its prefix.
  console.log('==> splitting oversized shards')
  const shards = []
  const queue = [...buckets.entries()]
  buckets.clear()

  while (queue.length > 0) {
    const [prefix, rows] = queue.pop()
    if (rows.length <= TARGET_SHARD_SIZE || prefix.length >= PREFIX_MAX) {
      shards.push([prefix, rows])
      continue
    }
    const children = new Map()
    const short = []
    for (const row of rows) {
      // A row whose address ends exactly at this prefix cannot go deeper.
      if (row[0].length <= prefix.length) {
        short.push(row)
        continue
      }
      const key = row[0].slice(0, prefix.length + 1)
      let child = children.get(key)
      if (!child) {
        child = []
        children.set(key, child)
      }
      child.push(row)
    }
    if (short.length > 0) shards.push([prefix, short])
    for (const entry of children) queue.push(entry)
  }

  // Pass 3: write the shards, sorted so the client can render without sorting.
  console.log(`==> writing ${shards.length.toLocaleString()} shards`)
  await rm(OUT, { recursive: true, force: true })
  await mkdir(join(OUT, 'shards'), { recursive: true })

  const manifest = {}
  let bytes = 0
  let largest = 0

  for (const [prefix, rows] of shards) {
    rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    const payload = gzipSync(Buffer.from(JSON.stringify(rows), 'utf8'), { level: 9 })
    await writeFile(join(OUT, 'shards', `${encodePrefix(prefix)}.json.gz`), payload)
    manifest[prefix] = rows.length
    bytes += payload.length
    largest = Math.max(largest, payload.length)
  }

  await writeFile(
    join(OUT, 'manifest.json'),
    JSON.stringify({
      version: 1,
      built_at: new Date().toISOString().slice(0, 10),
      source: 'NSW Geocoded Addressing Theme, layer 1',
      prefix_min: PREFIX_MIN,
      prefix_max: PREFIX_MAX,
      total,
      shards: manifest,
    }),
  )

  console.log(
    `    ${(bytes / 1e6).toFixed(1)} MB total, largest shard ${(largest / 1e3).toFixed(0)} KB`,
  )
}

await main()
