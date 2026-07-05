# Generalize workflow.json into a typed node graph

> **Status:** todo
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** high
> **Category:** orchestration / schemas / workflow

## Context

#478 shipped `workflow.json` (`cli/lib/schemas/workflow.ts`): a linear list of
steps pinned to contract phases, each carrying engine, model(s), variants, eval
gate, `auto|approve` mode, and bounded repair. The farm design
(`docs/architecture/farm-node-graph.md`, "Node design") generalizes this into a
typed node DAG so a workspace bundle can describe ingestion -> production ->
publish end to end, with fan-out and typed data flow between nodes.

## What

Evolve the workflow schema from ordered steps into a graph: a common node
envelope (id, type, typed in/out ports, params, retry, `on_fail`
halt|skip|route, per-node budget, cache policy) plus the node-type taxonomy
from the design doc — LLM nodes, media nodes typed by I/O signature
(t2i/i2i/t2v/i2v/r2v/v2v/lipsync/tts/music/sfx/transcribe/post-ops),
ralphy-verb nodes, ingestion, publish, control-flow
(schedule/calendar-slot/fan-out/join/switch/gate/approval/budget-guard/dedup),
and data nodes. Graph validation runs at load/import: port type mismatches and
capability-matrix violations (#497) fail before any spend.

## Why it matters

The graph spec is the contract between the training path (authored in Claude
Code, shipped in the workspace bundle #502) and the production path (executed
by the farm runner #503, rendered by Studio's canvas #490). Everything else in
the farm batch hangs off this schema.

## Scope / acceptance

- Extend `cli/lib/schemas/workflow.ts` (versioned: existing linear workflows
  keep parsing — a linear workflow is a degenerate graph) with the node
  envelope + node-type discriminated union from the design doc.
- Port typing: named artifact types (`text`, `object:<schema-ref>`, `image[]`,
  `video`, `audio`, `source-item[]`, `unit`); edges validated at parse.
- Graph checks: DAG (no cycles), all edges resolve, port types match,
  media-node (model, provider, params) validated against the #497 matrix —
  import fails with a concrete message naming the node and the fix.
- Decide spec format (open decision 2: YAML vs JSON) — record the decision;
  JSON stays the storage format if that's the pick, YAML accepted at import.
- `ralphy workflow lint <ws> [name]` verb running the full validation offline.
- Executor NOT in scope here (runner work lands in #499/#503 on the existing
  queue/DAG substrate from #478/#481); this issue is schema + validation +
  lint verb + tests.
- Unit tests: envelope defaults, each node category parses, cycle detection,
  port mismatch, capability violation, legacy linear workflow compatibility.

## Notes

- Sequence after #497. Blocks #499, #500, #501, #502, #503, #504, #505.
- Studio canvas (#490) rendering of the new schema is a small follow-up inside
  #506's dashboard work, not here.
