# Run-level Studio canvas

> **Status:** done — 2026-06-25
> **Filed:** 2026-06-25
> **Folder:** issues
> **Severity:** high
> **Category:** studio / content-farm / UX

## Context

The n8n-style reference image maps well to content farms: source fan-out, normalize, merge, LLM transform, destination fan-out. Ralphy already has a project workflow board (#478) and a run dashboard (#482), but not a run-level canvas that shows a whole farm run as a source-to-unit graph.

## What

Add a run-level canvas view in Studio. It should render the content-farm graph from existing run state: sources, research/intelligence, strategy/template, batch matrix, projects, eval/repair gates, Units, and publish destinations. The first version is a visual control room, not a free-form node editor.

## Why it matters

For high-volume production, the user needs to see where the farm is blocked and which branch produced usable output. A graph view makes fan-out/fan-in, failed gates, spend, and winners visible without opening every project.

## Scope / acceptance

- Add a derived read model for a run graph; do not create a new general graph runtime.
- Node types include `source`, `research`, `strategy`, `template`, `batch`, `project`, `gate`, `repair`, `unit`, and `destination`.
- Edges represent artifact/provenance flow, not arbitrary executable wiring.
- Studio renders the graph with pan/zoom, node status, cost, verdict, artifact counts, and approval-needed badges.
- Clicking a node opens a drawer with related files, annotations, logs, eval findings, and context-inbox actions.
- Layout persistence is metadata-only and scoped to the run.
- Tests cover empty, running, blocked, failed, and complete run fixtures.

## Notes

- Builds on #480 and #482.
- Do not implement a free-form n8n clone in this issue. Manual editing belongs to the safe config patch issue.
