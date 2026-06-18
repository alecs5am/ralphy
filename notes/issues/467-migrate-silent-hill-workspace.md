# Migrate the Silent Hill universe into a dedicated `silent-hill` workspace

> **Status:** issue
> **Filed:** 2026-06-18
> **Folder:** issues
> **Severity:** medium
> **Category:** workspace / migration

## Context

The choose-silenthill episodes (001 / 002 / 003) and their cast project (fogtown-cast-001) currently live in the shared `choose-path` workspace alongside unrelated work. The user wants the universe isolated so production and the upcoming per-workspace evaluators (#468) operate on a clean, self-contained universe. This workspace is the **first instance + named test target** for the workspace-evaluator framework.

## What

Create a `silent-hill` workspace and move the four projects into it, then rewrite the hardcoded `choose-path` paths inside choose-silenthill-003's generated build scripts and verify a render still resolves.

## Why it matters

Isolation is the prerequisite for the per-workspace rubric/evaluator work. The hardcoded paths will silently break a re-bake/re-render of 003 after the move (the build scripts read fogtown masters + render assets by absolute workspace path).

## Scope / acceptance

- `ralphy workspace create silent-hill`; then `ralphy project move <id> silent-hill` for `choose-silenthill-001`, `-002`, `-003`, `fogtown-cast-001` (moves dir + updates `registry.json` — `cli/commands/project.ts:1322`).
- Grep + rewrite hardcoded `.ralphy/workspaces/choose-path/projects/...` references in `silent-hill/projects/choose-silenthill-003/{build-index-v2.mjs,rebake-master.mjs,rederive-timeline.mjs}` (and any siblings) to the new workspace path, or make them workspace-relative.
- Verify: `ralphy project show` resolves each; 003's fogtown master refs resolve; `node build-index-v2.mjs` + `ralphy render choose-silenthill-003 --workers 1` succeed from the new location.
- Registry-aware move only — no deletes, no artifacts lost (append-only contract).

## Dependencies and linked work

- Workspaces layer: #108 (done).
- Blocks #471 (Silent Hill rubric instance), #472 (stage-gate mapping).

## Notes

- Both 003 and fogtown-cast-001 move together so the cross-project ref paths stay valid after rewrite.
- Follow-up to consider: promote fogtown-cast-001 from a project into the workspace `shared/` cast library (out of scope here).
