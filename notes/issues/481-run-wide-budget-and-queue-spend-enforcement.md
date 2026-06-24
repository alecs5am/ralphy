# Run-wide budget caps and queue spend enforcement

> **Status:** todo
> **Filed:** 2026-06-24
> **Folder:** issues
> **Severity:** high
> **Category:** spend / queue / operations

## Context

The scale-operations contract documents the key gap: spend governance is project-local and opt-in, while a content farm can span many projects. The deep research reports both converge on the same operational requirement: high-volume generation needs a run-level cost ceiling, retry budget, and queue enforcement before unattended work becomes safe.

## What

Extend the spend ledger from project-only approvals to run-wide approvals that cover a group of projects and queued jobs. The queue daemon must enforce the cap at dispatch time, not only rely on each `ralphy generate` command checking project-local state.

## Why it matters

At farm scale, "one approval per project" is too much ceremony and too easy to bypass. A user should be able to approve a single budget for a run, then trust the queue to stop before the cap is breached.

## Scope / acceptance

- Add a run-level spend ledger or extend the existing `Approval.scope = "batch"` path into an enforced run/batch cap.
- `checkSpend` can resolve effective approvals in order: project override, run approval, workspace default.
- Queued jobs carry enough project/run metadata for the worker to check spend before spawning the command.
- The queue blocks a paid job when no matching approval exists, the approval expired, the mode is not allowed, or the run cap would be exceeded.
- Add `ralphy run approve <id> --cap <usd> ...` and `ralphy run budget <id>` or equivalent CLI surfaces.
- `batch review` and run status show actual spend, estimated remaining queued spend, remaining budget, and over-budget blockers.
- Tests cover direct generation, queued generation, missing project id, expired approval, mode-restricted approval, and cap exhaustion across multiple projects.

## Notes

- Builds on #444 and #460.
- Sequence after #480 if the Run object is the chosen grouping primitive.
- Keep `--no-budget "<reason>"` explicit and logged when a user overrides the cap.
