# ralphy-verb node executors (the production middle)

> **Status:** done — 2026-07-07
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** high
> **Category:** orchestration / runtime / content-farm

## Context

#498/#503 landed the graph schema and runner, but every `ralphy-verb` node
type (`ralphy-generate`, `ralphy-render`, `ralphy-eval`, `ralphy-repair`,
`ralphy-unit`, `ralphy-captions`, `ralphy-social-copy`) is schema-only — no
registered executor in `cli/lib/workflow/executors/index.ts`, so the runner
structured-skips them (`no-executor`). The farm can currently ingest and
publish but cannot PRODUCE headless: the generate -> render -> eval -> repair
-> unit middle never executes.

## What

Implement and register executors for the seven ralphy-verb node types. Each
calls the same library code its CLI verb uses (import the lib, don't shell out
to a child `ralphy` process — same-process keeps the spend ledger, gen-log,
and journal in one transaction), maps node ports to verb inputs/outputs, and
appends artifacts per the append-only contract.

## Why it matters

This is the single biggest gap between "farm demo" and "farm": without it the
#509 pilot's four unit branches have nothing to execute between research and
publish.

## Scope / acceptance

- `cli/lib/workflow/executors/ralphy-verbs.ts` registering all seven types.
- `ralphy-generate`: kind + model/provider/params from node params, prompt from
  an upstream port or file ref, refs resolution per the standard order,
  spend-gate check (#444/#481) BEFORE the call, auto-version output, gen-log
  append; result port carries the artifact path + cost.
- `ralphy-render`: renders `<project>/index.html` via the hyperframes adapter;
  fails structured when the composition is missing or unparametrized slots
  remain (names them).
- `ralphy-eval`: runs workspace eval filtered to the node's gate criteria;
  result port carries the scorecard for downstream `gate` nodes.
- `ralphy-repair`: builds the deterministic repair plan; free fixes may apply
  inline per node params; paid items emit an approval-park (mirrors #473).
- `ralphy-unit` / `ralphy-captions` / `ralphy-social-copy`: form the unit from
  selected ports, caption SRT, publish copy — unit port feeds `publish`.
- Every executor honors `budget` caps and `on_fail` routing from the envelope.
- Tests: each executor against fixture projects with mocked providers; a
  fixture graph research -> generate -> render -> eval -> unit runs end to end
  in `farm-runner.test.ts` with zero paid calls.

## Notes

- Sequence FIRST in this tranche — #512, #516, #523 build on it; the #509
  pilot's headless acceptance needs it alongside #510.
- Keep invariant #2 intact: these executors ARE the ralphy entry-point running
  in-process; no new model-call paths.
