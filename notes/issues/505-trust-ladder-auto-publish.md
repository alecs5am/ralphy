# Trust ladder: earned auto-publish per workspace

> **Status:** todo
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** high
> **Category:** quality / approvals / content-farm

## Context

Full autopilot from day one is the slop-and-ban path. The design
(`docs/architecture/farm-node-graph.md`, "Trust ladder") makes autonomy
earned per workspace: L0 (everything produced automatically, publish requires
dashboard approval) -> L1 (auto-publish above an eval-score threshold,
borderline queues) -> L2 (autopilot, user reads a digest). Promotion is
proposed when rubric verdicts track the user's manual approve/reject decisions
for a streak.

## What

A per-workspace `trustLevel` setting consumed by the `approval` and `publish`
node executors: L0 always parks publishes for approval; L1 auto-passes units
whose workspace-eval score clears a configured threshold; L2 auto-passes all
gate-clearing units. Track verdict-vs-human agreement (every manual
approve/reject on a unit that had an eval verdict is a labeled sample) and
surface a promotion suggestion when agreement clears a streak threshold —
promotion itself is ALWAYS an explicit user action.

## Why it matters

This is the mechanism that moves user attention from O(N) per unit to O(1) per
format without betting the account on an uncalibrated rubric. The agreement
metric also doubles as rubric-quality feedback (ties into #483 calibration).

## Scope / acceptance

- `trustLevel` + thresholds in workspace config (schema + `ralphy workspace
  update`); default L0.
- `approval` node executor honors the level; every auto-pass is logged with
  the score that justified it (audit trail, append-only).
- Agreement tracking: store (eval verdict, human decision) pairs per workspace;
  `ralphy workspace trust <ws>` shows level, agreement rate, streak, and
  whether promotion is suggested.
- Demotion path: a human reject of an auto-published unit resets the streak
  and (configurable) drops L2->L1.
- Never auto-publish over a failed/warn gate at any level (invariant #4
  extends to the farm).
- Tests: level gating per node, agreement math, promotion suggestion trigger,
  demotion on reject.

## Notes

- Sequence after #501 and #503; dashboard controls land in #506.
- Builds on #482 (approval inbox) and #483 (judge calibration).
