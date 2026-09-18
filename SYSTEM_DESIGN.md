# PlanPath — System Design

**What it is:** a public-facing web app where a person enters an address and describes what they want to build. The app resolves the lot, pulls every planning layer that applies, runs a deterministic rules pass, then makes **one** Bedrock call that returns a structured planning-pathway assessment: pathway, approvals, assessments needed, indicative costs, contributions, likely conditions, and constraints.

**Scope discipline (beta):** planning *pathway* assessment only. No traffic modelling, no contamination assessment, no BASIX certificate generation, no BAL calculation. Where a specialist study is triggered, the output says "you will need X, expect $Y, prepared by Z" — it does not attempt the study.

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Vite + React + TS (CloudFront + S3)                         │
│  • TanStack Router (file-based, typed params)                │
│  • TanStack Query (server state) + Zustand (client state)    │
│  • Address autocomplete                                      │
│  • Mapbox GL map — lot polygon from DCDB, fitBounds to lot   │
│  • Proposal form (dev type, GFA, storeys, etc.)              │
│  • Editable Site Facts panel (every assumption overridable)  │
│  • Results view: verdict → criteria → costs → conditions     │
└───────────────┬──────────────────────────────────────────────┘
                │ POST /assess   (single request/response)
┌───────────────▼──────────────────────────────────────────────┐
│  API Gateway (HTTP API) → Lambda: assess                     │
│                                                              │
│  1. resolveSite(address)      → propertyId, lot/DP, geometry │
│  2. buildSiteContext(geom)    → parallel layer intersects    │
│  3. runRules(site, proposal)  → pathways, criteria, unknowns │
│  4. retrieveDocs(...)         → Bedrock KB Retrieve (top-k)  │
│  5. ONE Converse call         → strict JSON assessment       │
│  6. validate + reconcile      → engine wins on conflicts     │
│                                                              │
│  DynamoDB: site cache (propertyId), assessment log           │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│  Bedrock Knowledge Base (OpenSearch Serverless)              │
│  S3 corpus: Acts, EPIs, LEPs, DCPs, guidelines               │
│  Metadata filters: lga, instrument_type, doc_id, version     │
└──────────────────────────────────────────────────────────────┘
```

**Deliberate simplification:** no agent action groups, no multi-turn tool orchestration. The Lambda does all deterministic work first and injects everything into a single prompt. The model's job is interpretation, explanation and formatting — not retrieval control flow. This is cheaper, faster, far easier to debug, and makes the output reproducible.

**Clarifying questions without multi-turn agents:** the rules engine returns `unknowns[]`. The model renders them as questions in the response JSON. The frontend collects answers and **re-posts the whole payload** with `answers{}` populated. Every call is still one-shot and stateless.

---

## 2. Site context layer

### 2.1 Address → lot

1. **ePlanning address/property API** (`api.apps1.nsw.gov.au/eplanning/data/v0/…`) — address string → `propertyId`, lot/DP list, LGA name. Also serves autocomplete.
2. **DCDB (NSW Digital Cadastre)** ArcGIS FeatureServer via NSW Spatial Services — query by lot/DP or point → lot polygon GeoJSON, cadastral area.
3. Cache the whole resolved bundle in DynamoDB keyed by `propertyId`, TTL 30 days.

### 2.2 Layers to intersect

Query the NSW Planning Portal ArcGIS REST services with the lot geometry (`geometryType=esriGeometryPolygon`, `spatialRel=esriSpatialRelIntersects`, `outFields=*`, `f=geojson`). Run all of these in parallel with `Promise.allSettled` — a failed layer becomes `unknown`, never a silent pass.

**Principal planning layers**
| Field | Layer |
|---|---|
| `zone` | Land Zoning |
| `min_lot_size_m2` | Minimum Lot Size |
| `max_height_m` | Height of Building |
| `max_fsr` | Floor Space Ratio |
| `heritage_item` / `heritage_conservation_area` | Heritage |
| `land_reservation_acquisition` | Land Reservation Acquisition |
| `foreshore_building_line` | Foreshore Building Line |
| `acid_sulfate_class` | Acid Sulfate Soils |
| `terrestrial_biodiversity` | Terrestrial Biodiversity |
| `urban_release_area` | Urban Release Area |
| `additional_permitted_uses` | Additional Permitted Uses |
| `local_provisions` | Local Provisions (varies by LEP) |

**Constraint layers**
- Bushfire Prone Land (council-certified, served through the Portal)
- Flood — council-published, coverage is patchy. **Default to `unknown`, never `false`.**
- Coastal management areas (Resilience & Hazards SEPP)
- Biodiversity Values Map (BC Act entry threshold)
- State Heritage Register (Heritage NSW)
- AHIMS Aboriginal sites (presence flag only — do not expose locations)
- Sydney Harbour / waterways (Biodiversity & Conservation SEPP)

**Overrides that beat the LEP** — check these *before* trusting the zoning layer
- Precincts SEPPs / State Significant Precincts
- Growth Areas, Urban Release Areas
- TOD and low-and-mid-rise accelerated precinct mapping
- Transport & Infrastructure SEPP (rail corridor, classified road, electricity easement referral triggers)

**User-confirmed only (not derivable from any layer)**
- existing dwelling present / dwelling entitlement
- easements, covenants, s88B restrictions
- prior consents on the land, existing use rights
- sewer/water mains location (DBYD / Sydney Water diagram)
- whether the lot is a battle-axe / has a registered right of carriageway

These go into `unknowns[]` and are asked, never assumed.

### 2.3 The numeric-controls rule

Minimum lot size, height and FSR are read from **spatial layers**, not from LEP text. LEP text is used for permissibility, definitions, and the conditions attached to a clause. Never let the model derive a numeric control from prose when a layer value exists.

---

## 3. Rules engine (deterministic, `packages/rules`)

Pure TypeScript, no network, fully unit-tested. Input `SiteContext` + `Proposal`, output `RulesResult`.

```ts
type Verdict = 'EXEMPT' | 'CDC' | 'LOCAL_DA' | 'REGIONAL_DA' | 'SSD' | 'PROHIBITED' | 'INDETERMINATE';

