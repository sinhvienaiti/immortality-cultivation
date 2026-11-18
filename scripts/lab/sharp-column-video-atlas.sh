#!/usr/bin/env bash
# Builds the five-thunder lab's sharp column flipbook from its Firefly takes (1080 × 1920, 24 fps), like round 32:
# twelve frames three apart from START1 / START2 (take 1 from 30: its frames 17–27 carry a thin bluish bolt; take 2
# from 12; the top cloud swells late in each take and is faded out by the mask), cropped round the column
# (x 120–960, y 260–1840), scaled to 256 × 480, its top band (the cloud) faded out and its sides and bottom softened.
# Rows: take 1, take 1 mirrored, take 2, take 2 mirrored (12 frames each): a 12 × 4 grid, 3072 × 1920.
# The core: each cell's pixels where max(R,G,B) > 0.8, the mask blurred 0x1 and multiplied in.
# Usage: scripts/lab/sharp-column-video-atlas.sh <job folder in the video folder>
#   e.g. scripts/lab/sharp-column-video-atlas.sh i2v-thunder-energy-sharp-i2v5
# Writes <job>.lab.png and <job>-core.lab.png into the stills folder; five-thunder.ts reads SHARP_COLUMN_VIDEO.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ART="${ART:-$HERE/../immortality-cultivation/art-src/lab/firefly-sprint-2026-11-05}"
JOB="$1"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# The mask: black over the top 40 px, a ramp to white by 150 px (the cloud's band), 20 px side fades, 40 px bottom fade.
magick -size 256x480 xc:white \( -size 256x110 gradient:black-white \) -geometry +0+40 -compose over -composite \( -size 256x40 xc:black \) -geometry +0+0 -compose over -composite "$TMP/m1.png"
magick -size 480x20 gradient:black-white -rotate 270 "$TMP/sl.png"
magick "$TMP/sl.png" -flop "$TMP/sr.png"
magick -size 256x40 gradient:white-black "$TMP/bt.png"
magick "$TMP/m1.png" "$TMP/sl.png" -geometry +0+0 -compose multiply -composite "$TMP/sr.png" -geometry +236+0 -compose multiply -composite "$TMP/bt.png" -geometry +0+440 -compose multiply -composite "$TMP/mask.png"
START1="${START1:-30}"
START2="${START2:-12}"
row=0
for t in 1 2; do
  if [ $t = 1 ]; then s0=$START1; else s0=$START2; fi
  s1=$((s0 + 33))
  ffmpeg -v error -y -i "$ART/video/$JOB/take$t.mp4" -vf "select='between(n\,$s0\,$s1)*not(mod(n-$s0\,3))',crop=840:1580:120:260,scale=256:480:flags=lanczos" -fps_mode passthrough "$TMP/raw$t-%02d.png"
  for flip in 0 1; do
    k=0
    for f in "$TMP"/raw$t-*.png; do
      out="$TMP/b-$row-$(printf %02d $k).png"
      if [ $flip = 1 ]; then magick "$f" -flop "$TMP/fl.png"; src="$TMP/fl.png"; else src="$f"; fi
      magick "$src" "$TMP/mask.png" -compose multiply -composite -alpha off "$out"
      magick "$out" -channel RGB -separate -evaluate-sequence max -threshold 80% -blur 0x1 "$TMP/cm.png"
      magick "$out" "$TMP/cm.png" -compose multiply -composite -alpha off "$TMP/c-$row-$(printf %02d $k).png"
      k=$((k + 1))
    done
    row=$((row + 1))
  done
done
magick montage "$TMP"/b-*.png -tile 12x4 -geometry +0+0 -background black "$ART/stills/skills/$JOB.lab.png"
magick montage "$TMP"/c-*.png -tile 12x4 -geometry +0+0 -background black "$ART/stills/skills/$JOB-core.lab.png"
echo "wrote $JOB.lab.png and $JOB-core.lab.png ($(magick identify -format '%wx%h' "$ART/stills/skills/$JOB.lab.png"))"
