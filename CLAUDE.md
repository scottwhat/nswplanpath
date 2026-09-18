# CLAUDE.md — PlanPath

NSW planning pathway assistant. Vite + React + TypeScript frontend, AWS Lambda + Bedrock backend, Mapbox map, Bedrock Knowledge Base over NSW planning legislation.

Read `SYSTEM_DESIGN.md` before writing code. Read `DOCUMENT_MANIFEST.md` before touching the corpus.

---

## Non-negotiable rules

1. **The rules engine decides, the model explains.** Verdicts come from `packages/rules`. If the model's JSON verdict differs from the engine's, the Lambda overwrites it and sets `model_conflict: true`. Never let the model determine a pathway.
2. **One Bedrock call per assessment.** No agent action groups, no tool loops, no multi-turn orchestration. All deterministic work happens in the Lambda first, then a single `Converse` call. Clarifying questions are returned in the response and answered by re-posting the full payload.
3. **No invented clause numbers, fees, or rates.** Anything numeric comes from `data/fee-schedule.json`, a spatial layer, or a retrieved chunk. If you don't have it, output `unknown` and say so. This applies to you writing the code as much as to the model at runtime.
4. **`unknown` is never `false`.** A layer that fails to respond, or a fact only the owner knows, is `UNKNOWN` and becomes a question.
5. **Retrieval is always filtered by LGA.** Another council's DCP in context is the most likely cause of a wrong answer.
6. **Numeric controls come from spatial layers, not LEP prose.** Min lot size, height, FSR — read the layer.
7. **Every response carries the disclaimer.** Not planning advice; s10.7 certificate and the consent authority are authoritative.
8. Scope is *pathway assessment* only. Never generate a BASIX certificate, BAL rating, traffic assessment or contamination conclusion — name the study, its trigger, who prepares it, and an indicative cost.

---

## Stack

- Frontend: Vite, React 19, TypeScript, TanStack Router (file-based routes), TanStack Query, Zustand, Tailwind, `react-map-gl` + `mapbox-gl`, Zod
- Backend: Node 20 Lambda (TypeScript, esbuild), API Gateway HTTP API, DynamoDB
- AI: Bedrock Knowledge Base (OpenSearch Serverless, Titan embeddings), Claude Sonnet via `Converse`, `temperature: 0`
- Infra: AWS CDK v2, TypeScript
- Region: `ap-southeast-2` (check Bedrock model availability; fall back to a cross-region inference profile if needed)

## Repo layout

```
planpath/
  apps/web/                 Vite React app (owns index.html, vite.config.ts, .env.local)
    src/routes/             TanStack Router file-based route tree
    src/stores/             Zustand stores (client state only)
  services/assess/          the single assess Lambda
  services/site/            address resolution + layer intersects
  packages/rules/           deterministic rules engine (pure, no I/O)
  packages/shared/          Zod schemas + types shared by web and lambdas
  packages/prompt/          prompt assembly + output schema
  data/                     fee-schedule.json, standard-conditions.json,
                            layer-registry.json, rules/*.json
  infra/                    CDK app (PlanPathChatStack: the chat broker + AgentCore harness)
  scripts/ingest/           corpus download + metadata sidecars + S3 sync
  evals/                    cases + runner
```

pnpm workspace (`pnpm-workspace.yaml` globs `apps/*`, `packages/*`, `services/*`, `infra`). The
root `package.json` only delegates: `pnpm dev` runs the web app, `pnpm build` / `pnpm lint`
/ `pnpm typecheck` run recursively. Cross-package imports use the package name
(`@planpath/shared`), never a relative path across package boundaries.

## Conventions

