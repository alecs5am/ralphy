#!/usr/bin/env bash
# Worker: takes a single JSONL line on stdin and generates one image via ralphy.
# Output ends up at workspace/projects/prompts-test-001/assets/<slot>.png
# then is moved to notes/research/prompts/_renders/<folder>/<idx>-<src_slug>.png
# along with a sibling <idx>-<src_slug>.prompt.md for grading.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PROJECT_ID="prompts-test-001"
RENDERS_DIR="$REPO_ROOT/notes/research/prompts/_renders"
ASSETS_DIR="$REPO_ROOT/workspace/projects/$PROJECT_ID/assets/images"

line="$1"

idx=$(jq -r '.idx' <<<"$line")
folder=$(jq -r '.folder' <<<"$line")
src_slug=$(jq -r '.src_slug' <<<"$line")
model=$(jq -r '.model' <<<"$line")
prompt=$(jq -r '.prompt' <<<"$line")

slot="${folder}-${idx}-${src_slug}"
out_png="$RENDERS_DIR/$folder/${idx}-${src_slug}.png"
out_md="$RENDERS_DIR/$folder/${idx}-${src_slug}.prompt.md"

# Skip if already rendered (idempotent re-run).
if [[ -f "$out_png" ]]; then
  echo "[skip] $folder/${idx}-${src_slug} (already exists)"
  exit 0
fi

echo "[start] $folder/${idx}-${src_slug}  model=$model"

start_ts=$(date +%s)

# Use --no-ref-consent for the whole batch — research test, no real-entity issue.
log_path="$RENDERS_DIR/.runlog/${folder}-${idx}-${src_slug}.log"
mkdir -p "$(dirname "$log_path")"

cd "$REPO_ROOT"
bun run cli/index.ts generate image \
  --project "$PROJECT_ID" \
  --slot "$slot" \
  --model "$model" \
  --prompt "$prompt" \
  --no-ref-consent "research-prompt-grading-batch" \
  --note "src=notes/research/prompts/image/${folder}/${idx}-${src_slug}.yaml" \
  >"$log_path" 2>&1
rc=$?

elapsed=$(( $(date +%s) - start_ts ))

if [[ $rc -ne 0 ]]; then
  echo "[FAIL rc=$rc t=${elapsed}s] $folder/${idx}-${src_slug} — see $log_path"
  exit 0  # don't break xargs batch; collect all failures
fi

# Find rendered file (extension may vary, but ralphy writes .png by default).
src_file=""
for ext in png jpg webp jpeg; do
  if [[ -f "$ASSETS_DIR/${slot}.${ext}" ]]; then
    src_file="$ASSETS_DIR/${slot}.${ext}"
    break
  fi
done

if [[ -z "$src_file" ]]; then
  echo "[FAIL no-output t=${elapsed}s] $folder/${idx}-${src_slug} — ralphy returned 0 but no asset found in $ASSETS_DIR/${slot}.*"
  exit 0
fi

ext="${src_file##*.}"
final_png="$RENDERS_DIR/$folder/${idx}-${src_slug}.${ext}"
cp "$src_file" "$final_png"

# Write the grading sidecar.
src_yaml="$REPO_ROOT/notes/research/prompts/image/$folder/${idx}-${src_slug}.yaml"
source_url=""
if [[ -f "$src_yaml" ]]; then
  source_url=$(grep -A1 '^source:' "$src_yaml" | grep '^  url:' | head -1 | sed 's/^  url: //')
fi

cat >"$out_md" <<EOF
# ${idx}-${src_slug}

- **Folder:** \`${folder}\`
- **Source YAML:** [\`notes/research/prompts/image/${folder}/${idx}-${src_slug}.yaml\`](../../image/${folder}/${idx}-${src_slug}.yaml)
- **Source URL:** ${source_url:-n/a}
- **Model used for test:** \`${model}\`
- **Render time:** ${elapsed}s

## Custom test prompt

\`\`\`
${prompt}
\`\`\`

## Grade (fill in)

- Quality: [ ] poor [ ] ok [ ] good [ ] great
- Pattern transferable: [ ] yes [ ] no
- Notes:
EOF

echo "[done t=${elapsed}s] $folder/${idx}-${src_slug} -> $final_png"
