# `ralphy image convert` — format + resize + quality (still-image utility verb)

> **Status:** todo
> **Filed:** 2026-06-08
> **Folder:** issues
> **Severity:** low
> **Category:** cli

## Context

Format conversion + downscale on a still (PNG→JPG, WebP→PNG, "make this ≤720×1280 JPG ~100KB") is a recipe agents currently paste as raw ffmpeg or run by hand. #021 landed the *i2v-specific* version of this — transparent C2PA-strip + PNG→720×1280 JPG resize **inside `submitVideoJob()`** — but only on the anchor-upload path; there is no general user-facing verb for the same operation. `ralphy image` already hosts `cutout|fit|crunch`; `convert` is the obvious missing sibling and is a textbook ImageMagick one-liner.

Depends on #101 (runner + graceful fallback).

## What

Add `ralphy image convert`:

- `--in <path>` / `--out <path>` (output extension picks the target format).
- `--max <WxH>` — downscale to fit inside WxH preserving aspect; never upscale.
- `--quality <1-100>` — JPG/WebP quality (default ~85).
- `--strip` — drop EXIF / C2PA / colour-profile metadata (the #021 strip, now reusable for any still).
- `--project <id>` / `--note` — gen-log line like the sibling verbs.
- Implementation: when `hasMagick()`, `magick <in> [-strip] [-resize WxH>] -quality Q <out>` via the #101 runner. When ImageMagick is absent, fall back to an ffmpeg `scale=...:force_original_aspect_ratio=decrease` + `-map_metadata -1` + encode (the recipe #021 already proved in `media.ts`).

## Why it matters

- Removes a recurring raw-ffmpeg paste (AGENTS.md invariant #2 wants a verb, not ad-hoc shell) and gives the operation a logged, versioned, manifest-aware home.
- One general verb covers anchor prep, oversized-PNG shrink, format normalization for `--ref`, and metadata strip — all currently hand-rolled per project.
- `--strip` generalizes the #021 C2PA fix beyond the i2v upload path (e.g. stills published to the library).

## Notes

- Don't duplicate #021's transparent in-flight pre-processing — that stays in `submitVideoJob()`. This is the explicit, user-invokable verb; cross-link the two so the shared recipe is obvious. Consider (follow-up, not this issue) having `submitVideoJob` call the shared helper this verb uses.
- Default downscale must be fit-inside + no-upscale (`-resize 'WxH>'` in ImageMagick; `force_original_aspect_ratio=decrease` in ffmpeg).
- Cross-links: #101 (runner), #021 (done — the recipe precedent), #049 (utility-verb cluster), #037 (`image` command family).

## Scope / acceptance

- New `convert` subcommand registered in `cli/commands/image.ts`, backed by a function in `cli/lib/image/` (new `convert.ts` or extend `cutout.ts`).
- `--in/--out/--max/--quality/--strip/--project/--note` all wired; output format inferred from `--out` extension.
- Branches on `hasMagick()`: ImageMagick path when present, ffmpeg fallback when absent; both preserve aspect, never upscale, and strip metadata under `--strip`.
- Smoke test: `bunx tsx cli/index.ts image convert --in <fixture.png> --out <tmp.jpg> --max 720x1280` produces a JPG ≤ the requested box; `--help` block has a working example (`lint:help-examples` passes).
- Unit test: arg-array assertion for the IM path (stubbed-present) and the ffmpeg fallback (stubbed-absent); gen-log records `provider` correctly per path.
- `bun test` green; `bun run cli:surface:check` + `bun run docs:cli:check` refreshed (regenerate the auto-docs in the same commit); no Cyrillic.
- Sequence: after #101 (independent of #102).
