---
name: fixer
namespace: user
description: >-
  The eval-to-repair loop — the consumer of the evaluator's report (#409). Reads the eval output (eval-deep-vision.json's `what_to_redo` first, else eval.json `findings[]`), runs `ralphy project repair-plan <id>` to classify every finding by owner (art-director / scenarist / editor) and order it by severity, presents the ordered plan grouped by owner, gets the user's approval, then applies targeted fixes through the EXISTING `ralphy` verbs (art-director regen / scenarist rewrite / editor recut), re-renders, re-evals, and compares the old vs new verdict.
  HARD GATE: no paid model regeneration runs until the user approves the plan (or previously opted into batch repair). The deterministic `repair-plan` step itself makes ZERO model calls and is safe to run unprompted.
  USE WHEN the user says "fix the eval", "repair this render", "make it shippable", "fix the issues / problems / findings", "address the eval", "now fix it", "make the fixes", or hands off a failed / warn eval and asks what's next. ALSO FIRE right after the evaluator returns a `warn` / `fail` verdict and the user wants action.
  TRIGGER (EN): "fix the eval", "repair the video", "make it shippable", "fix the findings", "apply the fixes", "address the eval issues", "fix what's wrong", "repair plan", "now fix it".
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# fixer — the eval-to-repair loop

The evaluator stops at the report (correct separation of concerns). You are the consumer: you turn that report into an executable, cost-gated fix pass and close the quality flywheel. **The report is your input; a re-rendered, re-evaluated video with a better verdict is your output.**

## ALSO FIRE

- Immediately after `/evaluator` returns a `warn` or `fail` verdict and the user reacts with "ok fix it" / "and now?" / "make it good" (any language — match their chat language, English on disk).
- When the user drops an `eval.json` / `REPAIR_PLAN.md` path and asks you to act on it.
- When the agent-production contract's `repair` phase (#406, `ralphy project status <id> --contract`) is the next gap and the user wants to proceed.

## DO NOT FIRE

- For an UNRENDERED project, or one with no `eval.json` yet — that is the editor (`ralphy render`) then `/evaluator` first. You cannot repair what hasn't been evaluated.
- For "rework scene 3 / rewrite the hook / shorten the VO" as *scenario feedback* on a draft — that is the scenarist playbook (`.agents/skills/scenarist/SKILL.md`). The fixer is the eval-DRIVEN loop, not free-form script editing.
- For false-positive triage only ("ignore the hook-static finding, it's expected for this template") — note the skip and move on; don't spin up a full repair pass.

## HARD INVARIANTS

1. **No paid model call before approval.** This is the load-bearing rule of the whole skill. The `repair-plan` verb is free and deterministic — run it freely. But the moment a fix is an `art-director` re-roll or any `ralphy generate ...` / `ralphy render`, you STOP and wait for the user's explicit "go" on the plan (or a prior "batch repair, don't ask me each time" opt-in). Every plan item is born `approvalState: "pending"` precisely so this gate is structural, not just prose.
2. **Apply fixes only through existing `ralphy` verbs.** No raw `ffmpeg` / `curl` / `bunx tsx`. If a fix needs a verb that doesn't exist, propose adding it and stop (AGENTS.md invariant #2).
3. **Append-only.** Re-rolls auto-version (`.v2`); never `--force-overwrite` without the user asking. The old eval, the old render, the old plan all stay on disk.
4. **Deterministic plan, no LLM.** `ralphy project repair-plan` does pure parsing of the eval output. Do not paraphrase or re-rank findings by hand — the verb owns the owner map + priority order.

## Workflow

### 1. Read the eval output

The report is the handoff. Read, in priority order:
- `<project>/eval-deep-vision.json` — if present, its `parsed.what_to_redo` is the model's own project-specific, prioritized redo list (`{ priority, target, action, rationale }`). This is the preferred source.
- `<project>/eval.json` — the deterministic `findings[]` (structural / audio / caption / vision). Always the fallback, and the only source of the global checks (loudness, dead-air, resolution) the deep pass doesn't cover.

You don't have to parse these by hand — the next step does it deterministically.

### 2. Build the repair plan (free, deterministic, zero model calls)

```bash
ralphy project repair-plan <id>
```

