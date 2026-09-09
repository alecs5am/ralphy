#!/bin/zsh
set -euo pipefail

root="${0:A:h:h}"
iconset="$root/build/RalphyMedia.iconset"
master="$root/build/app-icon-1024.png"

mkdir -p "$iconset"
cp "$root/assets/app-icon-1024.png" "$master"

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$master" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$master" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$iconset" -o "$root/build/RalphyMedia.icns"
