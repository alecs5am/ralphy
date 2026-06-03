# templater + postmortem emit Blueprints alongside the generic Template/blocks

> **Status:** todo
> **Filed:** 2026-06-03
> **Folder:** issues

## Context

#070 made templater/postmortem entity-aware for the 5 metadata entities. With Blueprints
(#074/#076) the extract step should ALSO produce the per-unit reproduction recipe, so a
single templater pass yields both the generic Template (discovery) and the Unit's Blueprint.

## What

- **templater** — for each Unit, run `ralphy blueprint create` (#076) and include the
  Blueprint in the output bundle (`units[].blueprint`), plus print its `--blueprint` publish
  command alongside the unit/block publish commands. Keep extract+classify; still no `--push`.
- **postmortem** — `06-units.md` records, per unit, that a Blueprint was captured (path) so
  downstream consumers find it.

## Why it matters

Makes "ship reproducible units" the default output of finishing a project, not a manual extra.

## Scope / acceptance

- templater bundle gains `blueprint` per unit (with status NEW/REUSED, payload path).
- The skill body + references updated; postmortem `06-units.md` template references the Blueprint.
- Dry-run on a real project (e.g. a choose-path unit) emits a valid Blueprint + publish cmd.

## Notes

- Depends on #074, #076; updates #070 (entity-aware templater/postmortem), #056 (publish skill).
