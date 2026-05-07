#!/usr/bin/env bash
# Generate 9:16 motion clips + posters from AI-generated keyframes.
# Usage: bash scripts/build-clips.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/../profiles/ralphy-showcase/projects"
OUT_VID="$ROOT/public/videos"
OUT_POS="$ROOT/public/posters"

mkdir -p "$OUT_VID" "$OUT_POS"

# format: <id>|<src>|<direction>
# direction: in | out
CLIPS=(
  "soviet-01|soviet-engineer-001/assets/keyframes/clip-01-morning-kitchen.png|in"
  "soviet-02|soviet-engineer-001/assets/keyframes/clip-02-walk-to-factory.png|out"
  "soviet-03|soviet-engineer-001/assets/keyframes/clip-03-shop-floor.png|in"
  "soviet-04|soviet-engineer-001/assets/keyframes/clip-04-canteen-tray.png|out"
  "soviet-05|soviet-engineer-001/assets/keyframes/clip-05-walk-home-evening.png|in"
  "soviet-06|soviet-engineer-001/assets/keyframes/clip-06-family-dinner.png|out"
  "metal-01|solutions-metal-001/keyframes/clip-01-grandfather-hands-notebook.png|in"
  "metal-02|solutions-metal-001/keyframes/clip-02-lab-microscope.png|out"
  "metal-04|solutions-metal-001/keyframes/clip-04-commission.png|in"
  "metal-06|solutions-metal-001/keyframes/clip-06-narrator-reveals-notebook.png|out"
  "metal-07|solutions-metal-001/keyframes/clip-07-gleb-wears-cap.png|in"
  "metal-08|solutions-metal-001/keyframes/clip-08-still-life-notebook-cap.png|out"
)

FPS=30
DUR=6
FRAMES=$((FPS * DUR))
W=1080
H=1920
# scale up so zoompan has room to crop without softness
SCALE_W=$((W * 2))
SCALE_H=$((H * 2))

for entry in "${CLIPS[@]}"; do
  IFS='|' read -r id rel dir <<< "$entry"
  src="$SRC/$rel"
  vid="$OUT_VID/$id.mp4"
  pos="$OUT_POS/$id.jpg"

  if [[ ! -f "$src" ]]; then
    echo "skip: $src missing"
    continue
  fi

  echo "→ $id  (dir=$dir)"

  if [[ "$dir" == "in" ]]; then
    Z="1.0+0.0008*on"
  else
    Z="1.16-0.0008*on"
  fi

  ffmpeg -hide_banner -loglevel error -y \
    -loop 1 -i "$src" \
    -vf "scale=${SCALE_W}:${SCALE_H},zoompan=z='${Z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${FRAMES}:s=${W}x${H}:fps=${FPS}" \
    -t ${DUR} -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
    -movflags +faststart "$vid"

  ffmpeg -hide_banner -loglevel error -y \
    -ss 1.5 -i "$vid" -vframes 1 -q:v 4 "$pos"

  size=$(du -h "$vid" | cut -f1)
  echo "   ✓ $id.mp4 ($size)"
done

echo
echo "done. videos: $(ls "$OUT_VID" | wc -l | tr -d ' ')   posters: $(ls "$OUT_POS" | wc -l | tr -d ' ')"
