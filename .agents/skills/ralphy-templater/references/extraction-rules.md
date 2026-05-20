# extraction-rules

Per-source-file extraction details — what to read, what to write, how to degrade when a file is missing.

The skill writes to `templates/<category>/<slug>/` only. It never modifies the source project.

## File-by-file extraction

### `scenario.json` (required)

Shape (per existing projects): array of scenes, each `{ id, durationMs, beat, speaker?, vo?, sfx?, ref?, prompt? }`.

Extract:
- Total scene count → `template.json:typicalClipCount` (e.g. `[7, 9]` if source has 8 → propose ±1).
- Total duration sec → `template.json:typicalDurationSec` (same ±1s tolerance).
- Per-scene beats → `composition.md` table: `| scene | duration | beat | role |`. Strip `prompt` and `ref` paths — those become the cookbook's job.
- Speaker map (distinct speaker IDs) → `composition.md` "Cast" section.

Output target: `composition.md` (vibe-reference only). For vibe-style, this content goes into `TEMPLATE.md` "Beat structure" section.

### `prompts.json` (preferred, may be absent in older projects)

Shape: `{ images: { <slot>: <prompt> }, videos: {...}, voiceovers: {...}, music: {...} }` keyed by slot id.

Extract:
- Iterate every prompt string. For each, run the slot-detection LLM pass (see `slot-detection.md`) to replace literal brand/product/character names with `{{slot_name}}` placeholders.
- Group by stage: image prompts → `prompt-cookbook.md` "Image generation" section, video prompts → "Video generation (i2v)", etc.
- Preserve the per-slot keying so consumers can map slots 1:1.

Output target: `prompt-cookbook.md`. Include a header table mapping `{{slot}}` → "what this is" + an example value from the source project.

If `prompts.json` is absent (legacy projects that ran with prompts only in `logs/generations.jsonl`), reconstruct from the gen-log: read every `stage: "image-gen" | "video-gen" | "vo-gen"` entry's `prompt` field. This is degraded — gen-log captures the *final* prompt sent, not the templated version, so manual cleanup is more likely. Mark these prompts in the cookbook with `<!-- reconstructed from gen-log -->`.

### `asset-manifest.json` (required)

Shape: `{ assets: { <slot>: { type, path, slot?, locked?, refRole?, ... } } }`.

Extract:
- For each entry where `locked === true` OR `refRole` ∈ {`character-master`, `location-plate`, `music-bed`, `brand-master`}: this is a candidate for pool migration. See `pool-migration.md`.
- For each entry where `type ∈ {trim-from, render-output}` or path lives under `assets/captions/` / `render/`: skip — these are project-specific outputs, not template inputs.
- Image / video ref files that are NOT locked but still reusable (e.g. master frames from research): include in template `assets:` map with `required: false` so consumers can opt-in.

Output target: `template.json:assets` map. See `pool-migration.md` for the exact entry shape.

### `logs/generations.jsonl` (required)

Append-only log; one JSON object per line. Each entry has `{ stage, model, params, input, output, costUsd, timestampMs, projectId, slot? }`.

Extract:
- Aggregate by `stage`: image / video / voiceover / music / captions. For each stage, pick the most-used model (mode), record its params (median values for numeric params, mode for categorical).
- Compute total cost rollup: `{ totalUsd, byStage: { image: X, video: Y, ... } }`.
- Detect failed-then-fixed pattern: entries where `stage: "no-ref-consent"` or where the same slot has v1/v2/v3 attempts. Note the final-winning model in `model-stack.md` "What worked" and earlier-tried models in "What we tried and dropped" with one-line reason from the gen-log `note` field (if present) or from `postmortem/02-lessons.md`.

Output target: `model-stack.md` + cost ballpark to `README.md`.

### `composition-props.json` (vibe-reference only)

Shape: `{ compositionId, projectSlug, ...defaults }`.

Extract:
- `compositionId` → `template.json:compositionTemplate.id`
- All other keys EXCEPT `projectSlug` → `template.json:compositionTemplate.defaults`. The `projectSlug` field is intentionally per-project, set by `template use`.

Output target: `template.json`.

If absent: this is a vibe-style template (per `kind-decision.md`). Skip the `compositionTemplate` field entirely; consumers will hand-author per-project Remotion.

