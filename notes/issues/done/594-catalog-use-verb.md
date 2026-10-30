# `ralphy catalog use`: insert a catalog item into a project

> **Status:** done — 2026-10-30 (`ralphy catalog use` inserts an item as a HyperFrames sub-composition clip with typed params and SFX, snapshots first, and appends each use to `logs/catalog-uses.jsonl`; verified in a real local render)
> **Filed:** 2026-10-30
> **Folder:** issues
> **Severity:** medium
> **Category:** catalog / editor / CLI

## Context

The motion catalog (#563-#567, `catalog/manifest.json` and `catalog/items/<kind>/<id>.html`) holds 67 transitions, elements, layouts, captions and camera moves. No verb puts an item into a project: the agent copies fragments into `index.html` by hand, which is slow, error-prone and leaves no record of which catalog items a video used. That record is what the motion eval needs to link items to hit rate, completion and engagement.

## What

- `ralphy catalog use <item-id> --project <id> [--at <sec>] [--duration <sec>] [--param k=v ...] [--dry-run]`:
  - snapshots the current `index.html` first (`hyperframes save-version` semantics, AGENTS invariant 14);
  - copies the fragment into the project the way HyperFrames sub-compositions expect, with typed params validated against the manifest;
  - inserts the clip into `index.html` at the given time;
  - copies referenced SFX into the project artifacts when the item declares them;
  - records the use (item id, version, params, time) in the project so later evals can join on it.
- Works on store-backed projects (the #591 project-tree Composition path) and tree-only roots.
- Clear errors for an unknown item, a bad param, an `--at` past the composition length, or a missing `index.html`.

## Scope / acceptance

- Integration tests (HOME isolated): use a transition and a caption item on a fixture project; the snapshot exists; `index.html` gains the clip; the usage record exists; HyperFrames lint passes on the result.
- `catalog use` documented in the editor skill's catalog section and in `docs/cli-surface.generated.md`.

## Resolution

- `ralphy catalog use <item-id> --project <id> [--at] [--duration] [--param k=v] [--track] [--dry-run]` (`cli/commands/catalog.ts`, library in `cli/lib/catalog/use.ts`). Transitions take `--from` / `--to`, camera recipes `--target` (layer recipes `--bind bg=...`), captions `--words` (seconds from the clip start, or `ralphy generate captions` JSON); `--bind` names other host elements. `cam-follow` (point track) is refused with a pointer to wiring it by hand.
- Fragment location: `compositions/catalog/<id>.html`, a HyperFrames sub-composition (registry block layout) that cannot collide with `compositions/v<N>.html`. One copy serves every use; bytes that differ from what the catalog would write (an edit, or a newer catalog) are never overwritten, the next `<id>.v<N>.html` is written. Each host `<div>` in `index.html` carries its own `data-composition-id` (`catalog-<id>-<n>`) and the file has none: the pinned render compiler (hyperframes 0.6.31) does not rename duplicate host ids, so two uses sharing one id broke in a real render. Params travel in `data-variable-values` and the script reads them from its host, because that compiler does not pass per-instance values to `getVariables()`. Transitions and camera recipes resolve host selectors against the page and add their CSS to the page (mask-wipe classes the incoming scene).
- Snapshot: on a store root, the #591 project-tree Composition revision (`renderCompositionForProject`), not `hyperframes save-version`, whose checkout revision would stop `render` from reading the tree; on a tree-only root, an append-only `compositions/v<N>.html` (reused when the newest one already holds the same bytes).
- Timing: `--at` defaults to the end of the last clip on the target track (0 when empty), `--track` to the first free track above every non-catalog clip; `--duration` to the manifest duration (captions: last word end + 0.6 s) and drives the item's `duration` param when it has one. Overlaps on an explicit track, `--at` at or past the composition length, and clips running past it are refused (E_INPUT_INVALID); unknown items E_NOT_FOUND, missing `index.html` E_FILE_UNREADABLE, missing host flags E_FLAG_MISSING. No new error codes.
- SFX: copied from the pack into `artifacts/sfx/` with an `<audio>` clip at the cue on a free track; a missing pack or entry is a warning.
- Usage record: `logs/catalog-uses.jsonl` (`ralphy.catalog-use/v1`: item, kind, itemSha256 of the copy, catalog date, copy path, params, context, start, duration, end, track, sfx, snapshot, timestamp). Store activity events are a sync change feed whose payload is not listed back, and tree-only roots have no store, so the record sits beside `generations.jsonl`; `logs/` is not a Composition source.
- Tests: `tests/unit/catalog-use.test.ts`, `tests/integration/catalog-use-594.test.ts` (tree-only and store roots, upstream `hyperframes lint` clean). Docs: editor skill cookbook, `motion-catalog.md`, `caption-presets.md`, `virtual-camera.md`, `docs/cli-surface.generated.md`.
