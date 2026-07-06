# fan-out subgraph execution in the farm runner

> **Status:** todo
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** high
> **Category:** orchestration / runtime / content-farm

## Context

#503 landed the farm runner with `fan-out` as a STRUCTURED SKIP (journal
event `fan-out-not-supported`, on_fail does not fire) — per-item subgraph
mapping needs branch-scoped node records the v1 journal model does not carry.
Discovered as a hard dependency during the #496-#509 dev-loop: the #509
tech-news pilot graph is `trend-watch -> research -> FAN-OUT into four unit
branches (x-thread / short / long-form / carousel) -> per-branch gates ->
calendar-slot -> publish`, so the pilot cannot run headless end-to-end until
fan-out executes.

## What

Implement `fan-out` in `cli/lib/farm/runner.ts`: map the node's downstream
subgraph once per input item, with branch-scoped journal records
(`node-completed` events keyed `<node-id>@<branch-index>` or equivalent),
`concurrency` cap from params, per-branch on_fail isolation (one branch
failing routes/halts that branch, not the run), and `join` collecting
across branches. Durable resume must work per branch (a crash mid-branch
re-executes only that branch's incomplete nodes).

## Why it matters

Blocks #509 (the pilot's four-unit fan-out) and any real multi-unit farm
graph — one research pass fanning into N unit branches is the core economics
of the farm design (`docs/architecture/farm-node-graph.md`, node category F).

## Scope / acceptance

- Branch-scoped execution + journal records; resume per branch; concurrency
  cap honored; per-branch on_fail isolation; join barrier across branches.
- Remove the `fan-out-not-supported` skip path; keep a clear error for
  nested fan-out if unsupported (document).
- Tests: fixture graph with fan-out over 3 items (order, records, join),
  branch failure isolation, mid-branch crash resume, concurrency cap.
- `bun test tests/unit/farm-runner.test.ts` extended, full suite green.

## Notes

- Sequence before the #509 pilot's headless acceptance run.
- The #490 canvas + #506 spec-graph endpoint may want branch-aware rendering
  later — out of scope here.
