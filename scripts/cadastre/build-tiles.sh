#!/usr/bin/env bash
# Harvested lot NDJSON -> a single PMTiles archive the map reads directly.
#
# PMTiles rather than a tile server: one file on S3/CloudFront, the browser
# pulls the byte ranges it needs, and there is nothing to run or rate-limit.
#
# Zoom range mirrors the app. LOT_MIN_ZOOM is 15 (below that the DCDB's own
# 1:100,000 min scale makes a lot query meaningless), so tiles start at 14 for
# one level of headroom and stop at 16 — mapbox-gl overzooms past maxzoom, so
# z17+ costs nothing extra and stays crisp because vector tiles are geometry.
#
# The -pf / -pk pair is load-bearing: by default tippecanoe drops features from
# dense tiles to hit a size budget. A silently missing parcel is exactly the
# failure mode this project cannot have, so both limits are off and tiles are
# allowed to be large.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAW="$ROOT/data/cadastre/raw/lots"
# Outside apps/web/public so Vite does not copy ~180 MB into every build.
OUT="$ROOT/data/cadastre/tiles"
TMP="${TMPDIR:-/tmp}/planpath-tiles"

command -v tippecanoe >/dev/null 2>&1 || {
  echo "tippecanoe not found on PATH (try ~/.local/bin)." >&2
  exit 1
}

mkdir -p "$OUT" "$TMP"

shopt -s nullglob
chunks=("$RAW"/chunk-*.ndjson)
if [ ${#chunks[@]} -eq 0 ]; then
  echo "no harvested lots in $RAW — run: node scripts/cadastre/harvest.mjs lots" >&2
  exit 1
fi

echo "==> tiling ${#chunks[@]} chunk files"
cat "${chunks[@]}" > "$TMP/lots.ndjson"
wc -l < "$TMP/lots.ndjson" | xargs printf '    %s features\n'

tippecanoe \
  --output="$OUT/lots.pmtiles" \
  --force \
  --layer=lots \
  --minimum-zoom=14 \
  --maximum-zoom=16 \
  --no-feature-limit \
  --no-tile-size-limit \
  --no-tiny-polygon-reduction \
  --simplification=2 \
  --detect-shared-borders \
  --attribute-type=lotnumber:string \
  --attribute-type=sectionnumber:string \
  --attribute-type=planlabel:string \
  --attribute-type=lotidstring:string \
  --exclude=objectid \
  --name="NSW DCDB lots (Greater Sydney)" \
  --attribution='&copy; Spatial Services, NSW Department of Customer Service' \
  "$TMP/lots.ndjson"

rm -f "$TMP/lots.ndjson"
ls -lh "$OUT/lots.pmtiles"
