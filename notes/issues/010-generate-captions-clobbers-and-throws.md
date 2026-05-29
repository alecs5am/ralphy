# `generate captions` writes to a shared file and throws on silence

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** cli

## Context

`ralphy generate captions` always writes to `<project>/captions.json` regardless of the `--slot` flag, and throws on empty/silent audio instead of returning `[]`. The `--output`/`--out` flags are advertised in the "Did you mean?" error but not actually bound. Concurrent or batch caption calls produce stale-prior-scene data and false-positive postmortem findings.

## What

- `noski-people-001`: ~80 batch caption calls produced stale data on silent scenes; spurious finding "scene-14 contains scene-13 speech" wasted user-feedback turn.
- `venom-bodywash-001`: 5 sequential scene-VO transcriptions required manual `cp` after each to preserve.
- `choose-your-guide-001`: GAP-3 + GAP-13 — caption wrapping, safe-zone, brand-name spelling all live in user-land Python, not the verb.

## Why it matters

Caption-overlay compositions are a standard ralphy register. The current verb makes them impossible to batch reliably, so the agent reaches for ad-hoc Python loops.

## Suggested fix

- `cli/commands/generate.ts` (captions subcommand):
  - Route output to `<project>/assets/captions/<slot>.json` when `--slot` is given.
  - Bind `--output <path>` properly.
  - On empty transcript → return `[]` with exit 0 (not a throw).
  - Emit BOTH SRT and a drawtext-per-line filter snippet.
  - Add `--max-width-pct`, `--font-file`, `--safe-zone tiktok|reels|shorts` flags.
  - Built-in brand-spelling dictionary (`RALFY→RALPHY` etc.) configurable per project.
- Touch `cli/lib/transcribe.ts` around the empty-audio throw path.

## Sources

- `workspace/projects/noski-people-001/postmortem/03-cli-issues.md` — #3, ~80 batch calls
- `workspace/projects/venom-bodywash-001/postmortem/03-cli-issues.md` — #10, workflow-fixes #8
- `workspace/projects/choose-your-guide-001/postmortem/03-cli-issues.md` — GAP-3, GAP-13