- **Server state is TanStack Query; client state is Zustand.** Anything that comes from `/site` or `/assess` is a query — never copy a fetched result into a store. Zustand holds only what the user did: site fact overrides, answers to clarifying questions, map overlay toggles and opacity, selected proposal type.
- One store per concern (`useAssessmentStore`, `useMapStore`), not a single god store. Export selector hooks (`useAnswers()`), never the raw store object, so components subscribe to slices. No non-serialisable values in a store — a `mapbox-gl` instance goes in a ref.
- The assessment payload is derived, not stored: build `{ propertyId, proposal, answers, site_overrides }` from the store at submit time and pass it as the query key, so re-answering a question re-posts the full payload and refetches naturally.
- **Routes are file-based and the URL is the source of truth for navigation state.** `propertyId`, proposal type and active overlays live in typed route params/search params (validated with the same Zod schemas), so an assessment is shareable and reloadable. Never mirror a route param into Zustand.
- Load site context in a route `loader` via `queryClient.ensureQueryData` so the map and facts panel don't waterfall. Keep `routeTree.gen.ts` generated, never hand-edited.
- Zod schemas in `packages/shared` are the single source of truth; infer TS types from them. Validate at every boundary: API input, layer responses, model output.
- No `any`. No unchecked `JSON.parse` of model output — parse with Zod, retry once on failure with the validation error appended, then fail loudly.
- Layer URLs, field names, fees and rules live in `data/*.json`, never in source.
- All spatial work in EPSG:4326. Reproject on ingest in the Lambda; assert the incoming CRS.
- `Promise.allSettled` for layer fetches; a rejection maps to `UNKNOWN`, never a throw that kills the request.
- Log every run to `PlanPathRuns` with prompt hash, retrieved doc_ids, instrument versions and the response.

---

## Build plan

Work through these in order. Each step ends with something demonstrably working — don't move on until it does.

### Step 0 — Scaffold
- pnpm workspace with the layout above. Vite React TS app, CDK app, shared package.
- Wire TanStack Router (`@tanstack/react-router` + the Vite plugin for file-based routing), TanStack Query, and Zustand in `apps/web` at scaffold time. Routes: `/` (address search), `/site/$propertyId` (map + facts), `/site/$propertyId/assess` (results). Register the router type so params are typed.
- `apps/web/.env.example`: `VITE_MAPBOX_ACCESS_TOKEN`, `VITE_CHAT_API_URL`, `VITE_CHAT_IDENTITY_POOL_ID`, `VITE_AWS_REGION`. Lambda/CDK side: `AWS_REGION`, `BEDROCK_MODEL_ID`, `KB_ID`. **These names are the contract** — `src/lib/env.ts` Zod-validates `import.meta.env` against them and throws at boot on a mismatch, so rename in both places or not at all.
- CDK bootstrap in `ap-southeast-2`. Deploy an empty stack to confirm credentials.

### Step 1 — Site resolution (do this first; it de-risks everything)
- `services/site`: `GET /site?address=…`
- Resolve address → propertyId → lot/DP → geometry via the ePlanning property API and the DCDB FeatureServer.
- Build `layer-registry.json` by probing each ArcGIS service: record layer id, URL, key fields, CRS. Write a script that verifies the registry and fails loudly when a layer moves.
- Intersect all Tier-1 planning layers + constraint layers in parallel; assemble `SiteContext` with `{ value, source_layer, fetched_at }` per field.
- Cache in DynamoDB by `propertyId`, TTL 30 days.
- **Done when:** three real addresses across different LGAs return correct zone, min lot size, height, FSR, heritage and bushfire status, verified by eye against the NSW Planning Portal spatial viewer.

### Step 2 — Map
- `react-map-gl` with `mapbox://styles/mapbox/light-v11`.
- Address autocomplete → call `/site` → render lot GeoJSON (fill + outline) → `fitBounds(bbox, { padding: 60, maxZoom: 18 })`.
- Lot/DP label at centroid. Adjoining lots in muted style, clickable to reassess.
- Overlay toggles for Zoning / Heritage / Bushfire / Flood as Portal raster tiles, with opacity slider and legend.
- Site Facts panel beside the map: every field with its source layer and fetch date, each one editable with an "edited by you" marker.
- **Done when:** typing an address flies to the lot and the panel shows real data with provenance, the URL carries the `propertyId`, and reloading that URL restores the same view.