interface CriterionResult {
  id: string;                 // 'sd.min_lot_area'
  label: string;              // 'Minimum lot area 450m²'
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  actual?: string | number;
  required?: string | number;
  instrument: string;         // 'Housing SEPP 2021'
  clause?: string;            // verify at ingest — never hardcode from memory
}

interface PathwayResult {
  pathway: Verdict;
  criteria: CriterionResult[];
  disqualifiers: CriterionResult[];
  unknowns: string[];         // ids of facts needed to resolve
}
```

Rules are declarative JSON per development type:

```jsonc
{
  "id": "secondary_dwelling_cdc",
  "label": "Secondary dwelling as complying development",
  "instrument": "Housing SEPP 2021",
  "requires": {
    "zone": { "in": ["R1","R2","R3","R4","RU5"] },
    "lot_area_m2": { "gte": 450 },
    "proposal.gfa_m2": { "lte": { "min": [60, "site.lep_secondary_dwelling_max_gfa"] } },
    "site.existing_dwelling_present": { "eq": true }
  },
  "disqualifiers": [
    "heritage_item", "heritage_conservation_area", "state_heritage",
    "foreshore_building_line", "environmentally_sensitive_land",
    "bal_flame_zone", "land_reservation_acquisition", "coastal_wetland"
  ],
  "requires_user_input": ["existing_dwelling_present", "easements", "flood_status"]
}
```

**Beta rule set (build these six only):**
1. Secondary dwelling (granny flat) — CDC and DA paths
2. Dual occupancy (attached/detached)
3. Alterations & additions to a dwelling house
4. New dwelling house
5. Ancillary structures — decks, carports, sheds, pools, fences (exempt vs CDC)
6. Change of use, commercial premises (simple permissibility only)

Everything else returns `INDETERMINATE` with an honest "this tool doesn't cover that yet".

**Engine authority:** if the model's JSON disagrees with the engine's verdict, the Lambda overwrites the verdict with the engine's and flags `model_conflict: true` in the log. Non-negotiable.

---

## 4. The single Bedrock call

`bedrock-agent-runtime:Retrieve` (KB, filtered) → then `bedrock-runtime:Converse` with Claude Sonnet, `temperature: 0`, and a JSON output contract.

### 4.1 Retrieval

Two retrieves, merged:
- **Filtered by LGA**: `{ andAll: [{ equals: { key: 'lga', value: 'Ku-ring-gai' } }] }` — picks up the LEP and DCP for the site only.
- **State-wide instruments**: `{ equals: { key: 'scope', value: 'state' } }` — Acts, SEPPs, guidelines.

Query string is composed from `proposal.type + zone + candidate pathway labels + failed criteria`. `numberOfResults: 15` each. Never retrieve unfiltered — another council's DCP in context is the single most likely cause of a wrong answer.

### 4.2 Prompt assembly (one message)

```
<role>NSW planning pathway assistant. You explain, you do not decide.</role>

