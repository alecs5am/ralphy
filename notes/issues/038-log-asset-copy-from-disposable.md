# `project log-asset` doesn't copy; macOS disposable paths auto-delete

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

`ralphy project log-asset` only logs the path. macOS screenshot paths like `~/NSIRD_screencaptureui_*/TemporaryItems/.../screenshot.png` auto-delete within minutes. By the time the agent re-reads the asset, the file is gone.

## What

- `skater-spiderverse-001`: #4 — two-step `cp` + `log-asset` workaround; one screenshot already lost between turns when the agent tried to re-read it 16 min later.

## Why it matters

User-supplied references are load-bearing inputs to the art-director stage. Losing them between turns is a silent data-loss class.

## Suggested fix

- Add `--copy-from <src>` (or `--ingest <src>`) flag to `ralphy project log-asset`:
  - Copies file into `workspace/projects/<id>/refs/<basename>`.
  - Logs both the original path and the project-local copy in `user-assets.jsonl`.
- Detect known-disposable path patterns (`NSIRD_*`, `TemporaryItems/`, `/tmp/`) and warn if `--copy-from` not used.

## Sources

- `workspace/projects/skater-spiderverse-001/postmortem/03-cli-issues.md` — #4