### Step 3 — Rules engine
- `packages/rules`: pure functions, zero I/O, exhaustive unit tests.
- Implement `secondary_dwelling_cdc`, `secondary_dwelling_da`, `secondary_dwelling_prohibited` from `data/rules/*.json`.
- Predicate evaluator supporting `in`, `gte`, `lte`, `eq`, `min`, and disqualifier lists. `UNKNOWN` propagates: any unknown input to a criterion makes that criterion `UNKNOWN`, and any `UNKNOWN` critical criterion caps the overall confidence at `LOW`.
- **Clause numbers and thresholds must be sourced from the actual instrument text during this step, not from memory.** Read the ingested Housing SEPP and cite what it says.
- **Done when:** ~25 unit tests pass, including heritage, undersized lot, wrong zone, no existing dwelling, and every-fact-unknown cases.

### Step 4 — Corpus and Knowledge Base
- Work `DOCUMENT_MANIFEST.md` top to bottom. Start with Tier 1 and **one** LGA — prove the pipeline before scaling.
- `scripts/ingest`: download → normalise → write metadata sidecars → `manifest.lock.json` → S3 sync.
- Clause-level chunking for legislation HTML (split on clause headings, carry Part/Division context). Hierarchical chunking for DCP PDFs.
- CDK: S3 bucket, OpenSearch Serverless collection, Bedrock KB with metadata filtering enabled. Sync and test.
- Write `scripts/kb-query.ts` to test retrieval from the CLI with LGA filters before wiring it into the Lambda.
- **Done when:** a filtered query for a secondary-dwelling question returns the right clauses from the right instruments and zero chunks from other councils.

### Step 5 — Assess Lambda
- `POST /assess` with `{ address | propertyId, proposal, answers, site_overrides }`.
- Pipeline: site context (cached) → rules → two filtered retrieves (LGA + state) → assemble one prompt → single `Converse` → Zod-validate → reconcile verdict against engine → log → return.
- Prompt assembly in `packages/prompt`, snapshot-tested so prompt changes are visible in diffs.
- Retry once on schema-validation failure with the error appended; then return a structured error, never a half-parsed answer.
- **Done when:** a granny-flat question on a real address returns valid JSON with a correct verdict and citations that all trace to retrieved doc_ids.

### Step 6 — Results UI
- Verdict card (colour-coded, plain-English headline, confidence badge).
- Criteria table: pass / fail / unknown with actual vs required and the instrument.
- Questions block — answers go to the Zustand assessment store; answering re-posts the full payload (the store feeds the query key).
- Sections: pathway options, approvals, assessments triggered, indicative costs (line items + total range + exclusions), contributions, likely conditions, constraints, next steps.
- Citations list with clause references and links. Fixed disclaimer. PDF export.
- Low confidence must be visually prominent, not fine print.
- **Done when:** a completed assessment URL can be reloaded or shared and rebuilds the same result from the route params plus cached queries.

### Step 7 — Breadth
- Add the remaining five development types (dual occupancy, alterations & additions, new dwelling house, ancillary structures, simple change of use).
- Populate `fee-schedule.json` from the current EP&A Regulation and each pilot council's fee schedule and contributions plan — verify every number against source.
- Build `standard-conditions.json`, ~40 conditions keyed by development type and trigger.
- Ingest the remaining pilot LGAs.

### Step 8 — Harden and ship
- 60+ eval cases, `npm run eval` as the release gate. Hallucinated citation (doc_id not in retrieved set) = automatic fail.
- Bedrock Guardrails against certification/legal-advice phrasing.
- AWS Amplify Hosting for the frontend (`amplify.yml`, SPA rewrite to `/index.html`), custom domain, WAF rate limiting on the API.
- CloudWatch alarms: layer fetch failure rate, schema validation failure rate, `model_conflict` rate, p95 latency.
- Cost controls: cache aggressively on `propertyId`, cap `max_tokens`, alarm on daily Bedrock spend.

---

## When you're unsure

Say so in the code and the output rather than guessing. A wrong pathway with a confident tone is the worst possible failure mode for this product — worse than no answer. `INDETERMINATE` with a clear explanation of what's missing is always an acceptable result.
