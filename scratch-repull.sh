#!/usr/bin/env bash
cd /Users/maximovchinnikov/github/ralphy/ralphy || exit 1
REFS=.ralphy/workspaces/alesha/shared/refs
LOG=/private/tmp/claude-501/-Users-maximovchinnikov-github-ralphy-ralphy/71af62a2-c0cd-4f14-b056-eaec997288bd/scratchpad/repull.log
: > "$LOG"
pull_one () {
  local beat="$1"; local query="$2"
  echo ">>> $beat :: $query" >> "$LOG"
  local out dir
  out=$(bun run cli/index.ts ref pull "ytsearch1:$query" 2>>"$LOG")
  dir=$(echo "$out" | jq -r '.dir // empty' 2>/dev/null)
  if [ -n "$dir" ] && [ -d "$dir" ]; then
    rm -rf "$REFS/$beat"; mv "$dir" "$REFS/$beat"
    echo "OK   $beat dur=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$REFS/$beat/source.mp4" 2>/dev/null)s" >> "$LOG"
  else
    echo "FAIL $beat out=$out" >> "$LOG"
  fi
}
pull_one beat-07-storm   "rain storm in forest trees creative commons no copyright free"
pull_one beat-12-village "remote siberian village old wooden houses drone free no copyright"
pull_one beat-13-rescue  "volunteers searching forest rescue no copyright free footage"
pull_one beat-15-ballet  "ballerina dancing on stage spotlight creative commons no copyright"
echo "=== DONE ===" >> "$LOG"
