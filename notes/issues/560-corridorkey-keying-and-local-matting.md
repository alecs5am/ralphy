# Green-screen keying with CorridorKey and local matting for text-behind-subject

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** research + feature / vfx

## Context

Two owner asks share a technique: green-screen characters (generate or film on green, key, composite) and cutting a subject out of footage so text can sit behind it. The owner points at https://github.com/nikopueringer/CorridorKey2.0 for keying. Locally we already have u2net background removal via the `hyperframes-media` skill; it was never compared for video edge quality.

## What

1. Evaluate CorridorKey 2.0 on this machine class (Apple Silicon): install path, speed per second of 1080x1920 footage, edge quality on hair, motion blur and spill; license terms.
2. Compare against the local alternatives for non-green footage (u2net, a local video-matting model) for the text-behind-subject case.
3. Ship:
   - `ralphy matte key <video>` (green screen, CorridorKey) and `ralphy matte subject <video>` (no green screen) writing alpha video (ProRes 4444 or WebM VP9 alpha) into `artifacts/videos/`.
   - A HyperFrames layering recipe: background, text, keyed subject on top.
   - A green-screen character recipe: prompt rules to generate a character on flat chroma green (no green spill on the subject, even light), then key with CorridorKey.

## Scope / acceptance

- `docs/research/keying-and-matting.md` with the comparison table and sample frames.
- Both verbs work offline, append-only (new versions, never overwrite).
- A demo unit: text behind a moving subject, and a keyed generated character over a background.
- `ralphy doctor` reports whether the keyer is installed.

## Notes

- Free path only; no provider matting unless local quality fails and the owner agrees.
- Related: #559, `analog-horror-psa` chroma-key rules.
