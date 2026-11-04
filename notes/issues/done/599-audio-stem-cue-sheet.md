# 599 — `ralphy audio stem`: cue sheet → one pre-mixed SFX stem (+ two-pass loudnorm)

> **Status:** done — 2026-11-04 (`ralphy audio stem` builds one audio Artifact Revision from a cue sheet; `ralphy audio loudnorm` measures first by default)
> **Filed:** 2026-11-04
> **Folder:** issues/done
> **Severity:** medium
> **Category:** cli / audio recipes

## Context

`ralphy audio` covered `loudnorm`, `sidechain`, `mix-music` and `concat`, but nothing flattened a cue sheet of SFX one-shots into a single track. A sound-design pass with 83 and then 100 cues (2026-07-27) dropped to raw ffmpeg (`adelay` + `amix` + `alimiter`) in a throwaway script, which breaks AGENTS.md invariant 2 and leaves no Run in the store.

A stem is the correct shape, not N `<audio>` tags: HyperFrames cannot overlap clips on the same track, and short same-track media is unreliable during capture (#047). One pre-mixed stem on one track is also auditionable outside the render.

The verb was first written on 2026-07-27 against the pre-domain-store tree layout (branch `claude/gifted-grothendieck-902c21`, filed there as #554, a number `main` later used for another issue). This is the re-port onto the domain store.

## What

`ralphy audio stem --project <id> --cues <path.json> --out <file> [--duration <sec>] [--target-lufs -20] [--limit 0.89] [--no-loudnorm]`

- Cue sheet: a bare cue array or `{ fps, cues }`. Each cue has `at` (seconds) or `frame` (against the sheet `fps`), exactly one of `slot` (a Project audio Artifact, newest Revision from the store) or `path` (a file relative to the sheet), and an optional `gainDb`.
- Graph (`ffmpeg-recipes.ts` Recipe 17, `buildStemFilter`): per cue `aformat,adelay=<ms>|<ms>,volume=<g>dB` → `amix=inputs=N:normalize=0` (authored gains survive) → `alimiter=…:level=disabled` (auto-level would undo the gains) → `apad,atrim` for an exact duration → optional two-pass loudnorm from a lossless intermediate.
- Output: one audio Artifact Revision through `produceArtifactRevision`; a re-run of the same `--out` adds a Revision.
- Every unresolved `slot` / `path` is named in one error; nothing renders.

Two-pass loudnorm: `loudnorm()` measures with `print_format=json`, then applies `measured_I/TP/LRA/thresh` + `offset` with `linear=true`. Single-pass dynamic mode missed a -30 LUFS target at -27.2; two-pass landed at -30.2. `--single-pass` keeps the old filter; an `-inf` or unparseable measurement degrades to one pass. `sidechainCompress`'s inline loudnorm node is unchanged.

## Verification

- `tests/unit/ffmpeg-stem-599.test.ts`: cue resolution, filter shape, loudnorm measurement parser.
- `tests/integration/cli-audio-stem.test.ts`: real ffmpeg; 5 cues over 3 store slots and one file → duration pinned within 0.1 s, integrated loudness within 1 LU of the target, no leftover intermediate; re-run adds a Revision; unresolved sources fail and are named.
