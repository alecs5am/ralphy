# Scope and required-flag ergonomics for agents

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** cli ergonomics

## Context

From the #562 baseline: 42 `ralphy` usage errors. 23 were workspace / project scope errors (slug passed instead of id, ambiguous workspace, conflict with the session scope); 19 were missing required flags, led by `project log-asset --source` (13).

## What

- Accept workspace and project slugs wherever ids are accepted; resolve unambiguously or list candidates.
- Scope errors list the valid ids and name the active session scope on conflict.
- `project log-asset`: infer or default `--source`, and print a working example in the error.
- Required-flag errors from commander print one example invocation.
- `ralphy models ...` needs no Workspace scope (read-only registry and catalog): join the scope-free branch in `cli/index.ts` with `prompts` and `skill` (found in #574).

## Scope / acceptance

- Tests for slug resolution, ambiguous scope listing, and the log-asset default.
- Re-run `bun run session:report` on new sessions after the change and record the drop in usage errors in the baseline doc.