<site_context>      {…JSON, incl. provenance + fetch date per field}
<proposal>          {…JSON}
<user_answers>      {…JSON}
<rules_result>      {…engine output — AUTHORITATIVE}
<fee_schedule>      {…JSON, versioned, see §6}
<retrieved_documents>
  [doc_id | instrument | lga | clause | version] chunk text …
</retrieved_documents>
<output_schema>     {…JSON schema}

Rules:
- The verdict in <rules_result> is final. Explain it; never contradict it.
- Cite only from <retrieved_documents>, by doc_id + clause. If a clause is not in
  the retrieved set, say so — never recall one from memory.
- Every UNKNOWN criterion must appear as a question in `questions[]`.
- Costs: use <fee_schedule> arithmetic only; label all figures indicative.
- Output valid JSON matching <output_schema>. No prose outside it.
```

### 4.3 Output schema

```ts
interface Assessment {
  verdict: Verdict;
  headline: string;                    // one sentence, plain English
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  pathway_options: {
    pathway: Verdict;
    summary: string;
    consent_authority: string;         // council / private certifier / RPP / Minister
    indicative_timeframe: string;
    tradeoffs: string;
  }[];
  criteria: CriterionResult[];         // echoed from engine, with plain-English notes
  questions: { id: string; question: string; why_it_matters: string }[];
  approvals_required: { name: string; body: string; when: string }[];
  assessments_required: {              // triggered specialist reports
    name: string;                      // 'Bushfire Assessment (BAL)'
    trigger: string;                   // 'Lot is bushfire prone land'
    prepared_by: string;
    indicative_cost: string;
  }[];
  indicative_costs: {
    line_items: { item: string; amount: string; basis: string }[];
    total_range: string;
    excludes: string[];
  };
  contributions: {
    applicable: boolean | 'unknown';
    plan_name?: string;
    mechanism?: 's7.11' | 's7.12' | 'planning agreement';
    indicative_amount?: string;
    note: string;
  };
  likely_conditions: { category: string; condition: string }[];
  constraints: { constraint: string; implication: string; source_layer: string }[];
  next_steps: string[];
  citations: { doc_id: string; instrument: string; clause?: string; url?: string }[];
  disclaimer: string;
}
```

---

## 5. Mapbox map

`mapbox-gl` + `react-map-gl`.

**Behaviour**
1. User picks an address from autocomplete → Lambda returns `{ lot_geojson, bbox, lots: [{lot, section, plan}] }`.
2. `map.fitBounds(bbox, { padding: 60, maxZoom: 18 })` — animated.
3. Lot rendered as a GeoJSON source with two layers: semi-transparent `fill` + 2px `line`. Adjoining lots in the same DP drawn in a muted style.
4. Label: `Lot 12 DP 1234567` anchored at polygon centroid.
5. Toggleable overlays as raster tiles from the Portal WMS/WMTS: Zoning, Heritage, Bushfire, Flood, FSR, Height. Opacity slider, one legend chip per active layer.
6. Basemap: `mapbox://styles/mapbox/light-v11` for clarity; satellite toggle for context.
7. Click a neighbouring lot → "assess this lot instead".

