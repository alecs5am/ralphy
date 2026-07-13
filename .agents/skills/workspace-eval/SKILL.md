---
name: workspace-eval
namespace: user
description: >-
  Thin agent-facing wrapper over `ralphy workspace eval <project>` (#469): score one project against its WORKSPACE's CUSTOM rubric (#468 config), surface the per-criterion scorecard, and hand failing criteria to the repair loop. The runner writes `workspace-eval.json` + `workspace-eval-report.md` (append-only) — deterministic criteria run in code, vision criteria in ONE deep-vision pass folding in the workspace STYLE_LOCK + benchmarks. The `overall.verdict` uses the #427 readiness vocab (ship | repair | needs-user-decision | blocked). Pairs with `/evaluator` (the built-in structural / audio / caption gates) and `/fixer` (repair) — this one runs the per-workspace universe rubric, NOT the generic gates.
  USE WHEN the user says "score this against the workspace rubric", "run the custom evaluator", "workspace eval", "check it against the universe's criteria", "run my universe rubric on <project>", "does this pass the workspace's bar", or has an active workspace with an `evaluators.json` rubric and wants a standalone score (outside the four-stage `/universe-studio` flow).
  TRIGGER (EN): "workspace eval", "run the universe rubric", "score against the workspace rubric", "run the custom evaluator", "check against the universe's criteria", "does it pass the workspace bar".
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# workspace-eval — run the universe rubric

A thin wrapper over the #469 runner. **Your input is a project id + its workspace's custom rubric; your output is the per-criterion scorecard plus, on a non-clean verdict, a handoff to repair.** The engine is `ralphy workspace eval` — this skill is only the agent-facing surface.

## ALSO FIRE

- After a render, when the user wants a standalone score against the universe's bar without running the full four-stage `/universe-studio` orchestrator.
- When the user drops a `<project>` and asks whether it clears the workspace's own criteria (distinct from the generic `/evaluator` gates).

## DO NOT FIRE

- For the generic structural / audio / caption / vision gates on an arbitrary mp4 — that is `/evaluator`. This skill scores against the per-workspace CUSTOM rubric.
- For applying fixes — that is `/fixer` / the repair loop (#409). This skill only produces the scorecard and routes failures onward.
- For a workspace WITHOUT an `evaluators.json` rubric — there are no custom criteria to score; the runner reports "no rubric configured". Route to `/evaluator` for the built-in gates instead.
- As the per-stage gate inside the four-stage flow — that is `/universe-studio`, which drives this same runner per stage.

## HARD INVARIANTS

Inherited from `AGENTS.md`:

1. **`ralphy` is the only entry-point.** Run the eval through `ralphy workspace eval` — never call the model or probe the mp4 directly.
2. **Append-only.** The runner archives any existing `workspace-eval.json` / `workspace-eval-report.md` to `.vN` before writing the fresh one; never `--force-overwrite` without the user asking.
3. **Read `MODELS.md`** before overriding the vision model (`--model`).

## Run it

```bash
ralphy workspace eval <project>
```

Flags:
- `--no-vision` — deterministic criteria only, NO model call (a free pass; use it to check the code-checked criteria without spending).
- `--model <id>` — override the deep-vision model (default `google/gemini-3.1-pro-preview`; check `MODELS.md` first).
- `--workspace <slug>` — score against a different workspace's rubric (default: the project's registered workspace).
- `--video <path>` — override the scored video (default `<project>/render/final.mp4`).

It writes `<project>/workspace-eval.json` + `<project>/workspace-eval-report.md` (append-only) and prints the verdict + score + paths.

## The scorecard (`workspace-eval.json`)

```
{ schemaVersion, workspace, projectId, evaluatedAt, video,
  criteria: [ { id, label, category, check, score, verdict, threshold, findings[] } ],
  overall: { verdict, score, summary } }
```

- **Per criterion:** `check` is `deterministic` (code) or `vision`; `verdict` is `pass | warn | fail | na`; `score` is 0-100 or `null` when unscored; `findings[]` carries `{ severity, category, message, fixHint }`.
- **`overall.verdict` (#427 readiness vocab):** any criterion `fail` → **blocked**; else any `warn` → **repair**; else any REQUIRED (`severity: fail`) criterion `na`/unscored → **needs-user-decision**; else **ship**.
- `na` means the criterion did not run — an unregistered deterministic validator, or a vision criterion skipped (`--no-vision` / no video to score).

## Surface it to the user

Show the `overall.verdict` + score, then a one-line-per-criterion summary from `criteria[]` (id · verdict · score · findings count), leading with any `fail` / `warn`. The runner's `workspace-eval-report.md` is the ready-made human view — point the user at it or paste its criteria table.

## Handoff to repair

A `repair` / `blocked` verdict — or ANY `fail` / `warn` criterion — routes to **`/fixer`** / the repair loop (#409). Don't fix here: hand off the `workspace-eval.json` so the fixer reads the findings, builds the deterministic `ralphy project repair-plan <id>`, gates paid regeneration on the user, and re-evals. A `needs-user-decision` verdict means a required criterion is unscored (e.g. no render yet, or `--no-vision` left a hard-bar vision criterion `na`) — surface what's missing and let the user decide, don't auto-spend. A clean `ship` is done.

## References

- `cli/commands/workspace.ts` — the `eval` subcommand (flags + append-only persistence).
- `cli/lib/eval/workspace-evaluators.ts` — `runWorkspaceEval` + the `WorkspaceEvalResult` shape + `deriveOverallVerdict` (#427 mapping).
- `.agents/skills/evaluator/SKILL.md` — the built-in structural / audio / caption gates (the generic counterpart).
- `.agents/skills/fixer/SKILL.md` — the eval-to-repair loop this skill hands off to (#409).
- `.agents/skills/universe-studio/SKILL.md` — the four-stage orchestrator that drives this same runner per stage.
