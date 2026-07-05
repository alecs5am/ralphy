# Analytics pull and performance feedback loop

> **Status:** todo
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** medium
> **Category:** analytics / memory / content-farm

## Context

The self-improving farm is the moat (`docs/architecture/farm-node-graph.md`,
phase 3): published units report back real retention/views, and that
performance data feeds postmortems and workspace memory — closing the loop
that no scheduler-class tool closes.

## What

An `analytics-pull` node + `ralphy analytics pull` verb: fetch per-post
metrics (views, retention curve where available, likes, shares, CTR) for
published units via the platform APIs (YouTube Analytics first; Postiz-exposed
metrics where its API provides them), store them append-only against the
unit's provenance, and generate a performance postmortem per unit batch that
distills findings into `ralphy memory note --workspace` entries.

## Why it matters

Without the loop, rubric thresholds (#505) calibrate against the user's taste
only. With it, the farm learns from the audience: hook styles, durations, and
formats that actually retain — per niche, persisted in workspace memory where
the next production tick reads them.

## Scope / acceptance

- Metrics schema + storage: `<project>/units/<slug>/analytics.jsonl`
  (append-only snapshots with fetch timestamp).
- YouTube Analytics connector under the registered-connector discipline;
  Postiz metrics passthrough if its API exposes them (verify, don't assume).
- `analytics-pull` node executor (#498) with a schedule param (e.g. pull at
  +1d, +7d after publish).
- Performance postmortem: a bounded `callLLM()`/`generate-object` pass over a
  batch's metrics + unit metadata producing findings; distilled entries go
  through the existing memory discipline (proposed/ staging for bulk, per
  invariant #18).
- Findings reference concrete evidence (unit ids + metric deltas), never vibes.
- Tests: schema, snapshot append, mocked-API pull, postmortem prompt fixture.

## Notes

- Sequence after #501 (needs published units); last in the farm batch with
  #509.
- Keep the memory-tier rule: niche/audience findings -> workspace memory;
  cross-niche craft -> global only via the user-reviewed path.
