# Workboard — <slice name>

> **Status:** active | closed — <YYYY-MM-DD>
> **Opened:** <YYYY-MM-DD>
> **Driver:** /dev-loop | <name>
> **Slice:** one line — the coherent product outcome this board moves forward.

## Lanes

Lanes are ordered by dependency (foundational first). Each row is ONE existing `notes/issues/` id.

| Lane | Issue | Depends on | Expected gates | Status |
|---|---|---|---|---|
| <lane> | [#NNN](../issues/NNN-slug.md) | — / #NNN | `lint:x` · `bun test y` | todo / landed `<sha>` / deferred (<why>) |

## Dependency order

One paragraph: why the lanes run in this order (what keys off what; what must NOT be parallelized because it touches shared files).

## Completion notes

_Filled on close._

- **Landed:** issue ids (+ short outcome).
- **Deferred / carried over:** id + why (re-select into the next board).
- **New issues filed mid-run:** id + one line.
- **Gotchas for the next session:** flakes, seams, follow-ups.
