# `image fit` alpha-trim: use ImageMagick `-trim` over the cropdetect hack

> **Status:** done — 2026-06-10
> **Filed:** 2026-06-08
> **Folder:** issues
> **Severity:** low
> **Category:** cli

## Context

`ralphy image fit --trim-alpha` (and the `--telegram` preset) currently finds the tight alpha bounding box via `detectAlphaBbox()` in `cli/lib/image/cutout.ts`: it runs a two-pass ffmpeg `alphaextract,cropdetect=24:2:0` and regex-scrapes `crop=W:H:X:Y` out of stderr. `cropdetect` is designed to strip black letterbox bars from *video*; using it to find a PNG's transparent margin is a hack — it's sensitive to the threshold, can leave a 1-2px halo, and silently no-ops (returns `undefined`) when the parse misses. ImageMagick's `-trim +repage` does exactly this, natively and correctly, and is the canonical tool for it.

Depends on #101 (the ImageMagick runner + `hasMagick` fallback gate).

## What

In `fitImage()`, when `hasMagick()` is true, perform the alpha trim with ImageMagick instead of the cropdetect probe:

- `magick <in> -fuzz <N>% -trim +repage <scaled-out>` (or trim then scale in one invocation: `-trim +repage -resize <long>x<long>`). `-fuzz` absorbs near-transparent / anti-aliased edge pixels so the box isn't left 1px loose.
- Preserve current behavior: long-edge scale with Lanczos, `--telegram` → trim + 512 long-edge + PNG, alpha preserved on output.
- When `hasMagick()` is false, fall through to the **existing** ffmpeg `detectAlphaBbox` + scale path unchanged.

## Why it matters

- Correctness: removes a fragile stderr-regex code path that silently no-ops on parse miss; `-trim` is the right tool and gives a tight, repeatable box.
- Sticker quality: the Telegram preset depends on a clean tight crop; loose/haloed boxes waste the 512px budget and leave dead transparent margin.
- It's the smallest, lowest-risk consumer of #101 — a good first proof the runner + fallback gate work end-to-end.

## Notes

- Keep `detectAlphaBbox()` and the ffmpeg branch in place — it is the fallback, not dead code. Don't delete it.
- Watch the `-resize` long-edge expression: replicate the current `if(gt(iw,ih),long,-1)` semantics (scale the longer axis to `long`, preserve aspect). ImageMagick's `-resize <long>x<long>` (fit-inside) already does this — confirm against a wide and a tall fixture.
- Cross-links: #101 (runner), #037 (created the verb), #049 (utility-verb cluster this belongs to).

## Scope / acceptance

- `fitImage()` in `cli/lib/image/cutout.ts` branches on `hasMagick()`: ImageMagick `-fuzz -trim +repage` + resize when present, existing ffmpeg path when absent.
- A wide (landscape) and a tall (portrait) transparent-margin PNG fixture both trim to a box ≤ the cropdetect result and scale to the right long edge; `--telegram` still emits ≤512px PNG with alpha.
- Unit test asserts the ImageMagick arg array is well-formed (trim + repage + resize present) when the runner is stubbed-present, and that the ffmpeg fallback path is taken when stubbed-absent.
- `bun test` green; no Cyrillic; gen-log line records `provider: "imagemagick"` on the IM path.
- Sequence: after #101.
