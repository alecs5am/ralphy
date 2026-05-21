#!/usr/bin/env bash
# Run all 57 prompts in two pools:
#   - gemini-3-pro-image-preview (47 prompts) at concurrency 4
#   - openai/gpt-5.4-image-2     (10 prompts) at concurrency 1 (provider cap)
#
# xargs -I{} can't handle multi-KB JSON lines ("argument too long"), so this uses
# a hand-rolled bash pool with `wait -n` (requires bash >= 4.3).
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
SELF_DIR="$REPO_ROOT/notes/research/prompts/_renders"
MANIFEST="$SELF_DIR/prompts.jsonl"
WORKER="$SELF_DIR/run-one.sh"

mkdir -p "$SELF_DIR/.runlog"

run_pool() {
  local concurrency=$1
  local label=$2
  shift 2
  local lines=("$@")

  local running=0
  for line in "${lines[@]}"; do
    "$WORKER" "$line" &
    running=$((running + 1))
    if (( running >= concurrency )); then
      wait -n
      running=$((running - 1))
    fi
  done
  wait
  echo "[pool $label] all done."
}

# Collect lines into arrays (one element per JSONL line).
mapfile -t GEMINI_LINES < <(jq -c 'select(.model == "google/gemini-3-pro-image-preview")' "$MANIFEST")
mapfile -t GPT_LINES    < <(jq -c 'select(.model == "openai/gpt-5.4-image-2")' "$MANIFEST")

echo "=== batch start ==="
echo "  gemini: ${#GEMINI_LINES[@]} prompts @ concurrency 4"
echo "  gpt-5.4-image-2: ${#GPT_LINES[@]} prompts @ concurrency 1"
echo "  started: $(date)"

# Run both pools concurrently — they're different upstream rate limits.
(
  run_pool 4 "gemini" "${GEMINI_LINES[@]}"
) >"$SELF_DIR/.runlog/_pool-gemini.log" 2>&1 &
gemini_pid=$!

(
  run_pool 1 "gpt" "${GPT_LINES[@]}"
) >"$SELF_DIR/.runlog/_pool-gpt.log" 2>&1 &
gpt_pid=$!

echo "[pool gemini pid=$gemini_pid]  [pool gpt pid=$gpt_pid]"

wait "$gemini_pid"
gemini_rc=$?
wait "$gpt_pid"
gpt_rc=$?

echo "=== batch done: $(date) ==="
echo "gemini pool rc=$gemini_rc"
echo "gpt pool rc=$gpt_rc"

ok=$(find "$SELF_DIR" -mindepth 2 -maxdepth 2 -name '*.png' | wc -l | tr -d ' ')
echo "rendered PNGs on disk: $ok / 57"
