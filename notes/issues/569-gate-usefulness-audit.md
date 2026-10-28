# Gate usefulness audit: keep, relax, replace or retire

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** eval / cleanup

## Context

Most gates and evals (scenario, image, video scoring, hook gate #440, caption gate #441, prose tells, deep vision, workspace evaluators) were written when models were weaker. The owner wants to know which ones still improve results and which only cost time and tokens.

## What

For every gate, measure on a calibration set and on real recent projects:

- How often it fires, false-positive and false-negative rate against human or #558 outcome labels.
- Cost in tokens and wall time.
- Whether its fixes improved the outcome when they were applied.

Then decide per gate: keep, relax thresholds, replace with a cheaper check, merge with another, or retire.

## Scope / acceptance

- `docs/research/gate-audit-2026-10.md` with a table per gate: fires, FP/FN, cost, verdict, reason.
- Retired gates moved behind an opt-in flag first, removed after one release.
- `docs/eval-calibration.md` updated.
- `bun test` passes with the new defaults.

## Notes

- Sequence after #558 (outcome labels). Can start with a cost-and-fire-rate pass before outcomes exist.
