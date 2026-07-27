# 554 — `ralphy audio stem`: cue sheet → one pre-mixed SFX stem (+ two-pass loudnorm)

> **Status:** done — 2026-07-27
> **Filed:** 2026-07-27
> **Folder:** issues/done
> **Severity:** medium
> **Category:** cli / audio recipes

## Context

`ralphy audio` covered `loudnorm`, `sidechain`, `mix-music`, `concat` — nothing
that flattens a cue sheet of SFX one-shots into a single track. The nightmaker
sound-design pass (2026-07-27) needed exactly that for 83 and then 100 cues, so
it dropped to raw ffmpeg (`adelay` + `amix` + `alimiter`) in a throwaway
`build-stem.ts` under the session scratchpad. That violates AGENTS.md invariant
#2 (`ralphy` is the only entry-point for ffmpeg recipes) and skips the gen-log.

A stem is the correct shape, not N `<audio>` tags: HyperFrames cannot overlap
clips on the same track (`.agents/skills/hyperframes/SKILL.md`) and short
same-track media is unreliable during capture (#047). One pre-mixed stem on one
track is also auditionable outside the render.

## What

`ralphy audio stem --project <id> --cues <path.json> --out <slot>
[--duration <sec>] [--target-lufs -20] [--limit 0.89] [--no-loudnorm]
[--force-overwrite]`

Cue sheet is a bare cue array or `{ fps, cues }`; each cue carries `at`
(seconds) **or** `frame` (resolved against the sheet `fps` — composition
timelines are authored in frames, which is where the accuracy comes from), a
`slot` resolved against `<project>/artifacts/sfx/<slot>.mp3`, and an optional
`gainDb`.

Recipe (`cli/lib/ffmpeg-recipes.ts`, Recipe 17): one
`aformat,adelay=<ms>|<ms>,volume=<g>dB` chain per cue → `amix=inputs=N:normalize=0`
(authored gains survive) → `alimiter=limit=<n>:level=disabled` (auto-level would
undo the cue gains) → `apad,atrim=0:<duration>` → the loudness pass. The mix
lands in a lossless temp so the loudness pass doesn't double-encode.

Also in scope (same file, flagged by the same session): `loudnorm()` now runs
**two passes** by default — measure with `print_format=json`, then apply the
measured `I`/`TP`/`LRA`/`thresh`/`offset` in linear mode. `--single-pass`
restores the old behaviour; a failed or `-inf` measurement degrades to single
pass rather than erroring.

## Why it matters

Single-pass loudnorm normalizes in dynamic mode and misses the target on
transient-dense material. Measured on the same sparse SFX stem asking for -30
LUFS: single-pass → **-27.2 LUFS**, two-pass → **-30.2 LUFS**. The originally
reported symptom (`--target -20` returning -16.0 on an SFX stem, -20.1 on a
smooth one) is the same effect.

## Scope / acceptance

- [x] `resolveCueSheet` (pure) validates + resolves frame→seconds and slot→path;
      empty sheet / missing time / `frame` without `fps` / missing slot all throw.
- [x] `buildStemFilter` (pure) — frame 160 @30fps → `adelay=5333|5333`; N cues →
      `amix=inputs=N`; empty list errors instead of a degenerate graph.
- [x] Append-only (#14): re-running a slot archives to `<slot>.v1.mp3` via
      `protectExistingAsset`, `--force-overwrite` opts out.
- [x] Gen-log line per ffmpeg pass (`ffmpeg/audio-stem`, `ffmpeg/loudnorm`),
      carrying the actual filtergraph.
- [x] `tests/unit/ffmpeg-stem-554.test.ts` (pure helpers + the loudnorm JSON
      parser), `tests/integration/cli-audio-stem.test.ts` (real ffmpeg: duration
      pinned, LUFS within 1 LU of target, versioning, missing-slot failure).
- [x] Docs: `docs/ffmpeg-recipes.md` Recipe 7, editor cookbook,
      `docs/playbooks/editor/audio-mixing.md` (stem-not-N-audio-tags rule).

## Notes

Deliberately out of scope: `sidechainCompress`'s inline `loudnorm` node stays
single-pass — fixing it means restructuring its filtergraph, and it normalizes a
VO+music mix (smooth material) where the error is small.
