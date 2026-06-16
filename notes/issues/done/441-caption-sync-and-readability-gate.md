# Caption sync and readability gate

> **Status:** done — 2026-06-16
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

AGENTS.md already mandates scribe-first caption timing for aligned VO captions. The missing piece is a final gate that checks whether captions are actually readable, timed, not overcrowded, and not blocking important visual content.

## What

Add a caption sync/readability gate that consumes caption artifacts, word timings, and rendered video samples.

## Why it matters

Captions are central to short-form performance. Mis-timed or overcrowded captions make otherwise good videos feel cheap.

## Scope / acceptance

- Validate caption timing against word-level timestamps when available.
- Detect too many words per caption, too-short display durations, and unsafe screen placement.
- Sample rendered frames to check caption overlap with faces/products/CTAs.
- Integrate findings into native-video eval and repair plans.
- Add fixtures for on-time, late, overcrowded, and occluding captions.

## Notes

- Related: editor caption playbooks and #411 native video validation.
