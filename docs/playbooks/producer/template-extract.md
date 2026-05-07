# Template extraction

## When this fires

Project landed well, user wants to reuse the format. Optional arg: source project ID.

## Guardrails

- **Template = vibe reference, not Mad Libs.** Read `workspace/templates/soviet-nostalgic/TEMPLATE.md` as the canonical example before writing a new one.
- Avoid `{VAR}` placeholder skeletons. Avoid locking VO lines / exact clip tables / timings into the template. Those go into `reference-example.md` as ONE concrete instance, not as a required shape.
- **Don't extract** from projects that only have one result or didn't render successfully.

## Workflow

### 1. Read source project fully

```
workspace/projects/<id>/
  BRIEF.md
  TEMPLATE_ORIGIN.md (if scaffolded)
  scenario.json
  prompts.json
  asset-manifest.json
  composition-props.json
  logs/generations.jsonl    ← gold for cost + model-stack
  logs/user-prompts.jsonl   ← what the user iterated on
  assets/
  render/final.mp4
```

```bash
ralphy project timeline <id>   # merged chronology
```

### 2. Agree scope in chat (5-7 bullets before files)

- What is the **format** vs the **specific content** of this project.
- Which axes **vary** between videos in this format.
- Which constants are critical for recognition (voice style, visual contrast, required music track, runtime band).
- What should **copy per project** (trend music, brand font).
- When the template **should not** be used.

### 3. Scaffold template directory

```bash
ralphy template extract --slug <kebab> --name "<Human>" --from-project <project-id>
```

→ `workspace/templates/<slug>/` with `template.json`, stub `TEMPLATE.md`, `fragments.md`, `model-stack.md`, `composition.md`, `reference-example.md`.

### 4. Fill docs in order (each builds on previous)

#### 4.1 `reference-example.md`
- Full VO
- Per-clip motion sketch with real timings
- Key prompts per scene
- Annotations on what to notice

#### 4.2 `fragments.md`
- Reusable building blocks (style fragments, character/product description patterns with adaptation rules, quality guards, music prompts, VO settings).
- **No Mad Libs.**

#### 4.3 `model-stack.md`
- Order of operations + models + real costs from `generations.jsonl`.
- Alternatives that didn't work (from logs + user-prompts.jsonl).
- Pinned versions where critical.

#### 4.4 `composition.md`
- Remotion skeleton.
- Key patterns (transition durations, VO sync, dual-music split).
- Quirks.

#### 4.5 `TEMPLATE.md` (highest-level)
- Why the format works.
- Vibe anchors.
- Variation axes.
- Required inputs from the user.
- Narrative arc as shape (not prescription).
- Music.
- Workflow.
- Cost ballpark.
- When **not** to use.

#### 4.6 `template.json`
- `description`, `tags` (for template suggest matching)
- `kind: "vibe-reference"`
- `assets` (each required block with `required: true`)
- `doNotCopyLiterally`
- `constants`

### 5. Copy required assets

Trend music, brand fonts, recurring reference images from source project to `workspace/templates/<slug>/assets/`. Declare in `template.json.assets`.

### 6. Register

```bash
ralphy template register <slug>
ralphy template list
```

### 7. Smoke-test

```bash
ralphy template use <slug> --project test-<slug>-001 --name "Test" --brief "smoke test"
```

Confirm `TEMPLATE_ORIGIN.md` points to the new docs, required assets land in the right sub-dirs.

```bash
ralphy project delete test-<slug>-001
rm -rf workspace/projects/test-<slug>-001
```

### 8. Report

Scope, required user inputs, per-video cost, how to invoke for a new video or batch.

## When to say "not yet"

- Only 1 video in the format and it vaguely worked → wait.
- Genuinely one-off idea → don't bother.
- Project not rendered yet / logs partial → wait.