**Notes**
- Token in `VITE_MAPBOX_TOKEN`, URL-restricted in the Mapbox dashboard.
- Store geometry in WGS84 (EPSG:4326); NSW services often return GDA2020 / EPSG:7844 or Web Mercator — reproject in the Lambda, not the browser, and assert the CRS on ingest.
- Simplify polygons server-side (`turf.simplify`, tolerance ~0.000005) before sending.
- Compute area server-side with `turf.area` but **always prefer the DCDB attribute area** where present — that's the legal figure.

---

## 6. Frontend state and routing

Two libraries, one rule each: **TanStack Query owns everything the server said, Zustand owns everything the user did.** A fetched `SiteContext` or assessment result is never copied into a store — that's how a stale zone or an overwritten override produces a wrong pathway with a confident tone.

### 6.1 Routes (TanStack Router, file-based)

```
/                                 address search
/site/$propertyId                 map + Site Facts panel
/site/$propertyId/assess          proposal form + results
      ?type=secondary_dwelling&overlays=zoning,bushfire
```

- Params and search params are validated with the Zod schemas from `packages/shared` — `validateSearch` gets the same schema the API uses, so a hand-edited URL fails closed rather than silently defaulting.
- The URL is the source of truth for navigation state: `propertyId`, development type, active overlays. An assessment link is therefore shareable and reloadable, which matters when a homeowner sends the result to a planner or a certifier.
- Site context is loaded in the route `loader` via `queryClient.ensureQueryData(siteQuery(propertyId))`, so the map, the facts panel and the proposal form resolve from one fetch instead of waterfalling.
- `routeTree.gen.ts` is generated by the Vite plugin and never hand-edited. The router type is registered so `useParams` and `useSearch` are typed end to end.

### 6.2 Stores (Zustand)

One store per concern; no god store, no non-serialisable values (the `mapbox-gl` instance lives in a ref).

| Store | Holds | Notes |
|---|---|---|
| `useAssessmentStore` | `site_overrides`, `answers`, proposal form draft | Every override records `edited_by_user: true` so the UI can mark it and the Lambda can distinguish it from layer data |
| `useMapStore` | overlay opacity, basemap choice, transient UI | Overlay *selection* lives in search params; only presentation lives here |

Components subscribe through exported selector hooks (`useAnswers()`, `useOverride(field)`), never the raw store, so a keystroke in one facts row doesn't re-render the map.

### 6.3 The assess round-trip

The payload is **derived at submit time, not stored**:

```ts
const payload = { propertyId, proposal, answers, site_overrides };
useQuery({ queryKey: ['assess', payload], queryFn: () => postAssess(payload) });
```

Because the payload is the query key, answering a clarifying question re-posts the *whole* payload and refetches naturally — which is exactly the stateless one-shot contract in §1. There is no client-side conversation state to drift out of sync with the Lambda, and the previous result stays cached and instantly re-viewable.

---

## 7. Costs, contributions, conditions

All monetary logic lives in `data/fee-schedule.json`, versioned and dated. **Never in the prompt text, never in the model's head.** The Lambda injects it; the model only arranges it.

