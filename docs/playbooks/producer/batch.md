# Batch generation

## When

≥3 videos off the same template. Fewer → just run `single-video-pipeline` multiple times.

## Phase 1 — Brainstorm ideas

1. Read template fully:
   - `.ralphy/workspaces/<ws>/templates/<id>/TEMPLATE.md` (vibe, constants, axes)
   - `.ralphy/workspaces/<ws>/templates/<id>/reference-example.md`
   - `.ralphy/workspaces/<ws>/templates/<id>/template.json` (metadata, required assets, cost ballpark)

2. Generate N ideas varying along documented axes. Each idea:
   - `id` (kebab-slug)
   - `title`
   - `concept` (1-2 sentences)
   - `brief` (3-6 sentences for the scenarist)

3. Present as a table / numbered list **in chat**. Don't write to disk yet.

4. Ask user: approve / edit / drop. One message, not rapid-fire.

## Phase 2 — Lock approved set

```bash
# Written via:
ralphy batch create --template <id> --ideas <approved-list>
```

→ `.ralphy/workspaces/<ws>/batches/<batch-id>/ideas-approved.json`:

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

`batch-id` = kebab-case theme + month. Concurrency default 2, **never >3** (ElevenLabs starter cap).

**Cost preview:** `N × per-video from template card = $total`. User must explicitly confirm before Phase 3.

## Phase 3 — Run + monitor

```bash
ralphy batch status <batch-id>
```

`ralphy batch create` (Phase 2) already scaffolds projects: for each variation it does `template use` → copy required assets → `BRIEF.md` → log-prompt → marks status `pending`. Output:

`.ralphy/workspaces/<ws>/batches/<batch-id>/state.json` with per-project `pending` status.

## Phase 4 — Run pipeline parallel

Two options:

### Option A — fully autonomous (recommended for proven templates)

Spawn N parallel sub-agents (Agent tool, `general-purpose` type), one per project. Limit concurrent agents = batch.concurrency. Each agent:
- single-video-pipeline end-to-end
- logs all API calls automatically (via `ralphy generate`)
- returns render path or failure

### Option B — staged with checkpoints (recommended for first 1-2 batches)

Sequentially per project, but skip approval prompts for artifact types the user approved in project 1.

### State updates

```bash
ralphy batch status <batch-id> --update <project-id> \
  --status completed --render-path <path>
```

## Phase 5 — Report (batch-review, #410)

```bash
ralphy batch status <batch-id>     # in-flight progress (raw state.json)
ralphy batch review <batch-id>     # deterministic farm-triage roll-up (ZERO model calls)
```

`ralphy batch review` is the canonical Phase-5 primitive (#410). It reads each member project's already-written artifacts (`eval.json`, `repair-plan.json`, `generations.jsonl`) and returns:

- **winners** — ship-ready items (#411 native-video `gate.shipReady === true`, non-fail verdict).
- **failures** — items whose eval verdict is `fail`.
- **inProgress** — no eval yet, or a warn/cheap-gate eval not yet promoted.
- **cost** — per-project + batch-total `cost_usd` summed from `generations.jsonl` (the #032 gen-log contract).
- **styleDrift** — items whose eval flagged `style.*` / `brief.*` findings (the shared-style-lock guard).
- **repeatedModelFailures** — the same (model, error) recurring across ≥2 items — fix the shared route once before re-rolling individuals.
- **recommendedRepairs** — the #409 repair-plan owner buckets per item (art-director / scenarist / editor), summed batch-wide.
- **recommendation** — a one-line agent-actionable next step. Surface it to the user.

Per failed: run `ralphy project repair-plan <id>`, present the owner-grouped plan, re-roll only on approval (#409).

Per completed/winner: form the Unit (`ralphy unit create`) then bulk publish copy — `ralphy unit caption <id> --bulk` (#403).

Follow-ups:
> "Retry failed (eye-cream-002)? Review renders in dashboard? Export as profile?"

## Concurrency rules

- **OpenRouter media:** 2-3 parallel safe; 5+ throttle.
- **ElevenLabs starter cap:** 3 concurrent → 429. Always sequential PER PROJECT; parallelism only across projects.
- **Local HyperFrames render:** CPU-bound (Puppeteer + ffmpeg), one at a time on local machine.
- **Music:** 1 per project, negligible.

## Failure recovery

Failed project in `state.json` → `failed` + last-completed step. "Retry failed" → re-run pipeline only on those projects. `ralphy generate ...` respects `--skip-existing` by default.

## Speed target (from `docs/perf-targets.md`)

10× 15s videos ≤25 min wall (parallel where possible). Custom brief — ≤60 min.

If estimate is >50% over — flag user before start:

> "Batch of 10 videos, ETA ~38 min (target 25). This is due to <reason>. Continue?"
