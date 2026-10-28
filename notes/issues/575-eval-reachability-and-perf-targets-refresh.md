# Make eval reachable after render and refresh perf targets

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** pipeline / perf

## Context

From the #562 baseline: eval ran in 1 of 21 production sessions; repair and postmortem never ran. Render took 33% of agent time. Every stage misses `docs/perf-targets.md`, and video clips were waited on one by one (4 idle gaps of 129-175 s in one session).

## What

- After `ralphy render`, print the next contract step (`project status --contract` summary with the eval command) so eval is not skipped.
- Document concurrent clip submission (`--queue` plus one wait) in the art-director skill.
- Refresh `docs/perf-targets.md`: Seedance 2.x rows, per-output-second render budget, and record the October baseline under Validation.

## Scope / acceptance

- Render output includes the next-step hint (tested).
- Art-director skill documents the concurrent pattern.
- perf-targets updated with the baseline numbers.
