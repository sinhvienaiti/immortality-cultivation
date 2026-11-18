#!/usr/bin/env bash
# Builds the five-thunder lab's sharp column atlases from a four-frame strip (owner-approved art, 2048 × 768,
# four 512 × 768 frames side by side): eight cells (the four frames as drawn, then mirrored, -flop) and their cores
# (each cell's pixels where max(R,G,B) > 0.8, the mask blurred 0x1 and multiplied in). Alpha dropped.
# Usage: scripts/lab/sharp-column-atlas.sh <strip file name in the stills folder>
#   e.g. scripts/lab/sharp-column-atlas.sh thunder-energy-sharp-frames.v2-try2.png
# Writes <name>.lab.png and <name>-core.lab.png beside it; src/lab/five-thunder.ts reads them from SHARP_COLUMN_STRIP.
# It also prints each frame's foot (bottom of its bright part) so the pivot in five-thunder.ts can be checked.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STILLS="${STILLS:-$HERE/../immortality-cultivation/art-src/lab/firefly-sprint-2026-11-05/stills/skills}"
SRC="$STILLS/$1"
[ -f "$SRC" ] || { echo "no such strip: $SRC" >&2; exit 1; }
BASE="${1%.png}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for i in 0 1 2 3; do
  magick "$SRC" -crop 512x768+$((i * 512))+0 +repage -alpha off "$TMP/b$i.png"
  magick "$TMP/b$i.png" -flop "$TMP/b$((i + 4)).png"
  echo "frame $i foot y: $(magick "$TMP/b$i.png" -colorspace gray -threshold 60% -format '%@' info: | sed -E 's/^[0-9]+x([0-9]+)\+[0-9]+\+([0-9]+)$/\1 \2/' | awk '{printf "%.3f", ($1 + $2) / 768}')"
done
for i in 0 1 2 3 4 5 6 7; do
  magick "$TMP/b$i.png" -channel RGB -separate -evaluate-sequence max -threshold 80% -blur 0x1 "$TMP/m$i.png"
  magick "$TMP/b$i.png" "$TMP/m$i.png" -compose multiply -composite -alpha off "$TMP/c$i.png"
done
magick "$TMP"/b{0..7}.png +append "$STILLS/$BASE.lab.png"
magick "$TMP"/c{0..7}.png +append "$STILLS/$BASE-core.lab.png"
echo "wrote $STILLS/$BASE.lab.png and $BASE-core.lab.png"
