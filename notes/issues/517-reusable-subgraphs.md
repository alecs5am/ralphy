# Reusable named subgraphs

> **Status:** todo
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** medium
> **Category:** workflow / schemas / reuse

## Context

The pilot graph shape (research -> fan-out into x-thread / short / longform /
carousel branches) makes each unit branch a coherent, reusable machine: a
"short-branch" (script -> anchors -> i2v -> render -> eval -> unit) is the
same shape across news workspaces. Today the only reuse is copy-paste inside
one `workflow.json`; #510's fan-out already introduces per-item subgraph
execution machinery this can build on.

## What

Named subgraphs: a `subgraphs/<name>.json` tier next to workflows (workspace-
local + bundled in #502), each declaring typed entry/exit ports; a `subgraph`
node type that instantiates one by name with param overrides (model bindings,
prompt refs, gate criteria). Validation expands subgraphs at lint time
(cycle/port checks run on the expanded graph); the runner executes the
expansion with journal records namespaced `<node-id>/<inner-id>`.

## Why it matters

Reuse is the compounding lever of the template economy: a debugged
short-branch travels between workspaces and bundles instead of being re-copied
and re-broken. It also keeps top-level graphs readable — the pilot graph
becomes five nodes instead of forty.

## Scope / acceptance

- Subgraph schema: name, version, typed entry/exit ports, param surface
  (which inner params are overridable from the instantiation site).
- `subgraph` node type in #498's union; expansion at parse/lint with
  collision-free inner ids; one level of nesting only (a subgraph may not
  contain a subgraph — document, mirror the fan-out constraint).
- Runner: expanded execution with namespaced journal events; resume works
  across the expansion; fan-out over a subgraph (the pilot shape) works with
  #510's branch scoping.
- Bundle: subgraphs packaged + validated on import (#502).
- `ralphy workflow subgraphs <ws>` list verb; lint covers unused/missing
  subgraph refs.
- Tests: expansion correctness, port mismatch at the boundary, override
  application, fan-out-over-subgraph, resume mid-subgraph.

## Notes

- Sequence after #510 and #511 (executes real branches).
- Canvas rendering of collapsed/expanded subgraphs is #490/#506 follow-up
  territory, not here.
