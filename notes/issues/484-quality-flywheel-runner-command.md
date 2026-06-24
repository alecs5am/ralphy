# Quality flywheel runner command

> **Status:** todo
> **Filed:** 2026-06-24
> **Folder:** issues
> **Severity:** medium
> **Category:** eval / CLI / orchestration

## Context

The quality flywheel design explicitly notes a gap: `gatesForContext()` names the applicable gates, but no single command runs them and then builds the scorecard. The deep research recommends a tiered eval pipeline where deterministic checks run first, expensive judges run only where needed, and failures feed regenerate/repair loops.

## What

Add a thin CLI runner that executes the relevant quality gates for a project based on mode, format, platform, and available artifacts, then writes/updates the readiness scorecard. This should be orchestration over existing gates, not a new evaluator.

## Why it matters

Agents should not have to remember a gate checklist. A single runner reduces missed gates, makes batch review more consistent, and gives Studio/run status one canonical "quality pass" action to call out.

## Scope / acceptance

- Add a command such as `ralphy eval run <project>` or `ralphy project quality <project>`.
- The command uses `gatesForContext()` to list applicable gates and executes the corresponding existing eval verbs.
- It runs cheap deterministic gates before expensive model-graded gates and supports `--no-vision` / `--cheap` where meaningful.
- It writes or refreshes the same report files existing gates already own, then calls `buildScorecard()`.
- Output includes gates attempted, skipped gates with reasons, cost-bearing gates, failures, final scorecard verdict, and next recommended action.
- Add dry-run mode that prints the plan without running model calls.
- Add tests for registry fan-out, skipped missing-artifact gates, dry-run output, and scorecard handoff.

## Notes

- Builds on #457 and the architecture doc's "no single run all relevant gates command" gap.
- This command should not bypass native-video final gate semantics.
- Keep repair as a separate explicit step: runner may recommend `repair-plan`, not spend.
