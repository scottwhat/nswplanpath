# PlanPath — Document Corpus Manifest

Everything the Bedrock Knowledge Base needs, in download order. Hand this file to Claude Code and let it work top to bottom.

**Ground rules for the downloader**
- Do **not** guess deep URLs. Start at the canonical root listed for each tier, navigate/search, and record the resolved URL in `manifest.lock.json`.
- Prefer HTML from `legislation.nsw.gov.au` over PDF — it's structured, clause-numbered and versioned. Take the **in force** version, not a historical one.
- Record for every file: `doc_id`, `title`, `instrument_type`, `scope` (state/local), `lga` (or `null`), `version`/`commencement date`, `source_url`, `downloaded_at`, `sha256`.
- Every file in S3 needs a sidecar `<filename>.metadata.json` for Bedrock KB filtering (schema at the bottom).
- Respect robots.txt and rate-limit council scrapes to ~1 req/sec.

---

## Tier 1 — Legislation (state-wide, highest authority)

Root: `https://legislation.nsw.gov.au` → browse "In force" → Acts / Environmental Planning Instruments.

**Acts and Regulations**
- [x] Environmental Planning and Assessment Act 1979
- [x] Environmental Planning and Assessment Regulation 2021
- [x] Local Government Act 1993 (approvals under s68 only — extract Part 1 of Schedule)
- [x] Heritage Act 1977
- [x] Biodiversity Conservation Act 2016 (+ Biodiversity Conservation Regulation 2017)
- [x] Roads Act 1993 (s138 works in road reserve)
- [x] Building and Development Certifiers Act 2018
- [x] Design and Building Practitioners Act 2020
- [x] Water Management Act 2000 (controlled activity approvals only)
- [x] Rural Fires Act 1997 (s100B bushfire safety authority)
- [x] Coastal Management Act 2016

