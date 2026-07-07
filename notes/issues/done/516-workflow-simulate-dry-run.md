# Workflow simulate: dry-run with cost forecast

> **Status:** done — 2026-07-07
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** high
> **Category:** workflow / cost / operations

## Context

`workflow lint` (#498) validates structure; nothing answers the operator's
real pre-flight questions: what will one tick of this graph COST, what will a
calendar week cost, which nodes are paid, where are the approval stops, and
does the environment actually have the keys/coverage the graph needs?
Today the first honest answer arrives with the first bill.

## What

`ralphy workflow simulate <ws> [name] [--ticks N | --week]`: execute the graph
with synthetic executors (no provider calls, no artifacts) that propagate
typed placeholder data, estimate per-node cost from the pricing tables +
variant counts + fan-out cardinality assumptions, and emit a report: cost per
node / per branch / per tick, projected weekly spend against the calendar
(#504), paid-node inventory, approval stops, missing keys, coverage gaps, and
budget-cap headroom (#481).

## Why it matters

"Press start" on a server (#506) is an act of trust; the simulate report is
what makes that trust informed. It's also the training path's exit interview:
the export-readiness story (#502) is incomplete without "and here is what a
week of it costs."

## Scope / acceptance

- Synthetic executor set registered via the existing `executorOverrides` seam
  (`cli/lib/farm/runner.ts`) — the real runner runs the simulation; no
  parallel interpreter.
- Cost model: media nodes priced from the existing pricing/estimate tables per
  (model, provider, params like duration/variants); LLM nodes from token
  estimates; unknown pricing = explicit `unknown` line, never silently $0.
- Fan-out cardinality: from `--assume-items N` or the trend-watch node's
  configured expectations; stated in the report header.
- Weekly projection: ticks derived from schedule nodes x calendar slots.
- Output honors the out() render contract (JSON + pretty table); exit code
  reflects blocking findings (missing key, coverage gap) for CI use.
- Dashboard (#506) gets the report via the app API (render can be a follow-up;
  the endpoint lands here).
- Tests: fixture graph cost math (variants, fan-out multiplication), unknown
  pricing path, missing-key detection, weekly projection.

## Notes

- Sequence after #511/#512 (needs the real executor registry to mirror) and
  #510 (fan-out cardinality).
- `ralphy workspace export` should print the one-tick estimate in its summary
  (small #502 touch, do it here).
