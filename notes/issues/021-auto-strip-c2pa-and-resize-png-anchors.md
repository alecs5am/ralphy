# i2v anchor pre-processing (C2PA strip + resize PNG→JPG) not in CLI

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

PNG anchors from `gpt-5.4-image-2` and gemini-banana carry C2PA `caBX` metadata blocks that break some i2v transports. They are also typically 1080×1920 PNGs (~700KB) when the downstream model expects ~720×1280 JPGs (~100KB). Every i2v project ends up running a manual `ffmpeg -map_metadata -1` loop and a `scale=720:1280` JPG conversion, dropping artifacts in ad-hoc `_video-anchors/` dirs outside the manifest.

## What

- `playdate-pixel-001`: 14-file `ffmpeg` strip loop run manually.
- `flipper-hypermotion-001`: 400 on i2v until C2PA stripped.
- `venom-bodywash-001`: ~10 manual `scale=720:1280` JPG conversions; ad-hoc `_video-anchors/` dir.

## Why it matters

Recurring tax on every i2v project. Hidden side-effect: artifacts outside the manifest don't get logged or versioned.

## Suggested fix

- Transparent pre-processing inside `cli/lib/providers/media.ts → submitVideoJob()`:
  - Strip C2PA / EXIF on every `--first-frame` / `--last-frame` PNG before base64-encoding.
  - Auto-convert oversized PNG → 720×1280 JPG if input dimensions exceed the model's natural anchor size.
  - Log the pre-processing step in the manifest entry so postmortems can see the lineage.

## Sources

- `workspace/projects/playdate-pixel-001/postmortem/03-cli-issues.md` — #2
- `workspace/projects/playdate-pixel-001/postmortem/02-lessons.md` — rule 8
- `workspace/projects/flipper-hypermotion-001/POSTMORTEM.md` — C2PA 400s
- `workspace/projects/venom-bodywash-001/postmortem/03-cli-issues.md` — #7
