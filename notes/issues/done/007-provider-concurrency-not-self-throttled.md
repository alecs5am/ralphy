# Provider concurrency caps not enforced inside CLI

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** cli

## Context

Each provider/endpoint has its own concurrent-call cap and the CLI does not self-throttle. Parallel fan-out (the natural pattern for any N-asset project) trips 429 / 403 on the over-cap calls and pollutes `generations.jsonl` with hard-failure rows. The OR 403 message even reads as a $ balance problem ("Key limit exceeded (total limit)") which sends agents on wrong fixes.

## What

- `choose-your-guide-001`: 9 parallel ElevenLabs voiceover calls → 6 hard-failed with 429 `concurrent_limit_exceeded` (cap: 3).
- `tokyo-y2k-001`: 3 parallel ElevenLabs Music gens → 1 hard-failed (cap: 2).
- `appstore-takeaminute-001`: 73 of 73 queued image jobs failed 403 against `gpt-5.4-image-2` (per-key OR concurrent cap).
- `analog-horror-fridge-001`: 9 of 10 queued failed 403 with $271 credits remaining — the 403 wording misled the agent toward "out of credits".
- `sotaocr-fb-001`: queue daemon never picked up the 23-image batch; agent fell through to raw `bash &`.

## Why it matters

Concurrency tuning is currently tribal knowledge. The agent has no signal to pre-throttle and the post-failure error wording wrongly steers debugging.

## Suggested fix

- Per-provider semaphore in `cli/lib/providers/concurrency.ts`:
  - ElevenLabs Voice: 3 concurrent
  - ElevenLabs Music: 2 concurrent
  - OpenRouter image endpoints: 1 concurrent per model (per MODELS.md row); confirmed `gpt-5.4-image-2` is NOT hard-capped to 1 (memory: `feedback_openrouter_parallel_gpt_image`) — so use 2 default.
- Self-throttle inside `generateMusic()` / `generateVoiceover()` / `generateImage()` rather than 429-erroring.
- Rewrite the OR 403 surface in `cli/lib/providers/media.ts` to: `"OpenRouter concurrent-call limit on <model>; try --concurrency 1 or switch model"`. Distinguish that from balance-class 402.
- Add the cap as a column in MODELS.md.

## Sources

- `workspace/projects/choose-your-guide-001/postmortem/03-cli-issues.md` — GAP-6
- `workspace/projects/tokyo-y2k-001/postmortem/03-cli-issues.md` — #5, workflow-fixes #5
- `workspace/projects/appstore-takeaminute-001/POSTMORTEM.md` — 73-job 403 wave
- `workspace/projects/analog-horror-fridge-001/POSTMORTEM.md` — 9/10 403 misread
- `workspace/projects/sotaocr-fb-001/postmortem/03-cli-issues.md` — #3 daemon idle
