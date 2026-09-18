#!/usr/bin/env node
/**
 * Reads every *.metadata.json sidecar in data/corpus/ plus data/layer-registry.json
 * and writes apps/web/src/data/kb-summary.json — the source for the
 * "Data and legislation" page.
 *
 * The page must never hand-type a document count or a currency date: run this
 * after any ingest so what the site claims and what is in the corpus agree.
 *
 *   node scripts/corpus/build-kb-summary.mjs
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const CORPUS = join(ROOT, 'data/corpus')
const OUT = join(ROOT, 'apps/web/src/data/kb-summary.json')

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

/** Normalise the assorted version strings into { label, iso, precision }. */
function parseVersion(raw) {
  if (!raw || raw === 'unknown') return { label: null, iso: null, precision: 'unknown' }

  // Medium-neutral citation: [2013] NSWLEC 1187 — the year is the currency.
  const cite = raw.match(/^\[(\d{4})\]/)
  if (cite) return { label: raw, iso: `${cite[1]}-01-01`, precision: 'year' }

  // "8 July 2026"
  const long = raw.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/)
  if (long && MONTHS[long[2].toLowerCase()]) {
    const m = String(MONTHS[long[2].toLowerCase()]).padStart(2, '0')
    return { label: raw, iso: `${long[3]}-${m}-${long[1].padStart(2, '0')}`, precision: 'day' }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { label: raw, iso: raw, precision: 'day' }
  if (/^\d{4}-\d{2}$/.test(raw)) return { label: raw, iso: `${raw}-01`, precision: 'month' }
  // "2024-25" and "2025-26" are financial years, not months.
  const fy = raw.match(/^(\d{4})-(\d{2})$/)
  if (fy && Number(fy[2]) < 13) return { label: raw, iso: `${raw}-01`, precision: 'month' }
  if (/^\d{4}-\d{2}$/.test(raw)) return { label: raw, iso: `${fy[1]}-07-01`, precision: 'year' }
  if (/^\d{4}$/.test(raw)) return { label: raw, iso: `${raw}-01-01`, precision: 'year' }

  return { label: raw, iso: null, precision: 'unknown' }
}

function attr(a, key) {
  return a?.[key]?.value?.stringValue ?? a?.[key]?.value?.numberValue ?? null
}

const docs = []
;(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(path)
    } else if (entry.name.endsWith('.metadata.json')) {
      const a = JSON.parse(readFileSync(path, 'utf8')).metadataAttributes ?? {}
      const rel = relative(CORPUS, path).replace(/\.metadata\.json$/, '')
      docs.push({
        doc_id: attr(a, 'doc_id'),
        title: attr(a, 'title'),
        instrument_type: attr(a, 'instrument_type'),
        scope: attr(a, 'scope'),
        lga: attr(a, 'lga'),
        tier: Number(attr(a, 'authority_tier')),
        source_url: attr(a, 'source_url'),
        version: parseVersion(attr(a, 'version')),
        path: rel,
        // corpus/<area>/<collection>/… — the folder is what separates a
        // principal instrument from an amendment, since both are typed SEPP.
        area: rel.split('/')[0],
        collection: rel.split('/').length > 2 ? rel.split('/')[1] : null,
        superseded: rel.includes('_superseded'),
        ingested_at: statSync(path).mtime.toISOString().slice(0, 10),
      })
    }
  }
})(CORPUS)

const live = docs.filter((d) => !d.superseded)

const count = (rows, key) => {
  const m = new Map()
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, count: n }))
}

const dated = (rows) => rows.map((r) => r.version.iso).filter(Boolean).sort()
const currency = (rows) => {
  const d = dated(rows)
  return {
    documents: rows.length,
    dated: d.length,
    undated: rows.length - d.length,
    earliest: d[0] ?? null,
    latest: d.at(-1) ?? null,
  }
}

const TIERS = [
  { tier: 1, id: 'legislation', label: 'Legislation' },
  { tier: 2, id: 'local', label: 'Local instruments' },
  { tier: 3, id: 'guidance', label: 'Guidance' },
  { tier: 4, id: 'advisory', label: 'Advisory' },
]

const summary = {
  $generated_by: 'scripts/corpus/build-kb-summary.mjs — do not hand-edit',
  generated_at: new Date().toISOString().slice(0, 10),
  totals: {
    documents: live.length,
    superseded_retained: docs.length - live.length,
    lgas: new Set(live.filter((d) => d.scope === 'local').map((d) => d.lga)).size,
    ingest_window: {
      first: [...new Set(docs.map((d) => d.ingested_at))].sort()[0],
      last: [...new Set(docs.map((d) => d.ingested_at))].sort().at(-1),
    },
  },
  by_instrument_type: count(live, (d) => d.instrument_type),
  tiers: TIERS.map(({ tier, id, label }) => {
    const rows = live.filter((d) => d.tier === tier)
    return {
      tier,
      id,
      label,
      ...currency(rows),
      instrument_types: count(rows, (d) => d.instrument_type),
    }
  }),
  // The principal instruments are few enough to list in full, and this is the
  // tier whose currency matters most — every one carries a commencement date.
  state_instruments: live
    .filter((d) => d.area === 'state')
    .filter((d) => ['acts', 'regulations', 'sepp'].includes(d.collection))
    .map((d) => ({
      doc_id: d.doc_id,
      title: d.title,
      instrument_type: d.instrument_type,
      version: d.version.label,
      iso: d.version.iso,
      source_url: d.source_url,
    }))
    .sort((a, b) => (b.iso ?? '').localeCompare(a.iso ?? '') || a.title.localeCompare(b.title)),
  councils: [...new Set(live.filter((d) => d.scope === 'local').map((d) => d.lga))]
    .sort()
    .map((lga) => {
      const rows = live.filter((d) => d.lga === lga)
      return {
        lga,
        documents: rows.length,
        types: count(rows, (d) => d.instrument_type),
        ...currency(rows),
      }
    })
    .sort((a, b) => b.documents - a.documents),
  // Amendment instruments are counted, not listed — they are only meaningful
  // read against the principal instrument they amend.
  amendments: ['sepp-amendments', 'sepp-transport-oriented-development'].map((collection) => {
    const rows = live.filter((d) => d.area === 'state' && d.collection === collection)
    return { collection, ...currency(rows) }
  }),
  guidance: count(
    live.filter((d) => d.tier === 3),
    (d) => (d.collection ? `${d.area}/${d.collection}` : d.area),
  ),
  layers: (() => {
    const reg = JSON.parse(readFileSync(join(ROOT, 'data/layer-registry.json'), 'utf8'))
    return {
      verified_at: reg.verified_at,
      geocoder: reg.geocoder?.provider ?? null,
      registered: Object.entries(reg.layers).map(([id, l]) => ({
        id,
        name: l.name,
        host: new URL(l.service).host,
        layer_id: l.layer_id,
        service_crs: l.service_crs,
        query_out_crs: l.query_out_crs,
        key_fields: Object.keys(l.key_fields ?? {}).length,
        status: l.$status ?? null,
      })),
    }
  })(),
}

writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`)
console.log(
  `${relative(ROOT, OUT)}: ${summary.totals.documents} documents, ` +
    `${summary.totals.lgas} councils, ${summary.tiers.length} tiers`,
)
