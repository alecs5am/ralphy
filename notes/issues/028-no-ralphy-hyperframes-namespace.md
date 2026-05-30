# No `ralphy hyperframes` namespace; HF inner loop bypasses logging

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

HyperFrames inner-loop verbs (`lint`, `validate`, `snapshot`, `render`, `save-version`, `extract-frames`, `watch`) are not wrapped under `ralphy`. Every iteration falls through to `bunx hyperframes`, bypassing project-scoped logging and auto-versioning. The render-routing gap is captured separately in issue 009 — this issue is the broader namespace.

## What

- `openrouter-ship-001`: ~25 `bunx hyperframes snapshot` and ~23 `bunx hyperframes render` calls in one session.
- `odindoma-fb-ad-001`: #5–#8 cluster — manual version-suffix bumping; no auto-snapshot timestamps from STORYBOARD beats.

## Why it matters

The whole HF flow happens outside ralphy's accounting. Snapshots, lint passes, intermediate compositions — none are visible in `generations.jsonl` or the manifest.

## Suggested fix

- New `cli/commands/hyperframes.ts` namespace:
  - `ralphy hyperframes lint <id>` / `validate` / `snapshot` / `render` / `save-version` / `extract-frames` / `watch`.
  - `save-version` copies current `index.html` to `compositions/v<N>.html` before major edits (closes invariant #14 gap for HTML — see issue 004).
  - `snapshot` reads STORYBOARD beats to auto-pick `--at` timestamps.
- Every verb logs to `generations.jsonl` (kind: `hyperframes.<verb>`) and the asset manifest.

## Sources

- `workspace/projects/openrouter-ship-001/postmortem/03-cli-issues.md` — Repeated section
- `workspace/projects/odindoma-fb-ad-001/postmortem/03-cli-issues.md` — #5–#8
