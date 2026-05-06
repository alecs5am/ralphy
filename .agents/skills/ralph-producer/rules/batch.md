# Batch generation

## When

≥3 видео off одного template. Меньше → просто `single-video-pipeline` несколько раз.

## Phase 1 — Brainstorm ideas

1. Read template fully:
   - `workspace/templates/<id>/TEMPLATE.md` (vibe, constants, axes)
   - `workspace/templates/<id>/reference-example.md`
   - `workspace/templates/<id>/template.json` (metadata, required assets, cost ballpark)

2. Generate N идей varying along documented axes. Each idea:
   - `id` (kebab-slug)
   - `title`
   - `concept` (1-2 sentences)
   - `brief` (3-6 sentences для scenarist'а)

3. Present как table / numbered list **в чате**. Не пиши на диск пока.

4. Ask user: approve / edit / drop. Один message, не rapid-fire.

## Phase 2 — Lock approved set

```bash
# Записывается через:
ralphy batch create --template <id> --ideas <approved-list>
```

→ `workspace/batches/<batch-id>/ideas-approved.json`:

```json
{
  "batchId": "soviet-cosmetics-2026-04",
  "template": "soviet-nostalgic",
  "createdAt": "...",
  "concurrency": 2,
  "ideas": [
    { "id": "matte-lipstick-001", "title": "...", "concept": "...", "brief": "..." }
  ]
}
```

`batch-id` = kebab-case theme + month. Concurrency default 2, **никогда не >3** (ElevenLabs starter cap).

**Cost preview:** `N × per-video из template card = $total`. User explicit confirm перед Phase 3.

## Phase 3 — Scaffold projects

```bash
ralphy batch scaffold <batch-id>
```

Под капотом — для каждой idea: `ralph template use` → копия required assets → `BRIEF.md` → log-prompt. Output:

`workspace/batches/<batch-id>/state.json` с per-project `pending` status.

## Phase 4 — Run pipeline parallel

Два варианта:

### Option A — fully autonomous (recommended for proven templates)

Spawn N параллельных sub-agents (Agent tool, `general-purpose` type), один на проект. Limit concurrent agents = batch.concurrency. Каждый agent:
- single-video-pipeline end-to-end
- логирует все API calls автоматом (через `ralphy generate`)
- returns render path или failure

### Option B — staged with checkpoints (recommended for first 1-2 batches)

Sequentially per project, но skip approval prompts для artifact types которые пользователь approve'нул в project 1.

### State updates

```bash
ralphy batch status <batch-id> --update <project-id> \
  --status completed --render-path <path>
```

## Phase 5 — Report (batch-review)

```bash
ralphy batch status <batch-id>
```

Summary table из `state.json`:

| project-id | status | step | cost | render |
|---|---|---|---|---|
| matte-lipstick-001 | completed | render | $8.40 | ✓ |
| eye-cream-002 | failed | art-director | $1.20 | ✗ scene-03 fail |
| ... | ... | ... | ... | ... |

Sum costs across all completed = total.

Per failed: which step, last log line, suggested action (retry / manual fix / drop).

Per completed: render path + duration + per-project cost.

Follow-ups:
> "Retry failed (eye-cream-002)? Review renders в dashboard? Export как profile?"

## Concurrency rules

- **OpenRouter media:** 2-3 parallel safe; 5+ throttle.
- **ElevenLabs starter cap:** 3 concurrent → 429. Always sequential PER PROJECT; parallelism только across projects.
- **Local Remotion render:** CPU-bound, one at a time on local machine.
- **Music:** 1 per project, negligible.

## Failure recovery

Failed project в `state.json` → `failed` + last-completed step. "Retry failed" → re-run pipeline только на этих проектах. `ralphy generate ...` respect'ит `--skip-existing` дефолтно.

## Speed target (from `docs/perf-targets.md`)

10× 15s видео ≤25 min wall (parallel где можно). Custom brief — ≤60 min.

Если оценка >50% над — flag user перед стартом:

> "Batch на 10 видео, ETA ~38 min (target 25). Это из-за <reason>. Продолжаем?"
