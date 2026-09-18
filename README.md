# PlanPath

NSW planning pathway assistant. Not planning advice — the s10.7 certificate and the
consent authority are authoritative.

Start with `CLAUDE.md` (rules and build plan), `SYSTEM_DESIGN.md` and `PROGRESS.md`.

## Layout

```
apps/web/            Vite + React frontend; `pnpm build` emits apps/web/dist
packages/shared/     Zod schemas + types shared by web and lambdas
packages/prompt/     agent system prompt
infra/               CDK: PlanPathChatStack (ap-southeast-2). Frontend hosting is Amplify (amplify.yml)
data/
  layer-registry.json      spatial layer URLs, ids, fields (imported by packages/shared)
  corpus/                  downloaded KB documents + sidecars (gitignored)
    manifest.lock.json     provenance for every corpus file; `path` is relative to data/corpus
  cadastre/                raw harvest + lots.pmtiles (gitignored, rebuilt by scripts/cadastre)
scripts/corpus/      corpus fetchers + kb-summary generator
scripts/cadastre/    cadastre harvest, address index, tile build
```

Nothing under `data/` ships in the web bundle except what `apps/web` imports at build time
(`layer-registry.json` via `packages/shared`).

## Commands

```bash
pnpm install
pnpm dev                 # web app on :5173
pnpm build               # build every workspace package
pnpm typecheck
pnpm deploy:api          # cdk deploy PlanPathChatStack
```

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill it in before building. The
`VITE_*` values are baked into `dist` at build time.
# nswplanpath
