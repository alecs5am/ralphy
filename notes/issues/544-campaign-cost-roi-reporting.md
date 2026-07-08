# Campaign cost/ROI reporting

> **Status:** todo
> **Filed:** 2026-07-08
> **Folder:** issues
> **Severity:** medium
> **Category:** analytics / operations / content-farm

## Context

The signals for a business-level view all exist but nobody joins them: spend
per unit/tick (#518 rollup), per-unit performance (#507 analytics), and the
campaign plan (#528). The operator cannot currently answer the question that
decides whether to keep running a farm: "what did this campaign cost, what did
it return, and which format/topic is worth the money?"

## What

A cost/ROI report at campaign (#528) and workspace granularity that joins
spend to outcomes: total + per-unit + per-format spend, against views /
retention / CTR / saves from analytics (#507), yielding cost-per-1k-views,
cost-per-unit-by-format, and a spend-vs-performance ranking that says which
formats/topics/angles earn their cost. `ralphy campaign roi <id>` /
`ralphy workspace roi <ws>` + a dashboard panel.

## Why it matters

Quality x volume / attention is the farm's thesis, but the operator steers on
money: this report is what tells them to pour budget into shorts and cut
carousels, or that a topic cluster is expensive and dead. It also feeds the
selection loop (#532) a cost-aware signal (a cheap-but-decent format may beat
an expensive-slightly-better one on ROI).

## Scope / acceptance

- Join layer: spend (gen-log + publish + quota-cost) x performance (#507)
  keyed by unit -> aggregated by format, topic/campaign cell, angle, platform.
- Metrics: total spend, cost/unit, cost/1k-views, best/worst ROI cells;
  honest handling of units without analytics yet (excluded from ROI, counted
  in spend, flagged "pending performance").
- `campaign roi <id>` + `workspace roi <ws>` (out() contract); dashboard panel
  via the app API (#492 boundary).
- Feeds #532: expose a cost-adjusted performance score the selection loop can
  weight by (so selection optimizes ROI, not raw views) — coordinate the
  metric, don't duplicate the loop.
- No assumed/synthetic numbers: costs from real ledgers, performance from real
  analytics; unknown = explicitly unknown.
- Tests: join math on fixtures (units with/without analytics), per-format
  aggregation, cost-per-1k-views, pending-performance handling, ROI ranking.

## Notes

- Sequence after #507/#518/#528; lightweight (a reporting view over existing
  stores, not a new data pipeline).
- Cross-links #532 (ROI-aware selection) and #535 (a regression that also
  raised cost is not an improvement).
