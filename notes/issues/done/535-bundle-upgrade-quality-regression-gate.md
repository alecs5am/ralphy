# Golden-set quality regression gate on bundle upgrade

> **Status:** done — 2026-07-08
> **Filed:** 2026-07-07
> **Folder:** issues
> **Severity:** medium
> **Category:** quality / lifecycle / content-farm

## Context

`workspace upgrade` (#521) swaps in a new bundle version preserving runtime
state, but nothing verifies the new know-how still MEETS the quality bar. A
prompt tweak or model swap that reads as an improvement in the training path
can silently degrade output on the cases that mattered. The train ->
deploy -> retrain -> redeploy loop (#521) needs a guardrail so "better" is
proven, not asserted.

## What

A per-workspace golden set: a small frozen collection of representative inputs
(sample source items / briefs per unit type) + the incumbent bundle's eval
scores on them. `workspace upgrade` runs the NEW bundle's graph over the golden
set headless — mocked spend where the outcome is deterministic, cheap real
generation where quality genuinely needs eyes — scores via the workspace
evaluators (#468), and compares against the incumbent baseline. A regression
beyond a tolerance blocks the upgrade unless explicitly overridden; an
improvement updates the baseline.

## Why it matters

This is what makes the retrain loop safe to run often. Without it, every
upgrade is a gamble on unattended output quality; with it, the flywheel
(#532 tunes, #521 redeploys) can spin confidently because each redeploy is
regression-checked.

## Scope / acceptance

- Golden-set definition per workspace (`golden/` in the workspace + bundled in
  #502): frozen inputs per unit type + a stored baseline scorecard.
- `workspace upgrade` (#521) runs the candidate over the golden set, scores
  via #468 evaluators, diffs vs baseline per criterion; regression beyond a
  configurable tolerance => upgrade refused with the per-criterion delta.
- Cost-honest: prefer deterministic/mocked scoring; when real generation is
  required for a criterion, estimate + confirm the golden-run cost before
  spending (normal approval gate), and keep the golden set small.
- `--accept-regression "<reason>"` override (logged to the lifecycle log);
  an accepted improvement promotes the new scores to baseline.
- `ralphy workspace golden <ws>` to inspect/refresh the set + baseline.
- Tests: regression blocks, improvement promotes baseline, override path,
  per-criterion delta report, mocked vs real scoring split.

## Notes

- Sequence after #521 and #468; the golden run reuses the #523 e2e harness
  plumbing (mocked executors).
- Cross-links #532: the selection loop proposes changes; the golden gate
  validates them before they reach production.
