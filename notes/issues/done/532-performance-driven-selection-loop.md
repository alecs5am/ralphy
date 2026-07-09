# Performance-driven selection loop (close the flywheel)

> **Status:** done — 2026-07-09 — flywheel closed: SELECTION_DIMENSIONS extended
> with hookType/lengthBand/angle/thesis/format (+ pure `lengthBand` bucketing);
> produced units record `provenance.selection` (via `campaign stamp`, cell +
> variance profile) and `unitTags` emits observations for the new axes; the #528
> campaign picker (`biasedDrain`) and the #529 variance planner both consult
> `sampleWeighted` over the live weights WITHIN a priority band (bias, never
> hard-exclude, exploration floor intact); COLD-START is byte-for-byte the
> pre-#532 deterministic behavior (priority drain / staggered rotation) —
> asserted in tests. Foundation (attribution, weights store, learnings pin/retire)
> was already landed.
> **Filed:** 2026-07-07
> **Folder:** issues
> **Severity:** high
> **Category:** analytics / quality / content-farm / moat

## Context

#507 pulls per-unit analytics and distills findings into workspace memory —
but nothing FEEDS that signal back into what the farm produces next. Selection
today is blind: the variance planner (#529) rotates profiles uniformly, and
the campaign next-cell picker (#528) drains the plan in order. The
self-improving farm — the one real moat over Postiz/n8n-class tools — requires
closing the loop: real winners bias future choices.

## What

A performance-scoring layer over the analytics store that attributes measured
outcomes (views, retention, CTR, saves) to the choice dimensions that produced
them — hook type, length band, angle/thesis, template, style, posting window,
platform — and emits a per-workspace `selection-weights.json`. The variance
planner (#529) and campaign picker (#528) consult these weights to bias (not
hard-lock) future selection toward winners, with an exploration floor so the
farm keeps sampling new options. Chronic losers get flagged for retirement;
promotions/retirements are human-visible and reversible.

## Why it matters

Quality x volume compounds only if volume teaches the system. This is what
turns "farm that posts" into "farm that gets better at posting" — and it is
exactly the capability a competitor without the production + analytics history
cannot copy from docs.

## Scope / acceptance

- Attribution: join analytics snapshots (#507) to the choice dimensions
  recorded on each unit (variance profile, campaign cell, model bindings);
  handle sparse/early data honestly (wide confidence, low weight — never
  overfit to n=1).
- `selection-weights.json` (append-only history of recomputes): per dimension,
  a score + sample size + confidence + last-updated; documented decay so old
  wins fade.
- Bias integration: #529 planner and #528 picker sample proportional to
  weights with a configurable exploration floor (epsilon) so nothing is ever
  fully starved; weights BIAS, never hard-exclude, without human sign-off.
- Retirement/promotion surface: `ralphy workspace learnings <ws>` shows top/
  bottom performers with evidence; retiring a loser or pinning a winner is an
  explicit, reversible action logged to the workspace lifecycle.
- Cold-start: with no analytics, behave exactly like today (uniform) — the
  loop only sharpens once data exists.
- Tests: attribution math (sparse + rich fixtures), decay, exploration floor
  (no dimension starved), weight -> sampling bias, promotion/retirement
  round-trip.

## Notes

- Sequence after #507, #528, #529.
- Honest-metrics rule: weights come from measured outcomes only; no proxy or
  assumed-indexing signals. Ties into #483 judge calibration (does the eval
  score predict real performance?) — cross-link, don't duplicate.
