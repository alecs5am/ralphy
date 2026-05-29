# `project score` crashes on schema-conformant scenarios

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** quality-gate

## Context

`ralphy project score` crashes on schema-conformant scenarios because the code treats `scenes` as an array while the canonical schema says record (keyed by scene-id). The art-director handoff quality gate currently can't be used; agents skip it silently. Already in MEMORY as known issue but never filed as a tracked issue.

## What

- Referenced across postmortems (`noski-people-001/postmortem/05-workflow-fixes.md` Finding B; `glitter-cream-001/POSTMORTEM.md` via memory).

## Why it matters

The art-director handoff gate is the canonical quality check before fan-out generation begins. With it broken, the autonomous-mode loop has no guardrail.

## Suggested fix

- Fix `cli/lib/eval/score.ts` (or wherever `scoreScenario` lives) to handle both record and array shapes for `scenes`. Prefer record (canonical); accept array with a deprecation warning.
- Lock with a schema test in `cli/test/eval/`.
- Cross-link to issue 015 (invariants-in-CI).

## Sources

- `workspace/projects/noski-people-001/postmortem/05-workflow-fixes.md` — Finding B
- `workspace/projects/glitter-cream-001/POSTMORTEM.md` — via MEMORY reference
- MEMORY: `feedback_project_score_schema_drift`
