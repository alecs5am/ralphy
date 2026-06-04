# MODELS.md drift from code; missing failure modes and routing nuance

> **Status:** done — 2026-05-29
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** docs

## Context

MODELS.md is the agent's first reference per AGENTS.md invariant #6, but it drifts from code and is missing recurrent provider failure-mode columns. Specific drifts caught in postmortems:

- `bytedance/seedance-2.0` priced at $0.10/sec in MODELS.md, actual $0.14 in `media.ts`.
- `gemini-3-pro-image-preview` skeleton-null transient not documented.
- `gemini-3.1-pro-preview` video-analysis 502 fallback chain not documented.
- ElevenLabs Music artist-name ToS not documented.
- Kling-vs-Veo `--audio` split (SPEECH vs AMBIENT) not documented.
- Routing for hyper-motion (explosions, runway-sprint, particle bursts) → seedance not documented; everything narrative routes to kling.
- `seedance-2.0` privacy filter blocks photoreal-human anchors — no warning in row.

## What

Multiple postmortems re-discover the same provider quirks: `kbo-broadcast-001`, `choose-your-guide-001`, `noski-people-001`, `flipper-hypermotion-001`, `skater-spiderverse-001`, `venom-bodywash-001`.

## Why it matters

Every session re-discovers the same provider knowledge by burning generations. The doc is supposed to short-circuit this and currently doesn't.

## Suggested fix

- Add per-model "Failure mode" column to MODELS.md (skeleton-null, ToS, privacy filter, concurrent cap).
- Add explicit routing rules:
  - "hyper-motion / explosions / runway-sprint / coin-arc / particle bursts → `bytedance/seedance-2.0`."
  - "kling-pro for talking-head, photoreal humans, slow narrative."
  - "seedance privacy filter blocks photoreal-human i2v anchors — use kling."
- Long-term: per-model JSON config under `cli/lib/models/` that drives BOTH `--help` text and MODELS.md (auto-generated). Add `bun run docs:sync` script + pre-commit hook failing if MODELS.md is older than `cli/lib/providers/media.ts`.

## Sources

- `workspace/projects/kbo-broadcast-001/postmortem/05-workflow-fixes.md` — #2, #3
- `workspace/projects/choose-your-guide-001/postmortem/05-workflow-fixes.md` — #4 (502 fallback)
- `workspace/projects/skater-spiderverse-001/postmortem/05-workflow-fixes.md` — #1, Finding A (pricing drift)
- `workspace/projects/flipper-hypermotion-001/POSTMORTEM.md` — hyper-motion routing missing
- `workspace/projects/venom-bodywash-001/postmortem/05-workflow-fixes.md` — seedance privacy filter
