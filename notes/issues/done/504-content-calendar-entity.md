# Content calendar as a workspace entity

> **Status:** done — 2026-07-06
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** medium
> **Category:** workspace / scheduling / content-farm

## Context

The farm plans output against a posting cadence, not per-request: "shorts Mon /
Wed / Fri, carousel Tue, longform Sunday." Today no entity holds that plan —
the user's content plan lives in chat. Design:
`docs/architecture/farm-node-graph.md` (`calendar-slot` node, bundle
`calendar.yaml`).

## What

A workspace-scoped `calendar.json`: recurring slots (weekday/time, unit type,
target platforms) and dated entries with a lifecycle
(`idea -> queued -> produced -> gated -> scheduled -> published`), each entry
linking to its Run, project, and Unit. Plus the `calendar-slot` node executor
(#498): picks the next free slot for a produced unit and stamps `schedule_at`
for the publish node (#501). CLI: `ralphy calendar show|add|fill` (or a
`workspace calendar` namespace).

## Why it matters

The calendar is the user's steering wheel at trust levels L1/L2: they stop
approving units and start editing the plan. It also gives the dashboard (#506)
its primary view and gives `ralphy farm` (#503) the demand signal for how many
items a tick should produce.

## Scope / acceptance

- Zod schema + storage at `.ralphy/workspaces/<ws>/calendar.json`; entries
  append/update by id with an event log (append-only history).
- Slot resolution helper: next free slot per unit type/platform, timezone
  aware, skip-if-filled.
- `calendar-slot` node executor registered against #498.
- CLI verbs with JSON + pretty output (out() render contract, lint:out-coverage
  covered).
- Both doors work: the user imports/edits a plan by hand (agent-mediated), and
  the farm auto-fills entries from produced units.
- Bundled on export (#502) as defaults (slots, mix — not dated entries).
- Tests: slot resolution, lifecycle transitions, no-free-slot behavior
  (queue, don't drop), export/import of defaults.

## Notes

- Sequence after #498; consumed by #501, #503, #506.
