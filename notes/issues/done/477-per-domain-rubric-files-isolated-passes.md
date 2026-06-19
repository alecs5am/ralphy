# Per-domain rubric files + isolated per-criterion vision passes + `--criterion` selector

> **Status:** done — 2026-06-19
> **Filed:** 2026-06-19
> **Folder:** issues
> **Severity:** high
> **Category:** eval / framework

## Context

User feedback on the #468-#476 framework: one shared `STYLE_LOCK.md` + one combined deep-vision call for ALL vision criteria **dilutes the per-check context** — the character check shouldn't read the scenario/audio prose. The user wants a SET of separated prose rubric files (scenario / characters / locations / editing…), each its OWN focused deep-vision check. They also want to re-run a SINGLE criterion in isolation (when iterating on one fix, don't re-spend on the others).

## What

1. **`rubricFile` on a criterion** — a vision criterion references a dedicated prose `.md` (relative to the workspace, e.g. `rubrics/scenario.md`). Resolution precedence for a vision criterion's rubric: inline `rubricPrompt` → `rubricFile` content → registered builtin fragment (#470) → label.
2. **Isolated per-criterion vision passes** — replace the single combined `runVisionPass` with ONE deep-vision call PER vision criterion, each loading ONLY its own rubric (focused context). Trade-off accepted: N model calls instead of 1.
3. **`--criterion <id>` selector** on `ralphy workspace eval` (repeatable / comma-sep) — run ONLY the named criteria and MERGE their fresh results over the prior `workspace-eval.json` (others kept, overall verdict recomputed). Lets the user re-run one failed rubric without re-running the rest.

## Why it matters

Focused context = sharper vision verdicts; the selector = cheap iteration on a single failing domain. Together they make the rubric match the user's mental model (separated prose files, each independently checkable).

## Scope / acceptance

- Schema `cli/lib/schemas/workspace-evaluators.ts`: add optional `rubricFile`.
- Engine `cli/lib/eval/workspace-evaluators.ts`: per-criterion vision pass loading the criterion's own rubric; `runWorkspaceEval` gains a `criteria?: string[]` filter; subset runs merge over the prior scorecard.
- CLI `cli/commands/workspace.ts`: `--criterion <id>` (repeatable) on `workspace eval`.
- `STYLE_LOCK.md` stays the generation-time register lock; eval reads the per-domain `rubrics/*.md`.
- Adapt the `silent-hill` instance: `rubrics/{scenario,characters,locations,editing}.md` + rewire `evaluators.json` to `rubricFile`.
- Tests: rubricFile resolution precedence; subset filter + merge; `--criterion` smoke (deterministic, no LLM).

## Dependencies and linked work

- Extends #468 (schema), #469 (runner/engine), #470 (builtin fragments), #471 (the SH instance).

## Notes

- Keep generic — other universes choose their own domains/files.
