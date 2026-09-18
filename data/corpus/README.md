# PlanPath — Document Corpus

Downloaded per `../../DOCUMENT_MANIFEST.md`. Every payload file has a sibling
`<filename>.metadata.json` sidecar in the Bedrock KB schema, and every file is
recorded in `manifest.lock.json` with `source_url`, `version`, `sha256` and
`downloaded_at`.

**597 files · ~2.4 GB · downloaded 2026-09-09/10**

## Layout

```
corpus/
  state/acts/            10  Acts (HTML, in-force, whole document)
  state/regulations/      2  Regulations (HTML)
  state/sepp/            14  SEPPs + Standard Instrument Order (HTML)
  local/{lga}/lep/        1  LEP per LGA (HTML, in-force)
  local/{lga}/dcp/…          DCP parts/chapters (PDF), sub-foldered by source DCP
  local/{lga}/contributions/ s7.11 / s7.12 plans, VPAs
  local/{lga}/fees/          current FY fee schedule
  local/{lga}/flood/         flood policy / planning-level documents
  local/{lga}/conditions/    standard/proforma conditions of consent
  local/{lga}/strategy/      LSPS + Local Housing Strategy  (tag: advisory)
  regional/                  The Sydney Plan + regional plans
  guidance/                  PBP 2019, ADG, complying-development guide, circulars, practice notes
  caselaw/planning-principles/  39 LEC judgments (tag: advisory, lowest weight)
  manifest.lock.json
```

## Folders prefixed with `_` are NOT for ingestion

| Folder | Why excluded |
|---|---|
| `_superseded/` | Repealed, draft or exhibition-stage instruments. Kept for provenance. |
| `_flood-maps/` | Raster flood extent/depth maps — no retrievable text. Spatial layers belong in Tier 4. |
| `_flood-studies/` | Technical catchment studies, not planning controls. Noise in a controls KB. |
| `regional/_superseded/` | Metropolis of Three Cities + 5 district plans, replaced by The Sydney Plan (13 Aug 2026). |

Sync only the non-`_` paths to S3.

## Source notes

- **Legislation** is HTML from `legislation.nsw.gov.au`, taken from
  `/view/whole/html/inforce/current/{id}` — the whole-document view, so clause
  bodies are present, not just the table of contents. IDs were resolved from the
  site's own in-force A–Z index (1,588 instruments), never guessed.
- The site is behind a Cloudflare JS challenge; plain `curl` gets 403. All fetches
  ran through a real Chromium (Playwright) with a persistent profile, rate-limited
  to ~1 req/sec.
- **Inner West** is an amalgamated council: the former Ashfield, Leichhardt and
  Marrickville DCPs still apply to their respective former LGA areas, so they are
  under `dcp/{leichhardt,marrickville,ashfield}/` as *current*, not superseded.
  Retrieval for an Inner West site should filter to the correct former-LGA sub-DCP.
- **Case law** is the Land and Environment Court's own published planning-principles
  list, not a hand-picked selection.

## Deliberately not downloaded

- **Building Code of Australia / NCC** — licensing. Cite by clause number, per the manifest.
- **Tier 4 spatial services** — APIs to register in `data/layer-registry.json`, not documents.

## Refresh

`manifest.lock.json` holds a `sha256` per file. Re-run the fetchers and diff hashes
to find changed instruments. Legislation monthly, DCPs quarterly.
