# Tech-news farm pilot (fireship-style, multi-unit)

> **Status:** todo
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** high
> **Category:** validation / content-farm / pilot

## Context

The farm's validation vehicle (`docs/architecture/farm-node-graph.md`,
"Pilot"): a tech-news workspace in the fireship register. News is maximally
farm-shaped — high frequency, short relevance window, and one research pass
fans out to four unit types: X thread, short, long-form video, IG carousel.
Relates to `notes/ideas/013-newsroom-carousel-format.md`.

## What

Run the whole two-path model once, for real:

1. Train a `tech-news` workspace interactively (current path — style lock,
   evaluators, parametrized compositions for all four unit types, prompts,
   calendar defaults).
2. Author its node graph: `trend-watch` -> research (`generate-object`) ->
   fan-out into the four unit branches -> per-branch gates -> `calendar-slot`
   -> `publish` (L0: approval-parked).
3. Export the bundle (#502), import into a clean deployment (#506), run
   scheduled ticks (#503) at L0, publish approved units (#501).

The pilot is also the living demo for positioning: a public channel run by the
farm, with visible per-unit cost and decisions.

## Why it matters

Every farm issue's acceptance is synthetic until one workspace goes
brief-to-published end to end without a chat session in the loop. The pilot is
where the export-readiness criterion, the gates, and the trust ladder meet
reality — and it produces the star-magnet demo.

## Scope / acceptance

- The trained workspace exists with `evaluators.json`, `workflow` graph
  lint-green, and all four compositions parametrized (no `coding-agent` node
  in the production graph).
- Bundle exports, imports on a clean `.ralphy` root, and `ralphy farm start`
  produces at least one gated unit of EACH of the four types from a real
  trend-watch tick.
- At least one full L0 publish round-trip through the dashboard approval inbox.
- A pilot postmortem filed (what the farm got wrong, which gates lied, cost
  per unit) feeding fixes back into the batch's issues.
- Content decisions (niche voice, sources list, cadence) stay user-approved —
  paid generation during training follows the normal approval gates.

## Notes

- Sequence LAST — integrates #496-#507; #508's skills should exist so the
  training path routes correctly.
- Training-phase work happens in user mode with the owner; this issue tracks
  the dev-side harness + the end-to-end acceptance, not the creative content.
