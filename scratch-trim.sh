#!/usr/bin/env bash
cd /Users/maximovchinnikov/github/ralphy/ralphy || exit 1
P=alesha-story-001
REFS=.ralphy/workspaces/alesha/shared/refs
VID=.ralphy/workspaces/alesha/projects/$P/artifacts/videos
SP=/private/tmp/claude-501/-Users-maximovchinnikov-github-ralphy-ralphy/71af62a2-c0cd-4f14-b056-eaec997288bd/scratchpad
mkdir -p "$VID"
LOG="$SP/trim.log"; : > "$LOG"

clip_one () {
  local beat="$1" from="$2" to="$3" name="$4"
  bun run cli/index.ts clip "$REFS/$beat/source.mp4" --from "$from" --to "$to" --vertical --out "$VID/$name.mp4" >>"$LOG" 2>&1 \
    && bun run cli/index.ts video frame "$VID/$name.mp4" --at 0.5 --out "$SP/tv-$name.jpg" >/dev/null 2>&1 \
    && echo "OK $name  $(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$VID/$name.mp4")s" >> "$LOG" \
    || echo "FAIL $name" >> "$LOG"
}

clip_one beat-02-trail   1.5 4.5  seg-02-trail
clip_one beat-03-taiga   30  33   seg-03-taiga
clip_one beat-04-forest  2   6.5  seg-04-forest
clip_one beat-05-fire    8   10.5 seg-05-fire
clip_one beat-06-bear    4   8    seg-06-bear
clip_one beat-07-storm   3   6.5  seg-07-storm
clip_one beat-08-swamp   2   5    seg-08-swamp
clip_one beat-11-dogrun  3   5.5  seg-11-dogrun
clip_one beat-15-ballet  3   7.5  seg-15-ballet
echo "=== DONE ===" >> "$LOG"
grep -E "^(OK|FAIL)" "$LOG"