```jsonc
{
  "version": "2026-07-01",
  "development_application": {
    "basis": "EP&A Regulation 2021 fee scale on estimated cost of development",
    "brackets": [ { "civ_max": 5000, "fee": 0 } /* … populate from the Reg at ingest … */ ]
  },
  "plan_first_levy": { "applies_over_civ": 50000, "rate": 0.00064 },
  "long_service_levy": { "applies_over_civ": 250000, "rate": 0.0035 },
  "cdc": { "certifier_fee_range": [1500, 4000], "note": "market rate, not statutory" },
  "contributions": {
    "s7_12": { "max_rate_over_200k": 0.01, "note": "council plan governs actual rate" },
    "s7_11": { "note": "per-lot/per-person rate from the council's contributions plan" }
  },
  "consultant_ranges": {
    "bushfire_report": [1500, 3500],
    "heritage_impact_statement": [2000, 5000],
    "arborist_report": [800, 2000],
    "flood_report": [2500, 6000],
    "seE": [2000, 6000],
    "basix_certificate": [200, 500],
    "survey": [1200, 3000],
    "architectural_drawings": [4000, 15000]
  }
}
```

**Verify every figure against the current EP&A Regulation and the relevant council contributions plan at ingest time.** Treat the values above as placeholders. Show a "fees current as of {version}" line in the UI.

**Likely conditions** — pull from a curated `data/standard-conditions.json` keyed by development type + trigger (e.g. bushfire prone → BAL construction condition; heritage adjacent → archival recording; over 20m³ excavation → geotech and dilapidation). Beta target: ~40 conditions covering the six development types.

---

## 8. Data model

```
DynamoDB  PlanPathSites     PK propertyId          → SiteContext + fetchedAt, TTL 30d
DynamoDB  PlanPathRuns      PK runId, GSI createdAt → full request, prompt hash,
                                                      instrument versions, response,
                                                      model_conflict flag
S3        planpath-corpus/  → KB source, see DOCUMENT_MANIFEST.md
S3        planpath-web/     → built frontend
```

Logging every run with the exact instrument versions used is what lets you defend or explain a past answer after an LEP amendment. Do it from day one.

---

## 9. Guardrails and legal posture

- Bedrock Guardrails: block outputs that read as certification, legal advice, or "you don't need approval".
- Fixed disclaimer on every result: *not planning advice; a s10.7 Planning Certificate and the consent authority are the authoritative sources; confirm with your council or a registered certifier.*
- Never assert `false` for a constraint the data can't confirm — `unknown` is the honest answer and protects you.
- No storage of user addresses against identity in beta. Hash the address in logs.
- Confidence is `LOW` whenever any critical criterion is `UNKNOWN`, and the UI must show that prominently, not in fine print.

---

## 10. Evaluation

`evals/cases/*.json` — each case is `{ address, proposal, answers, expected_verdict, expected_criteria }`.

- 60 cases minimum for beta: 10 per development type, spread across the pilot LGAs, including deliberate edge cases (heritage item, bushfire prone, under-450m² lot, battle-axe, dual frontage, flood).
- `npm run eval` runs them against the deployed endpoint and reports verdict accuracy, criterion-level accuracy, and hallucinated-citation rate (any citation whose `doc_id` was not in the retrieved set = automatic fail).
- Re-run on every corpus ingest. A green eval suite is the release gate.

---

## 11. Pilot scope

**LGAs (3–5, pick for contrast):** one inner-city (e.g. Inner West), one middle-ring detached (e.g. Ku-ring-gai — heritage-heavy), one growth area (e.g. Blacktown), one regional/rural (e.g. Wingecarribee), optionally one coastal (e.g. Wollongong).

That combination forces you to handle heritage conservation areas, bushfire, flood, urban release areas and rural minimum lot sizes — which is most of the real complexity — without ingesting 128 DCPs.

---

## 12. Build order

Detailed step-by-step in `CLAUDE.md` §Build Plan. Summary:

0. Repo scaffold + CDK bootstrap (router, query client and stores wired in `apps/web`)
1. Site resolution Lambda (address → lot → layers) — **prove this before anything else**
2. Mapbox map wired to real lot geometry
3. Rules engine + unit tests, one development type (secondary dwelling)
4. Corpus download + S3 + Bedrock KB
5. Assess Lambda: retrieve + single Converse + schema validation
6. Results UI (routes, stores, derived assess payload)
7. Remaining five development types + fee schedule + conditions library
8. Evals, guardrails, logging, deploy
