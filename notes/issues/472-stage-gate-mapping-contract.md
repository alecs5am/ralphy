# Stage-gate mapping — wire the 4 production stages into the contract with per-criterion gates

> **Status:** issue
> **Filed:** 2026-06-18
> **Folder:** issues
> **Severity:** high
> **Category:** workflow / contract

## Context

The user wants a stage-gated studio: come with an idea, tag the workspace, and make four approval decisions — location/cast, scenario, scene anchors, final montage — where each stage is gated by the relevant workspace-eval criterion so it cannot advance until its eval clears.

## What

Map the four stages onto the production-contract phases (`cli/lib/contract.ts`) and wire each stage's gate to its criterion(s), adding stop-conditions surfaced by `ralphy project status --contract`.

## Why it matters

The gates are what make the workflow trustworthy: the user only reviews output that already cleared the hard bar.

## Scope / acceptance

- Stage → phase → gate map (read from the workspace rubric config #468, NOT hardcoded for SH):
  - Stage 1 (location/cast) → reference + style-lock phases; gate = character-design + location-consistency pre-screen of candidates.
  - Stage 2 (scenario) → scenario phase; gate = `scenario-fidelity`.
  - Stage 3 (anchors) → asset phase; gate = `character-design-cohesion` + `location-consistency`.
  - Stage 4 (montage) → eval phase; gate = `material-density` + `edit-correctness` + `insta-metric-fit`.
- Extend `deriveStopConditions()` (`cli/lib/contract.ts:531`) so an unmet stage gate is a blocking stop-condition.
- The gate reads the latest `workspace-eval.json` (#469) for the criteria owned by the current phase.

## Dependencies and linked work

- Runner #469, criteria #470, production contract #406.
- Blocks #473, #474.

## Notes

- Keep generic — the stage→criterion map comes from the workspace evaluator config (#468), so other universes wire their own gates.
