# `ralphy catalog use`: insert a catalog item into a project

> **Status:** open
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