### `BRIEF.md` (preferred)

The original user brief. Free-form markdown.

Extract:
- First non-header sentence → seed for the LLM-drafted `template.json:description`.
- All proper nouns mentioned → slot detection context (see `slot-detection.md`).
- Any explicit mention of platform / aspect ratio / duration → override LLM-suggested values in `template.json`.

Output target: drives several LLM passes; not written verbatim anywhere.

If absent: degraded category classification + description generation. The LLM pass falls back to scenario summary + prompts excerpts.

### `postmortem/02-lessons.md` (preferred)

Section 1 is structured as "10 rules I learned the hard way" — extract these.

Extract:
- Top 5–7 rules by impact (LLM ranks them by phrases like "cost X" / "burned Y min" / "regen cycle"). Strip the citation footers (`[01-chat-history.md#turn-N]`) and any project-specific identifiers (replace character names with `{{slots}}`).
- Section 2's "Pipeline I would run from scratch" → `TEMPLATE.md` "Workflow" ordered list. Strip the cost annotations (`~$0.40`) — those go into `model-stack.md` cost ballpark.

Output target: `TEMPLATE.md` "Key rules" + "Workflow" sections.

If absent: omit these sections entirely. Do NOT fabricate rules. The TEMPLATE.md still has Brief + Beat structure + Required inputs — just lighter on lived experience. Warn the user; offer `/postmortem` first.

### `postmortem/04-models-and-cost.md` (preferred)

Spend rollup by phase + model picks + rationale.

Extract:
- Total spend → `README.md` "Cost ballpark" (round to nearest $5).
- Per-stage breakdown → `model-stack.md` "Cost per stage" table.
- Model picks with rationale → fold into `model-stack.md` "What worked" if not already covered by gen-log analysis.

Output target: `README.md` + `model-stack.md`.

### `postmortem/05-workflow-fixes.md` (preferred)

Playbook fixes raised during the session. These are the "what we'd change in the playbook" entries.

Extract:
- Each fix → bullet in `TEMPLATE.md` "Anti-patterns" section (phrased as "DO NOT X, because Y").

Output target: `TEMPLATE.md`.

## File output mapping

| Template kind | Files written |
|---|---|
| vibe-reference | `template.json`, `TEMPLATE.md`, `composition.md`, `prompt-cookbook.md`, `model-stack.md`, `fragments.md` (if reusable prompt fragments detected), `reference-example.md`, `README.md` |
| vibe-style | `template.json`, `TEMPLATE.md`, `prompt-cookbook.md`, `model-stack.md`, `hooks.md` (if 0–2s hook patterns detected in scene 1), `examples.md`, `README.md` |

`reference-example.md` (vibe-reference only) is a one-screen pointer to the source project + final mp4 location in `ralphy-assets/examples/showcase/` (if it's there). Format:

```markdown
# Reference example

The canonical "what this template produces" pointer.

- Source project: `workspace/projects/<source-id>/`
- Final render: [link to mp4 in ralphy-assets/examples/showcase/<source-id>.mp4]
- One-paragraph description of what's notable about this specific instance
```

`fragments.md` (vibe-reference, optional): reusable prompt fragments extracted via LLM pass — strings that appeared verbatim across ≥3 prompts in `prompts.json`. Voice profile blocks (per noski-people lessons rule #10), camera vocabulary blocks, anti-pattern negatives. Each fragment gets a name + one-paragraph "when to use it."

## Edge cases

- **Missing `assets/` subdir** (vibe-style refs only) → OK, no pool migration needed. Just emit `prompts.json` extraction.
- **`prompts.json` has prompts in mixed languages (RU+EN)** → preserve the original language. Slot detection still works on any language since it's regex + LLM-based on proper-noun extraction.
- **Gen-log has stage `add-music` entries** → these are ffmpeg recipes, not model calls. Skip them for `model-stack.md`; surface in `composition.md` "Audio mix" section instead.
- **Very long gen-log (>500 entries)** → cap at last 200 entries for the model-mode analysis. Older entries are typically failed early iterations.
- **`scenario.json` was edited after final render** → trust the JSON. The skill doesn't time-correlate against the gen-log.
