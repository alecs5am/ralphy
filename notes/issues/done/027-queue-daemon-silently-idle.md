# Queue daemon can show pending jobs while `running: 0`

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

`ralphy queue list` shows 13 pending jobs while `ralphy daemon status` reports `running: 0`. No warning, no actionable hint. Agents bypass the queue and run raw `bash &` fan-outs — which negates everything the queue exists to provide (per-endpoint throttling, retry, manifest writes, cost rollup).

## What

- `sotaocr-fb-001`: 23-image batch had to run via hand-rolled `&` loop after queue silently never picked work up. Also lacks `queue retry --tag X --state failed` / `queue cancel --tag X --state pending`.
- `appstore-takeaminute-001`: after a model-swap, 73 zombie queued jobs had to be hand-cancelled and the fire script re-emitted.

## Why it matters

Queue is the canonical path for any fan-out of N≥3. If it silently idles, agents learn to distrust it and reach for raw bash.

## Suggested fix

- `ralphy daemon status` warns loudly on pending-but-no-worker (red exit code, clear message).
- `ralphy doctor` includes daemon health.
- `ralphy queue …` auto-starts the daemon (or `--auto-start` flag).
- New: `ralphy queue retry --tag X --state failed`, `ralphy queue cancel --tag X --state pending` with filter combos.
- Touch `cli/commands/queue.ts`, `cli/commands/daemon.ts`.

## Sources

- `workspace/projects/sotaocr-fb-001/postmortem/03-cli-issues.md` — #3
- `workspace/projects/appstore-takeaminute-001/POSTMORTEM.md` — zombie queue + cancel/retry gap