**State Environmental Planning Policies — download all of these in full**
- [x] SEPP (Exempt and Complying Development Codes) 2008 — *the largest and most important single document*
- [x] SEPP (Housing) 2021
- [x] SEPP (Transport and Infrastructure) 2021
- [x] SEPP (Resilience and Hazards) 2021
- [x] SEPP (Biodiversity and Conservation) 2021
- [x] SEPP (Industry and Employment) 2021
- [x] SEPP (Primary Production) 2021
- [x] SEPP (Planning Systems) 2021 — SSD/SSI schedules
- [x] SEPP (Sustainable Buildings) 2022 — BASIX
- [x] SEPP (Precincts — Eastern Harbour City) 2021
- [x] SEPP (Precincts — Central River City) 2021
- [x] SEPP (Precincts — Western Parkland City) 2021
- [x] SEPP (Precincts — Regional) 2021
- [x] Standard Instrument — Principal Local Environmental Plan (the Order itself)
- [ ] Any SEPP amendments commenced in the last 24 months (check the "recently made" list — housing reform SEPPs change frequently; capture what's currently in force)

---

## Tier 2 — Local instruments (per pilot LGA)

For each of the 3–5 pilot LGAs:

- [x] The council's **Local Environmental Plan** (from `legislation.nsw.gov.au`, in-force version). Chunk by clause; the Standard Instrument numbering makes this consistent across councils.
- [x] The council's **Development Control Plan** — all parts/chapters, from the council website. Usually 5–20 PDFs. This is the messiest part of the corpus.
- [x] The council's **s7.11 / s7.12 Contributions Plan(s)** and any Local Infrastructure Contributions Plan.
- [x] Council **flood policy / flood planning level** documents.
- [x] Council **Local Housing Strategy** and **Local Strategic Planning Statement** (context for merit questions only — tag as `advisory`).
- [x] Council **fee schedule** for the current financial year (DA/CDC lodgement fees, inspection fees).
- [x] Council **standard conditions of consent** document if published — gold for the conditions library.

Also grab, once:
- [x] Any applicable **Regional or District Plan** (Greater Sydney regional plan; relevant district plan).

---

## Tier 3 — Guidance and interpretive material

- [x] Planning for Bush Fire Protection 2019 (NSW RFS)
- [x] Apartment Design Guide (if you extend beyond low-density)
- [x] NSW Planning Guidelines for Complying Development / Codes SEPP guides
- [x] Planning Circulars (last 5 years) from `planning.nsw.gov.au`
- [x] Departmental practice notes relevant to residential development
- [ ] NSW Planning Portal help/FAQ pages on DA vs CDC vs exempt
- [x] Flood Risk Management Manual (DCCEEW)
- [ ] Building Code of Australia / NCC — **reference only, do not ingest** (licensing). Cite by clause number.
- [x] Land & Environment Court planning principles — a curated list of ~15 judgments (view/privacy/overshadowing, cl 4.6 variation, existing use rights). Tag `scope: advisory` and give them the lowest retrieval weight.

---

## Tier 4 — Spatial services (APIs, not documents — register endpoints, don't download)

Record these in `data/layer-registry.json` with layer id, service URL, field mappings and CRS:

- [ ] ePlanning address/property API (address → propertyId → lot/DP)
- [ ] NSW Digital Cadastre (DCDB) FeatureServer
- [ ] Planning Portal Principal Planning Layers (Zoning, MLS, HOB, FSR, Heritage, Land Reservation Acquisition, Foreshore Building Line, Acid Sulfate Soils, Terrestrial Biodiversity, Urban Release Area, Additional Permitted Uses, Local Provisions)
- [ ] Bushfire Prone Land
- [ ] Flood-related layers (per council, where published)
- [ ] Coastal management areas
- [ ] Biodiversity Values Map
- [ ] State Heritage Register (Heritage NSW)
- [ ] AHIMS (presence flag only)
- [ ] SIX Maps imagery/WMS for basemap fallback

For each layer, capture in the registry: `layer_id`, `url`, `key_fields`, `crs`, `last_verified`. Layer URLs and field names change — the registry is a config file, never hardcoded in Lambda source.

---

## S3 layout

```
s3://planpath-corpus/
  state/acts/epa-act-1979.html
  state/acts/epa-act-1979.html.metadata.json
  state/sepp/codes-sepp-2008.html
  state/sepp/housing-sepp-2021.html
  local/{lga-slug}/lep/{lga}-lep-2013.html
  local/{lga-slug}/dcp/part-b-residential.pdf
  local/{lga-slug}/contributions/s7-12-plan.pdf
  guidance/pbp-2019.pdf
  manifest.lock.json
```

## Metadata sidecar schema

```json
{
  "metadataAttributes": {
    "doc_id":          { "value": { "type": "STRING", "stringValue": "housing-sepp-2021" }, "includeForEmbedding": false },
    "title":           { "value": { "type": "STRING", "stringValue": "SEPP (Housing) 2021" }, "includeForEmbedding": true },
    "instrument_type": { "value": { "type": "STRING", "stringValue": "SEPP" }, "includeForEmbedding": true },
    "scope":           { "value": { "type": "STRING", "stringValue": "state" }, "includeForEmbedding": false },
    "lga":             { "value": { "type": "STRING", "stringValue": "ALL" }, "includeForEmbedding": false },
    "version":         { "value": { "type": "STRING", "stringValue": "2026-06-01" }, "includeForEmbedding": false },
    "authority_tier":  { "value": { "type": "NUMBER", "numberValue": 1 }, "includeForEmbedding": false },
    "source_url":      { "value": { "type": "STRING", "stringValue": "https://…" }, "includeForEmbedding": false }
  }
}
```

`instrument_type` values: `ACT | REGULATION | SEPP | LEP | DCP | CONTRIBUTIONS_PLAN | GUIDELINE | CASE_LAW | COUNCIL_POLICY`.
`authority_tier`: 1 = legislation, 2 = local instrument, 3 = guidance, 4 = advisory. Use it to order citations in the output.

## Chunking

- **HTML legislation:** custom chunk **by clause**. Split on clause headings, keep the clause number and its parent Part/Division in every chunk header. Do not use naive fixed-size chunking here — it severs conditions from their clause and is the number one source of wrong answers.
- **PDF DCPs:** hierarchical chunking (parent 1500 tokens / child 300), prepend the chapter and section heading to each child chunk.
- Prepend a one-line context header to every chunk: `[{title} | {lga} | {clause}]`.

## Refresh

- Legislation: re-check monthly; `legislation.nsw.gov.au` exposes commencement dates — diff and re-ingest changed instruments.
- DCPs: quarterly.
- Any re-ingest triggers a full eval run before the new KB version goes live.
