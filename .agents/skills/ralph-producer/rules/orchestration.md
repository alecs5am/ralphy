# Single-video pipeline orchestration

## When this fires

One video, end-to-end. User: "make a video about X" / "сделай видео про X", "run the full pipeline" / "запусти полный pipeline".

## Steps

### 0. Template suggest (first)

```bash
ralphy template suggest "<user-utterance>"
```

Returns top-3 ranked templates. Propose top-1:

> "Template **<id>** (vibe: ..., ~$X). Starting — or say 'no template'."

If `score < 0.5` — don't propose, go straight to scenarist flow.

### 1. Research if needed

If user supplied site/social URL → **`/ralph-researcher`** first → references on disk.

### 2. Scaffold project

```bash
# With a template:
ralphy template use <slug> --project <ctx>-<NNN> --name "<human>" --brief "<brief>"

# Without a template:
ralphy project create --id <ctx>-<NNN> --name "<human>"
```

### 3. Save brief

```bash
# BRIEF.md is created automatically by template use (or manual echo).
ralphy project log-prompt <id> --text "<brief>" --stage brief
```

### 4. Reference-required gate

Before the scenarist — check the brief for named persona/brand. If present and there's no ref in `assets/uploaded/` → **refuse** (see `ralph-art-director/rules/ref-photo-policy.md`):

> "The brief mentions '<name>' — I need a reference (photo/logo/screenshot). Send it here or switch to an impersonal archetype."

### 5. Scenario

Hand to **`/ralph-scenarist`** → `scenario.json`. Pause + user approve before money. Quality gate (`scoreScenario`) must pass.

### 6. Prompts + assets

Hand to **`/ralph-art-director`**:
- `prepare-prompts` → `prompts.json`.
- Cost preview: `N images × $X + M videos × $Y + K VO calls × $Z = $T. Run?`.
- `generate-assets` → `assets/*` + `asset-manifest.json`.
- Quality gates auto on each asset (`scoreImage` / `scoreVideo`).

### 7. Composition + render

Hand to **`/ralph-editor`**:
- `preflight`.
- `author-composition`.
- (optional) `preview` if user wants eyeballs.
- `final-render` via `ralphy render <id>` → `render/final.mp4`.

### 8. Report

Final path + total cost (sum `generations.jsonl.cost_usd`) + duration:

> "Done. `workspace/projects/<id>/render/final.mp4` (15.2s, ~$8.40). Cost breakdown: 4× keyframes $0.60, 4× i2v $1.40, VO $0.30, music $0.10, render $0."

## Speed target

From `docs/perf-targets.md`:

| Flow | Cold-start template | Custom from brief |
|---|---|---|
| Plan + assets | ≤3 min | ≤10 min |
| Single 15s video | ≤8 min total | ≤20 min total |

If before pipeline start the estimate is >50% over target — report:

> "This brief is heavier than the template default — estimate ~14 min (target 8). Continue or trim scope?"

## Failure modes

- **Reference gate triggered** — refuse + concrete ask, continue when user sends ref.
- **Quality gate failed twice** — stop, report to user with 3 options.
- **Cost overrun before generate-assets** — stop, ask user.
- **Render fails** — handback to editor with details (asset missing / composition error / version drift).

## Template-suggest matching

`ralphy template suggest "<utterance>"` uses:
- keyword match on `template.json.tags`
- fuzzy match on `template.json.description` and `TEMPLATE.md` first paragraph
- ranking score 0-1

Top-1 score ≥0.7 → strong suggestion. 0.5-0.7 → "might fit". <0.5 → don't propose.
