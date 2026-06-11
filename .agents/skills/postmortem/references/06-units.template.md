# `06-units.template.md` — units produced + provenance

The deliverables doc. What finished **Units** did this project ship, and which
**blocks** (Template / Style / Recipe / Asset) made each one? This is a **record**,
not an extraction or a publish — it freezes the entity facts while they are fresh,
so `templater` (extract + classify) and the `publish-entity.ts` path (#056) can
consume them later without re-deriving anything from the raw `artifacts/` dump.

## What lives here vs. the other docs

- **04-models-and-cost.md** = what model produced each asset and what it cost.
- **06-units.md** = which of those assets were **curated into a finished Unit**, and
  the provenance graph behind each Unit (1 Template + 1 Style + N Recipes + M Assets,
  in a Format).

A Unit is the project-side mirror of the library-v2 Unit entity. It lives at
`.ralphy/workspaces/<ws>/projects/<id>/units/<slug>/unit.json` (formed by `ralphy unit create`,
issue #069). If the project formed no units, say so plainly — do NOT invent them
from the `artifacts/` dump. This doc records reality; forming units is a separate,
explicit, user-driven step.

## Source material to read

1. **`.ralphy/workspaces/<ws>/projects/<id>/units/*/unit.json`** — the source of truth. Each file
   carries `slug`, `format`, ordered `media`, optional `provenance` (`template` /
   `style` / `recipes[]` / `assets[]` block slugs), and `source_assets[]`.
   Run: `for u in .ralphy/workspaces/<ws>/projects/<id>/units/*/unit.json; do jq -c '{slug, format, media: (.media|length), provenance, source_assets: (.source_assets|length)}' "$u"; done`
2. **`.ralphy/workspaces/<ws>/projects/<id>/asset-manifest.json`** — to confirm which slots became
   final deliverables vs. stayed working scratch.
3. **The session conversation** — to mark each provenance block as **NEW** (created /
   discovered in this session) vs. **REUSED** (an existing library block the project
   matched). This NEW/REUSED split is the single highest-signal field for the publish
   path: NEW blocks are publish candidates, REUSED blocks already live in the library.

## Template

```markdown
# Units produced + provenance — <project-id> session <YYYY-MM-DD>

The finished deliverables this project shipped, each as a Unit with its provenance
blocks. A RECORD for downstream extract / publish — no extraction or publishing
happens here.

## Summary

- **Units formed:** <N>  (`ralphy unit list <project-id>`)
- **Formats covered:** <e.g. sticker-pack, fb-creative>
- **Distinct blocks behind them:** <T> templates · <S> styles · <R> recipes · <A> assets
- **NEW (publish candidates) vs. REUSED (already in library):** <X> new / <Y> reused

> If no units were formed: state "No units formed this session. Final deliverables
> remain in `artifacts/`; run `ralphy unit create <project-id> --slug <s> --format <f>
> --from '<glob>'` to curate them before publish." Then stop — the rest of this doc
> is the empty case.

## Units

For each `units/<slug>/unit.json`, fill one block:

### Unit `<slug>` — <format>

- **unit.json:** `units/<slug>/unit.json`
- **Media (ordered):** <count> files — `<first>`, …, `<last>`
- **Title / blurb:** <from unit.json, or "TODO">
- **Provenance graph:**

  | Axis | Block slug | NEW or REUSED | Note |
  |---|---|---|---|
  | template | `<slug>` | NEW \| REUSED | <one line: what structure> |
  | style | `<slug>` | NEW \| REUSED | <one line: the look> |
  | recipe | `<slug>` | NEW \| REUSED | <one line: the effect / treatment> |
  | recipe | `<slug>` | NEW \| REUSED | … |
  | asset | `<slug>` (sub: character/location/prop/music) | NEW \| REUSED | <one line> |

- **Source assets it was curated from:** `<source_assets[] from unit.json>`
- **Blueprint captured:** `units/<slug>/blueprint/` (`ralphy blueprint create <project-id>
  --unit <slug>`, #076) — the per-unit reproduction recipe \| not captured. Record only;
  `templater` invokes the capture, `publish-entity.ts --blueprint <dir>` (#077) pushes it.
- **Publish status:** not published \| published to library (`/library/<id>`) — record
  only; `publish-entity.ts` (#056) does the actual push.

### Unit `<next-slug>` — <format>

…

## Block inventory (deduped across all units)

A single roll-up of every distinct block the project's units reference, so the
publish step has one list to work from. Blocks recur across units; list each once.

| Kind | Slug | Used by units | NEW or REUSED | Publish candidate? |
|---|---|---|---|---|
| template | `<slug>` | <unit-a>, <unit-b> | NEW | yes |
| style | `<slug>` | <unit-a> | REUSED | no (already live) |
| recipe | `<slug>` | <unit-a>, <unit-c> | NEW | yes |
| asset | `<slug>` | <unit-b> | REUSED | no |

## Hand-off note

- **What `templater` should extract + classify next:** <the NEW blocks worth turning
  into library entities, with a one-line rationale each>.
- **What `publish-entity.ts` (#056) can push as-is:** <units with complete provenance
  + any standalone NEW blocks worth publishing on their own>.

---

*Written <YYYY-MM-DD>. Record only — extraction is `templater`, publishing is the
`publish-entity.ts` path (#056).*
```

---

## Filling guidance

- **Read `unit.json`, do not guess.** Every Unit block must trace to a real
  `units/<slug>/unit.json`. If the project has no `units/` dir, use the empty case
  in the template and stop — no fabricated units.
- **NEW vs. REUSED is the load-bearing field.** It is the difference between "publish
  this block" and "this block already exists." When unsure, mark REUSED and note the
  uncertainty — over-publishing a duplicate is worse than under-publishing.
- **Keep it a record.** Do not run `ralphy template extract`, do not run
  `publish-entity.ts`, do not write to `templates/`. This doc only freezes the facts;
  `templater` and #056 act on them.
- **The block inventory dedupes.** A style reused across five units is one row, not
  five. The per-unit graph shows the recurrence; the inventory shows the distinct set.
- **Record the Blueprint path if one was captured.** If `templater` (or a `ralphy
  blueprint create` run) produced a `units/<slug>/blueprint/`, note it on the unit so the
  publish step finds the per-unit reproduction payload. This is a record only — do not run
  the capture or the publish from this doc.

## Iteration N addendum

```markdown
---

## Iteration N — <YYYY-MM-DD>

### New units formed since iteration <N-1>

<one block per new `units/<slug>/unit.json`, same shape as above>

### Provenance changes on existing units

<if a unit gained a recipe / swapped a style this iteration, note it — never rewrite
the prior iteration's block, append the delta here>

### Publish-status updates

| Unit / block | Status as of this iteration |
|---|---|
| `<unit-slug>` | published to `/library/<id>` in commit `<sha>` |
| `<block-slug>` | still a candidate, not yet pushed |
```
