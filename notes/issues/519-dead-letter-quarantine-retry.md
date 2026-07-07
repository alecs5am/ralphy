# Dead-letter queue and node retry policy

> **Status:** todo
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** medium
> **Category:** runtime / reliability / operations

## Context

The node envelope has `retry: {max, backoff}` and `on_fail` routing (#498),
and #514 adds filter-aware rerouting — but when retries exhaust, the run
either halts or the branch is skipped, and the only recovery is re-running
the whole tick. There is no place where exhausted failures accumulate for
diagnosis, no distinction between transient (retry helps) and permanent
(retry burns money) error classes at retry time, and no targeted re-execution.

## What

A per-workspace dead-letter record: when a node exhausts retries (or fails
with a permanent-class error on the first attempt), append a quarantine entry
(run, node, inputs hash, error class per #450 taxonomy, attempts, cost spent)
and let the run continue per `on_fail`. Operator surface:
`ralphy farm failures <ws>` lists quarantined items with their next-action
hint; `ralphy farm retry <run> <node>` re-executes just that node (and its
downstream dependents) against the journaled inputs — resume machinery from
#503/#510 does the heavy lifting.

## Why it matters

At farm scale failures are a flow, not an event. Quarantine + targeted retry
turns "the Tuesday short died, re-run Tuesday" into "retry one node for
$0.30" — and the error-class split stops the runner from auto-retrying a
safety rejection three times at full price.

## Scope / acceptance

- Retry policy consults error classification (#450/#514): `transient` retries
  per envelope; `safety-*`/`copyright`/`tos-content` skip straight to
  reroute (#514) or quarantine; classification unknown = treat transient.
- Dead-letter store: append-only JSONL per workspace; entries carry enough to
  re-execute (inputs hash -> journaled inputs) and to explain (error class,
  provider payload excerpt, next-action hint).
- `farm failures` (list/show, out() contract) + `farm retry` (single node +
  downstream re-execution, respects spend gates and cache #513).
- Dashboard: failures surface in the run view via the app API; retry stays
  CLI/API-only v1 (no one-click paid retry without the approval model).
- Notifications (#518) fire on quarantine.
- Tests: class-aware retry short-circuit, quarantine entry shape, targeted
  retry re-executes only the node + dependents, spend gate on retry.

## Notes

- Sequence after #511 and #514; #518 integration is one event hook.
