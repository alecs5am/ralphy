#!/usr/bin/env bash
cd /Users/maximovchinnikov/github/ralphy/ralphy || exit 1
REFS=.ralphy/workspaces/alesha/shared/refs
LOG=/private/tmp/claude-501/-Users-maximovchinnikov-github-ralphy-ralphy/71af62a2-c0cd-4f14-b056-eaec997288bd/scratchpad/pull.log
mkdir -p "$(dirname "$LOG")"; : > "$LOG"
rm -rf "$REFS/stockfootage"

pull_one () {
  local beat="$1"; local query="$2"
  echo ">>> $beat :: $query" >> "$LOG"
  local out dir
  out=$(bun run cli/index.ts ref pull "ytsearch1:$query" 2>>"$LOG")
  dir=$(echo "$out" | jq -r '.dir // empty' 2>/dev/null)
  if [ -n "$dir" ] && [ -d "$dir" ]; then
    rm -rf "$REFS/$beat"; mv "$dir" "$REFS/$beat"
    local sz; sz=$(du -h "$REFS/$beat/source.mp4" 2>/dev/null | cut -f1)
    local dur; dur=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$REFS/$beat/source.mp4" 2>/dev/null)
    echo "OK   $beat  size=$sz dur=${dur}s" >> "$LOG"
  else
    echo "FAIL $beat  out=$out" >> "$LOG"
  fi
}

pull_one beat-02-trail   "walking forest trail path first person no copyright stock footage"
pull_one beat-04-forest  "dark dense pine forest gloomy no copyright stock footage"
pull_one beat-05-fire    "forest fire wildfire spreading trees no copyright stock footage"
pull_one beat-06-bear    "brown bear walking forest wild no copyright stock footage"
pull_one beat-07-storm   "heavy rain thunderstorm forest no copyright stock footage"
pull_one beat-08-swamp   "swamp bog marsh murky dark water no copyright stock footage"
pull_one beat-11-dogrun  "dog running through forest no copyright stock footage"
pull_one beat-12-village "old russian wooden village houses countryside no copyright stock footage"
pull_one beat-13-rescue  "search rescue team forest people walking no copyright stock footage"
pull_one beat-15-ballet  "ballerina ballet performance stage spotlight no copyright stock footage"

echo "=== DONE ===" >> "$LOG"
