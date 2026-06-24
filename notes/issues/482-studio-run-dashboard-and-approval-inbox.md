# Studio run dashboard and approval inbox

> **Status:** todo
> **Filed:** 2026-06-24
> **Folder:** issues
> **Severity:** high
> **Category:** studio / UX / operations

## Context

Studio currently exposes projects, artifacts, a workflow board, and selected scene variants. The content-farm research makes the missing UX clear: the user needs to see a whole run, not inspect one project at a time. The critical surface is an operator board with progress, blockers, quality, budget, and approval decisions.

## What

Add a run-level Studio view over the workspace Run/Campaign control plane. The first version should stay mostly read-only, with narrow metadata writes only for explicit approvals or selections if those are already supported by the CLI state model.

## Why it matters

A content farm with dozens of projects is unusable if the user has to infer state from file grids. Studio should answer "what needs me", "what shipped", "what failed", and "what did this cost" at a glance.

## Scope / acceptance

- Add Studio API endpoints to list workspace runs and read one run summary.
- Add a workspace home or run selector that surfaces active runs before individual projects.
- Add a run dashboard with: progress by workflow step, queued/running/failed jobs, budget, awaiting approvals, quality verdicts, winners, failed items, and packaged Units.
- Add an approval inbox for paid regen, budget increases, repair plans, and publish/package confirmations.
- Link each run row back to existing project workflow boards and artifact grids.
- Preserve Studio's media safety rule: no endpoint deletes, moves, or overwrites media.
- Add fixture-backed server tests and browser-free UI smoke tests for empty, running, blocked, and complete runs.

## Notes

- Depends on #480. Budget fields depend on #481.
- Builds on #478's workflow board and the Studio artifact browser.
- Do not reintroduce the deprecated standalone desktop MVP; keep this in `studio/` first.
