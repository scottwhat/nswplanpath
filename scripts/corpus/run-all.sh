#!/bin/bash
cd "$(dirname "$0")"
export CHROME_BIN=~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome
export CORPUS_ROOT="$(cd ../../data/corpus && pwd)"
python3 - <<'PY' > _plan.txt
import json
C=json.load(open('councils.json')); S=json.load(open('council-dcp-seeds.json'))
for slug,(lga,home) in C.items():
    seeds=[home]+S.get(slug,[])
    print(slug+'\t'+lga+'\t'+json.dumps(seeds[:5]))
PY
while IFS=$'\t' read -r slug lga seeds; do
  echo "=== $slug ==="
  if [ ! -f "pdfs-$slug.json" ]; then
    SLUG="$slug" SEEDS="$seeds" PROFILE="prof-$slug" MAXPAGES=120 DEPTH=3 \
      node crawl-council.mjs 2>/dev/null | tail -1
  else echo "crawl cached"; fi
  python3 classify.py "$slug" "$lga" | head -1
  LIST="list-$slug.json" PROFILE="prof-$slug" node fetch-files.mjs > "_dl-$slug.log" 2>&1
  echo "  downloaded OK=$(grep -c '^OK' _dl-$slug.log) SKIP=$(grep -c '^SKIP' _dl-$slug.log) FAIL=$(grep -c '^FAIL' _dl-$slug.log)"
  rm -rf "prof-$slug"
done < _plan.txt
echo "ALL DONE"