This reads `eval.json` (+ `eval-deep-vision.json` when present), classifies each finding by the role that owns the fix, orders by severity, and writes:
- `<project>/repair-plan.json` — the machine contract (append-only, auto-versions to `.v2`).
- `<project>/REPAIR_PLAN.md` — the human-readable plan you show the user.

**Owner map (deterministic, `cli/lib/repair.ts → classifyFindingOwner`):**

| Category family | Owner | Why |
|---|---|---|
| `style.*`, `brief.*`, `vision.*` (ai-artifacts / text / composition / brand / quality / register / rule / aesthetic / timing) | **art-director** | the LOOK / PROMPT / MODEL produced it wrong — regen the keyframe / re-anchor the i2v / swap the model |
| `structure.*` (duration-drift, hook-zone-empty / -static / -thin-vo) | **scenarist** | a SCRIPT / PLAN problem — re-time the scenario, re-script the opening beat |
| `audio.*`, `captions.*`, `format.*` (loudness, true-peak, dead-air, density, aspect/resolution/fps) | **editor** | the CUT / ENCODE / MIX owns it — loudnorm, recut, re-render, regen captions |
| unknown category | **editor** | the safe catch-all (a recut is least-destructive and never spends on a re-roll); the item is flagged so you confirm before acting |

**Priority order:** `fail` before `warn` before `info`; deep-vision priority-1 redos float to the top. The plan's `items[]` is already sorted (item 1 = act first).

### 3. Present the plan, grouped by owner — then GATE

Show the user `REPAIR_PLAN.md` (or summarize `repair-plan.json`), grouped by owner, leading with the `fail`-severity items and the worst-case `totalCostEstimate`. Then **STOP**:

> "Here's the repair plan — N items, ~$X worst-case. Approve the whole plan, pick which items to apply, or skip? Nothing paid runs until you say go."

If the user previously said "batch repair, just fix it" earlier in the session, you may proceed without re-asking — but still announce what you're about to spend.

### 4. Apply the approved fixes — through existing verbs only

For each `approved` item, route by owner:
- **art-director** → regenerate the affected keyframe / re-anchor the i2v / swap the model via `ralphy generate image|video ...` (read `.agents/skills/art-director/SKILL.md`; check `MODELS.md` before any model pick). Pass the locked product/model master via `--ref` to prevent identity drift (MEMORY.md: super-original refs).
- **scenarist** → re-time `scenario.json` or rewrite the opening line (`.agents/skills/scenarist/SKILL.md`), then regenerate the affected VO / scene.
- **editor** → loudnorm / recut / re-render / regen captions through `ralphy` editor verbs (`.agents/skills/editor/SKILL.md`). For aligned-to-VO captions, follow the scribe-first rule (AGENTS.md #16).

The item's `proposedCommandOrEdit` is the starting point — a `ralphy` / `ffmpeg`-recipe command or a concrete edit instruction.

### 5. Re-render and re-evaluate

```bash
ralphy render <id>
ralphy eval video <project>/render/final.mp4   # add --style-sheet / --brief to match the original eval pass
```

### 6. Compare old vs new verdict

The old `eval.json` was auto-versioned by the re-eval (or lives alongside) — compare `scoring.verdict` and `scoring.score` old→new, and the specific finding ids that cleared. Report: "verdict fail → warn, F1 (register) cleared, F4 (loudness) cleared, F7 (dead-air) still warn." If the verdict didn't improve, surface the still-open findings and ask whether to iterate (back to step 2 on the fresh eval) or ship as-is. Per AGENTS.md invariant #4, do not iterate the same failing gate more than twice without stopping to report options.

## What you write

- `repair-plan.json` + `REPAIR_PLAN.md` (via the verb — append-only).
- Re-rolled artifacts under `<project>/artifacts/<kind>/` (auto-versioned).
- A fresh `eval.json` / `eval-report.md` after the re-eval.

## References

- `cli/lib/repair.ts` — the deterministic plan builder + owner map (source of truth for category → owner + priority).
- `cli/lib/schemas/repair-plan.ts` — the `RepairPlan` Zod schema (item shape, approval states).
- `.agents/skills/evaluator/SKILL.md` — the upstream: how the report is produced.
- `docs/playbooks/{art-director,scenarist,editor}.md` — the role playbooks the fixes route into.
- `MODELS.md` — read before any model pick on an art-director re-roll.
