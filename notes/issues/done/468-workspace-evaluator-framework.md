# Generic per-workspace custom-evaluator framework (config + loader + rubric discovery)

> **Status:** done — 2026-06-18
> **Filed:** 2026-06-18
> **Folder:** issues
> **Severity:** high
> **Category:** eval / framework

## Context

Producing a new episode in a universe re-derives the craft rules every time, and quality emerges only after many manual review rounds (the choose-silenthill-003 session ran waves of label/plate/boomerang/ending fixes). The user wants a **generic, per-workspace custom-evaluator framework** — config-driven, reusable for any universe — with Silent Hill as the first instance. This is the foundation the runner (#469), criteria (#470), and the studio workflow (#472–#474) build on. It is **complementary to #457**: the quality-flywheel orchestrator merges the built-in gates; this framework supplies per-workspace CUSTOM criteria that feed that verdict.

## What

Define a per-workspace evaluator config (an `evaluators` block in `workspace.json` or a sibling `<workspace>/evaluators.json`), a Zod schema, and a loader — mirroring the registry-of-criteria pattern in `cli/lib/content-modes.ts`. Extend `discoverStyleLock()` to fall back to a `<workspace>/STYLE_LOCK.md` so the existing deep-style eval auto-uses the universe rubric.

## Why it matters

A config-driven, per-workspace rubric lets each universe encode its hard quality bar once and reuse it across episodes — the lever that makes each stage assemble right the first time instead of being hand-reviewed.

## Scope / acceptance

- Schema `cli/lib/schemas/workspace-evaluators.ts` (Zod): `{ version, criteria: Criterion[], benchmarks? }`; `Criterion = { id, label, category, check: "deterministic"|"vision", severity, threshold, validatorId?, rubricPrompt?, benchmarkRef? }`.
- Loader `cli/lib/workspace-evaluators.ts → loadWorkspaceEvaluators(workspaceSlug)` reading from the target/active workspace; returns `null` when none configured (zero behavior change for workspaces without a rubric).
- Extend `discoverStyleLock()` (`cli/lib/style-lock.ts:101`): after the project-root walk-up fails, fall back to `<workspace>/STYLE_LOCK.md`; unit-test the fallback.
- `workspace.json` stays a loose record (no breaking change); document the `evaluators` key.
- Config plumbing + discovery ONLY — no criteria implementations (that is #470).

## Dependencies and linked work

- Workspaces layer: #108 (done).
- Complements quality flywheel: #457.
- Blocks #469, #470, #471.

## Notes

- Keep the schema fully generic — NO Silent-Hill-specific fields. The SH thresholds live in the instance config (#471).
