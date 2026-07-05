# Publish nodes via Postiz

> **Status:** todo
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** high
> **Category:** distribution / publishing / connectors

## Context

#458 made distribution a first-class phase but stops at platform packs — the
actual upload/post step is still manual. The farm design picks Postiz
(open-source social scheduler) as the v1 publishing backend: it already solves
4x platform OAuth and post queueing, so we integrate rather than write four
connectors (`docs/architecture/farm-node-graph.md`, node category E; open
decision 4).

## What

A `publish` node + `ralphy publish` verb that pushes a Unit's distribution
pack to Postiz with targets (youtube/tiktok/instagram/x), account binding,
and `schedule_at` (fed by the calendar slot, #504). Direct `x-post` for
text-only units (threads don't need Postiz). `youtube-upload` direct-API
fallback stays a named follow-up, not in scope.

## Why it matters

Publishing is the farm's last mile — without it the loop never closes and the
"ralphy runs the account" promise stays a demo. Postiz keeps us out of four
OAuth implementations and their review processes.

## Scope / acceptance

- Postiz connector under the registered-connector discipline: base URL + API
  key env var, no other hosts touched.
- Mapping: `unit.json` media + social copy (#403 path) + pack metadata (#458)
  -> Postiz post payload per target platform.
- `ralphy publish <project> <unit-slug> --targets <t..> [--at <ts>]` works
  standalone (agent-facing) AND as the `publish` node executor (#498).
- Publish results (post ids, scheduled time, per-target status) append to the
  unit's provenance / run log; a failed target routes to `on_fail`, never
  silently drops.
- Publishing is gated: refuses without a passing readiness/eval state or an
  explicit user bypass (mirrors #458's readiness dependency) — this is the
  L0 trust-ladder floor until #505 lands.
- Decide + record: Postiz as external service the farm calls vs bundled in the
  docker-compose (#506) — coordinate with #506's compose file.
- Tests against a mocked Postiz API: payload mapping per platform, schedule
  passthrough, partial-failure handling, gate refusal.

## Notes

- Sequence after #498; pairs with #504 (calendar) and #505 (trust ladder).
- `analytics-pull` is deliberately split out (#507).
