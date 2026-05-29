# `generations.jsonl` schema drift; missing `input.slot`; analyze-video not logged

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

`logs/generations.jsonl` is supposed to be the canonical cost+lineage record. Multiple drifts make it unreliable:
- Mixed key casing across rows: `costUsd` vs `cost_usd`, `endpoint` vs `model`. `jq` queries need defensive fallbacks.
- `input.slot` is `null` on every row even when `--slot X` was passed.
- `ralphy ref analyze-video` (gemini-3.1-pro-preview video input) is never logged at all.

## What

- `appstore-takeaminute-001`: mixed key casing made postmortem `$` accounting fail.
- `glitter-cream-001`: same key-casing issue caught indirectly.
- `venom-bodywash-001`: #9 — `jq 'select(.input.slot != null)'` returns empty on 47 entries; postmortem had to count regen variants from filenames.
- `tokyo-y2k-001`: #4 — 17 video-analysis calls produced zero log entries; postmortem cost line is `$1-3 (est)`.

## Why it matters

The log is load-bearing for postmortem and cost rollup. Schema drift means every postmortem author writes defensive `jq` fallbacks; missing `input.slot` means per-slot cost analysis is impossible.

## Suggested fix

- Pick canonical keys in `cli/lib/log.ts` write paths (`media.ts`, `llm.ts`): `cost_usd`, `model`, `provider`, `endpoint`, `input.slot`, `input.project`, `kind`, `attempt`.
- Migration: one-shot script that rewrites legacy rows to canonical keys (or accept both on read).
- Persist `--slot` into `input.slot` for image/video/music/voiceover/captions.
- Wrap `cli/lib/research.ts → analyzeVideo()` (~line 662) with `logGeneration({ kind: "video-analysis", projectId: <inferred>, ... })`. Infer projectId from mp4 path under `workspace/projects/<id>/assets/`.
- Add lint to fail CI on writes that emit legacy keys.

## Sources

- `workspace/projects/appstore-takeaminute-001/POSTMORTEM.md` — schema drift
- `workspace/projects/glitter-cream-001/POSTMORTEM.md` — same (indirect)
- `workspace/projects/venom-bodywash-001/postmortem/03-cli-issues.md` — #9
- `workspace/projects/tokyo-y2k-001/postmortem/03-cli-issues.md` — #4
