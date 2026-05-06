# Single-video pipeline orchestration

## When this fires

Один видео, end-to-end. User: "сделай видео про X", "запусти полный pipeline".

## Steps

### 0. Template suggest (first)

```bash
ralphy template suggest "<user-utterance>"
```

Возвращает top-3 ranked templates. Предлагай top-1:

> "Шаблон **<id>** (vibe: ..., ~$X). Стартую — или скажи 'без шаблона'."

Если `score < 0.5` — не предлагай, сразу scenarist flow.

### 1. Research if needed

Если user supplied site/social URL → **`/ralph-researcher`** first → references on disk.

### 2. Scaffold project

```bash
# С шаблоном:
ralphy template use <slug> --project <ctx>-<NNN> --name "<human>" --brief "<brief>"

# Без шаблона:
ralphy project create --id <ctx>-<NNN> --name "<human>"
```

### 3. Save brief

```bash
# BRIEF.md создаётся автоматом template use'ом (или ручной echo).
ralphy project log-prompt <id> --text "<brief>" --stage brief
```

### 4. Reference-required gate

Перед scenarist'ом — проверь brief на named persona/brand. Если есть и нет ref в `assets/uploaded/` → **refuse** (см. `ralph-art-director/rules/ref-photo-policy.md`):

> "Brief упоминает '<name>' — мне нужен референс (фото/лого/скрин). Скинь сюда либо смени на безличного архетипа."

### 5. Scenario

Hand to **`/ralph-scenarist`** → `scenario.json`. Pause + user approve before money. Quality gate (`scoreScenario`) обязательно passing.

### 6. Prompts + assets

Hand to **`/ralph-art-director`**:
- `prepare-prompts` → `prompts.json`.
- Cost preview: `N images × $X + M videos × $Y + K VO calls × $Z = $T. Run?`.
- `generate-assets` → `assets/*` + `asset-manifest.json`.
- Quality gates auto на каждый asset (`scoreImage` / `scoreVideo`).

### 7. Composition + render

Hand to **`/ralph-editor`**:
- `preflight`.
- `author-composition`.
- (optional) `preview` если user хочет eyeballs.
- `final-render` через `ralphy render <id>` → `render/final.mp4`.

### 8. Report

Final path + total cost (sum `generations.jsonl.cost_usd`) + duration:

> "Готово. `workspace/projects/<id>/render/final.mp4` (15.2s, ~$8.40). Cost breakdown: 4× keyframes $0.60, 4× i2v $1.40, VO $0.30, music $0.10, render $0."

## Speed target

Из `docs/perf-targets.md`:

| Flow | Cold-start template | Custom from brief |
|---|---|---|
| Plan + assets | ≤3 min | ≤10 min |
| Single 15s video | ≤8 min total | ≤20 min total |

Если до start пайплайна оценка >50% над target — отчитайся:

> "Этот brief тяжелее template default'а — оценка ~14 min (target 8). Продолжаем или сократим scope?"

## Failure modes

- **Reference gate triggered** — refuse + concrete ask, продолжаем когда user скинет ref.
- **Quality gate failed twice** — стоп, отчёт пользователю с 3 опциями.
- **Cost overrun перед generate-assets** — stop, ask user.
- **Render fails** — handback в editor с details (asset missing / composition error / version drift).

## Template-suggest matching

`ralphy template suggest "<utterance>"` использует:
- keyword match по `template.json.tags`
- fuzzy match по `template.json.description` и `TEMPLATE.md` first paragraph
- ranking score 0-1

Top-1 score ≥0.7 → strong suggestion. 0.5-0.7 → "может подойти". <0.5 → не предлагать.
