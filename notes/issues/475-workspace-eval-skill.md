# `/workspace-eval` skill

> **Status:** issue
> **Filed:** 2026-06-18
> **Folder:** issues
> **Severity:** low
> **Category:** skill / eval

## Context

Agents need a thin, agent-facing skill to run the workspace rubric on a project, read the per-criterion scorecard, and route failures to repair — the manual counterpart to the studio's automated gates (#474).

## What

A skill wrapping `ralphy workspace eval <project>` (#469): run it, surface the per-criterion scorecard, and hand failing criteria to the repair loop / `/fixer`.

## Why it matters

Not every run goes through the full studio orchestrator; a standalone "score this against the universe rubric" skill is the lightweight entry point and keeps the runner discoverable.

## Scope / acceptance

- Skill `.agents/skills/workspace-eval/SKILL.md` (namespace `user`); documents the runner, the `workspace-eval.json` scorecard shape, and the handoff to repair (#409 / `/fixer`).
- Frontmatter passes `lint:skills`.
- Thin wrapper — the engine is #469; this skill is only the agent-facing surface.

## Dependencies and linked work

- Runner #469, repair loop #409.

## Notes

- Pairs with `/evaluator` (built-in gates) and `/fixer` (repair); this one runs the per-workspace CUSTOM rubric.
