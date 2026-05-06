# Template extraction

## When this fires

Project landed well, user хочет reuse formate. Optional arg: source project ID.

## Guardrails

- **Template = vibe reference, not Mad Libs.** Read `workspace/templates/soviet-nostalgic/TEMPLATE.md` как canonical example before writing new one.
- Avoid `{VAR}` placeholder skeletons. Avoid locking VO lines / exact clip tables / timings в template. Те идут в `reference-example.md` как ОДИН concrete instance, не как required shape.
- **Don't extract** from projects which only have один result или not rendered successfully.

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
  logs/generations.jsonl    ← gold для cost + model-stack
  logs/user-prompts.jsonl   ← what user iterated on
  assets/
  render/final.mp4
```

```bash
ralphy project timeline <id>   # merged chronology
```

### 2. Agree scope в чате (5-7 bullets перед файлами)

- Что есть **format** vs **specific content** этого проекта.
- Какие axes **vary** между видео этого формата.
- Какие constants critical для recognition (voice style, visual contrast, required music track, runtime band).
- Что должно **copy per project** (trend music, brand font).
- Когда template **не должен** использоваться.

### 3. Scaffold template directory

```bash
ralphy template extract --slug <kebab> --name "<Human>" --from-project <project-id>
```

→ `workspace/templates/<slug>/` с `template.json`, stub `TEMPLATE.md`, `fragments.md`, `model-stack.md`, `composition.md`, `reference-example.md`.

### 4. Fill docs в order (each builds on previous)

#### 4.1 `reference-example.md`
- Full VO
- Per-clip motion sketch с real timings
- Key prompts per scene
- Annotations что замечать

#### 4.2 `fragments.md`
- Reusable building blocks (style fragments, character/product description patterns с adaptation rules, quality guards, music prompts, VO settings).
- **No Mad Libs.**

#### 4.3 `model-stack.md`
- Order of operations + models + real costs из `generations.jsonl`.
- Alternatives которые не сработали (из logs + user-prompts.jsonl).
- Pinned versions где critical.

#### 4.4 `composition.md`
- Remotion skeleton.
- Key patterns (transition durations, VO sync, dual-music split).
- Quirks.

#### 4.5 `TEMPLATE.md` (highest-level)
- Why формат works.
- Vibe anchors.
- Variation axes.
- Required inputs от user'а.
- Narrative arc как shape (не prescription).
- Music.
- Workflow.
- Cost ballpark.
- When **not** to use.

#### 4.6 `template.json`
- `description`, `tags` (для template suggest matching)
- `kind: "vibe-reference"`
- `assets` (each required block с `required: true`)
- `doNotCopyLiterally`
- `constants`

### 5. Copy required assets

Trend music, brand fonts, recurring reference images из source project в `workspace/templates/<slug>/assets/`. Declare в `template.json.assets`.

### 6. Register

```bash
ralphy template register <slug>
ralphy template list
```

### 7. Smoke-test

```bash
ralphy template use <slug> --project test-<slug>-001 --name "Test" --brief "smoke test"
```

Confirm `TEMPLATE_ORIGIN.md` указывает на новые docs, required assets landed в right sub-dirs.

```bash
ralphy project delete test-<slug>-001
rm -rf workspace/projects/test-<slug>-001
```

### 8. Report

Scope, required user inputs, per-video cost, как invoke для new video или batch.

## When to say "not yet"

- Только 1 video в формате и vaguely worked → wait.
- Genuinely one-off idea → не bother.
- Project not rendered yet / logs partial → wait.
