# Corpus fetchers

`legislation.nsw.gov.au` and most council sites sit behind Cloudflare/WAF challenges
that reject `curl` with 403. These scripts drive a real Chromium via Playwright with a
persistent profile so the clearance cookie is reused across the run.

## Setup

```bash
npm i playwright
export CHROME_BIN=~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome
export CORPUS_ROOT=../../data/corpus
```

## Scripts

| Script | Purpose |
|---|---|
| `browser.mjs` | Persistent-profile launcher + `get()` that waits out the CF interstitial. |
| `build-index.mjs` | Walks the in-force A–Z index (act/epi/sl × A–Z) → `index-inforce.json` (1,588 instruments). Resolve titles against this instead of guessing deep URLs. |
| `fetch-legislation.mjs` | Downloads `targets.json` as whole-document HTML + sidecars. |
| `crawl-council.mjs` | Harvests PDF links from a council site. `SEEDS` (JSON array), `SLUG`, `MAXPAGES`, `DEPTH`. Rate-limited ~1 req/sec. |
| `classify.py` | Buckets crawl output into dcp/contributions/fees/flood/conditions/strategy and flags superseded → `lists/list-{slug}.json`. |
| `fetch-files.mjs` | Downloads any `lists/*.json`; falls back to in-page `fetch()` when the request API is 403'd (needed for Wollongong). |

## Refresh

```bash
node build-index.mjs                                  # re-resolve instrument IDs
node fetch-legislation.mjs                            # re-pull legislation
SLUG=blacktown SEEDS='["<dcp page>"]' node crawl-council.mjs
python3 classify.py blacktown Blacktown
LIST=lists/list-blacktown.json node fetch-files.mjs
```

Existing files are skipped. Diff `sha256` in `data/corpus/manifest.lock.json` to find changes.

**Run one fetcher at a time** — they all read-modify-write `manifest.lock.json`, so
concurrent runs clobber each other's entries. If that happens, rebuild the lock from
the per-file `.metadata.json` sidecars, which are written atomically per file.
