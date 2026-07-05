# Farm scheduler and headless graph runner

> **Status:** todo
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** high
> **Category:** orchestration / runtime / content-farm

## Context

The execution substrate exists piecewise: the queue daemon + jobs DAG
(`.ralphy/jobs.db`, #481), the Run control plane (`ralphy run`, #480), the
stage repair loop (#473), and workflow evaluation (#478). What's missing is
the headless driver: something that wakes on schedule, executes a workspace's
node graph as a Run, parks durably on approval nodes, and resumes — with no
chat session anywhere (`docs/architecture/farm-node-graph.md`, "Runtime").

## What

`ralphy farm start [--workspace <ws>]`: a long-lived bun process that reads
`schedule` trigger nodes from the workspace graph (#498), fires ticks (cron
semantics), compiles each tick into queue jobs honoring node dependencies,
executes node types via their registered executors (#499/#500/#501 +
ralphy-verb nodes), and binds every tick to a Run (#480) with run-wide budget
enforcement (#481). `budget-guard` and `approval` nodes park the run durably;
`ralphy farm status|stop` inspects and halts.

## Why it matters

This is the piece that turns the playground into a farm: everything upstream
(graph, nodes, bundle) is inert without a scheduler-driver, and everything
downstream (dashboard, trust ladder) observes what this process does.

## Scope / acceptance

- Tick -> Run compilation: one tick = one Run with `run.json` per #480 schema;
  node executions append run events (journal), never overwrite.
- Durable resume: kill the process mid-run, `farm start` again, the run
  continues from the journal (approval-parked runs survive restarts for days).
- Approval parking integrates the existing approval/inbox state model (#482);
  free repair auto-loops, paid regen parks (mirrors #473 semantics).
- Spend: every paid node checks run-level approvals via the #481 path; a
  `budget-guard` breach halts the run with a visible blocker, not an error
  spiral.
- Failure routing per node envelope (`on_fail: halt|skip|route`).
- No auto-launched extra processes beyond the daemon itself (invariant #5 is
  about chat sessions; `farm start` is explicit user intent — document this
  distinction in the invariant note).
- Tests: fixture graph end-to-end with mocked executors — tick fires, DAG
  order respected, park/resume, budget halt, `on_fail` routes.

## Notes

- Sequence after #498, #499; consumes #500/#501 when present (graph without
  ingestion/publish nodes still runs).
- Executor placement (open decision 3): this issue picks the standalone
  `ralphy farm` process; the workflow-app API (#492) observes it. Record the
  decision.
