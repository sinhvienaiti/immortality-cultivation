#!/usr/bin/env bash
# The five-thunder lab's mixed column atlas (round 36: "bớt lặp"): the sharp two-bolt video flipbook (four rows of
# 12 cells, from sharp-column-video-atlas.sh) plus two rows cut from four-frame strips (one-bolt, three-bolt; 2048 × 768,
# four 512 × 768 frames): each frame scaled 0.655 so its column (below its small cloud) matches the video's height,
# its foot on the video cells' foot (0.887 of 480 px), cropped to 256 × 480, the same top/side/bottom mask; per row the
# four frames, the four mirrored, the four again. Cores as before (max(R,G,B) > 0.8, blurred 0x1, multiplied in).
# Usage: scripts/lab/column-mix-atlas.sh <video job> <one-bolt strip> <three-bolt strip>
#   e.g. scripts/lab/column-mix-atlas.sh i2v-thunder-energy-sharp-i2v5 thunder-energy-column-1bolt-frames.v1-try3.png thunder-energy-column-3bolt-frames.v1-try3.png
# Writes thunder-columns-mix.lab.png and thunder-columns-mix-core.lab.png (3072 × 2880) into the stills folder.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STILLS="${STILLS:-$HERE/../immortality-cultivation/art-src/lab/firefly-sprint-2026-11-05/stills/skills}"
JOB="$1"; ONE="$2"; THREE="$3"
[ -f "$STILLS/$JOB.lab.png" ] || "$HERE/scripts/lab/sharp-column-video-atlas.sh" "$JOB"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
magick -size 256x480 xc:white \( -size 256x110 gradient:black-white \) -geometry +0+40 -compose over -composite \( -size 256x40 xc:black \) -geometry +0+0 -compose over -composite "$TMP/m1.png"
magick -size 480x20 gradient:black-white -rotate 270 "$TMP/sl.png"
magick "$TMP/sl.png" -flop "$TMP/sr.png"
magick -size 256x40 gradient:white-black "$TMP/bt.png"
magick "$TMP/m1.png" "$TMP/sl.png" -geometry +0+0 -compose multiply -composite "$TMP/sr.png" -geometry +236+0 -compose multiply -composite "$TMP/bt.png" -geometry +0+440 -compose multiply -composite "$TMP/mask.png"
row() { # strip, foot fraction, out prefix
  local foot=$2
  for i in 0 1 2 3; do
    local dy; dy=$(awk -v f="$foot" 'BEGIN { printf "%d", 768 * 0.655 * f - 426 }')
    magick "$STILLS/$1" -crop 512x768+$((i * 512))+0 +repage -alpha off -resize 335x503\! -crop 256x480+40+"$dy" +repage -background black -extent 256x480 "$TMP/f$i.png"
    magick "$TMP/f$i.png" -flop "$TMP/g$i.png"
  done
  local k=0
  for f in f0 f1 f2 f3 g0 g1 g2 g3 f0 f1 f2 f3; do
    magick "$TMP/$f.png" "$TMP/mask.png" -compose multiply -composite -alpha off "$TMP/$3-$(printf %02d $k).png"
    k=$((k + 1))
  done
}
row "$ONE" 0.908 one
row "$THREE" 0.894 three
magick montage "$TMP"/one-*.png -tile 12x1 -geometry +0+0 -background black "$TMP/row4.png"
magick montage "$TMP"/three-*.png -tile 12x1 -geometry +0+0 -background black "$TMP/row5.png"
for f in "$TMP"/one-*.png "$TMP"/three-*.png; do
  magick "$f" -channel RGB -separate -evaluate-sequence max -threshold 80% -blur 0x1 "$TMP/cm.png"
  magick "$f" "$TMP/cm.png" -compose multiply -composite -alpha off "${f%.png}-c.png"
done
magick montage "$TMP"/one-*-c.png -tile 12x1 -geometry +0+0 -background black "$TMP/crow4.png"
magick montage "$TMP"/three-*-c.png -tile 12x1 -geometry +0+0 -background black "$TMP/crow5.png"
magick "$STILLS/$JOB.lab.png" "$TMP/row4.png" "$TMP/row5.png" -append "$STILLS/thunder-columns-mix.lab.png"
magick "$STILLS/$JOB-core.lab.png" "$TMP/crow4.png" "$TMP/crow5.png" -append "$STILLS/thunder-columns-mix-core.lab.png"
echo "wrote thunder-columns-mix.lab.png and -core ($(magick identify -format '%wx%h' "$STILLS/thunder-columns-mix.lab.png"))"
