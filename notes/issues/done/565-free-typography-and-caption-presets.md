# Free typography and caption presets (English first, Cyrillic supported)

> **Status:** done — 2026-10-30 (checkpoint: 23 licensed fonts with automatic coverage tags, 10 font pairs, 12 caption presets with English and Russian previews, unlicensed-font lint, preset limits in the caption gate; gaps listed below)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** feature / craft library

## Context

The owner wants font pairs, fonts, colors and caption presets (1, 3 or 5 words on screen at a time), using anything free from the internet or GitHub. English is the focus; Cyrillic must work. Pacing is the agent's call, grounded in metrics.

## What

- Harvest free fonts (Google Fonts, OFL / Apache fonts on GitHub). Record license per font; keep only licenses that allow commercial video use.
- Check glyph coverage for Latin and Cyrillic automatically; tag each font.
- Curated font pairs by register (bold creator, editorial, tech, playful, luxury, horror).
- Caption presets as HyperFrames components: words-per-screen 1 / 3 / 5, active-word highlight, pop or slide entry, stroke and shadow, color schemes with contrast checks.
- Default pacing rules from the course material (#571) and later from #558 ledger outcomes.
- Previews in the #563 catalog.

## Scope / acceptance

- Fonts stored as shared assets with a license manifest; a lint fails on a font without a recorded license.
- At least 12 caption presets and 10 font pairs, each previewed in English and Russian.
- The caption gate (#441) reads preset metadata for readability limits.

## Notes

- Sequence after #563.

## Checkpoint (2026-10-30)

**Landed.**

- **Font library with a license manifest.** `catalog/fonts.json` (repo-tracked) lists 23 free fonts from `google/fonts` pinned at commit `6157dfaa640ca5738b4d1a7070fe389c3036d7fc` (2026-10-29): 22 OFL-1.1 and 1 Apache-2.0 (Special Elite). Each entry records the license id and license-file path with its sha256 (verified by `catalog fonts sync`, which checks the license text for the OFL / Apache marker before accepting it), `commercialVideo: true`, every file's repository path, sha256, size and weight range (read from `fvar` / `OS/2`), and coverage. Binaries (full TTFs, about 9.4 MB) and a `LICENSE.txt` per font live under the gitignored `.ralphy/catalog/fonts/<id>/`, like the SFX pack.
- **Automatic glyph coverage.** `cli/lib/catalog/fonts.ts` parses each file's `cmap` (formats 4 and 12) and tags `latin`, `latin-ext`, `cyrillic`, `cyrillic-ext` from fixed code-point sets; a font's tags are the intersection over its files. Result: 19 fonts cover all four; Anton, Space Grotesk, Bebas Neue and Special Elite are Latin only.
- **10 font pairs by register** (`pairs` in `catalog/fonts.json`): bold creator, editorial, tech, playful, luxury, horror, news and documentary, retro arcade, handwritten warm, modern geometric. Both faces of every pair cover Latin and Cyrillic. Specimen previews (English, then Russian) under `.ralphy/catalog/previews/fonts/<pair>.mp4`.
- **12 caption presets** as catalog items of kind `caption` (`catalog/items/caption/`): `cap-one-word-pop`, `cap-one-word-color-cycle`, `cap-one-word-slam`, `cap-one-word-arcade`, `cap-three-word-highlight`, `cap-three-word-box`, `cap-three-word-underline`, `cap-three-word-handwritten`, `cap-three-word-reveal`, `cap-five-word-karaoke`, `cap-five-word-band`, `cap-five-word-subtle`. Each takes word-level timings (`o.words`), chunks at 1 / 3 / 5 words or at a pause / clause break, and has pop, slide, fade, cut or word-reveal entry, colour / box / underline / scale highlight, stroke and shadow. A chunk whose longest word exceeds the preset's characters per line shrinks proportionally (character count, not measurement, so there is no font-load race); every preset build passes `ralphy editor lint-safe-zones` at 60 samples in English and Russian. The `caption` metadata block (words per screen, lines, characters per line, minimum on-screen time, entry, highlight, stroke, shadow, font id, colours) is schema-checked; `captionContrast` checks text against the outline / band colour at 4.5:1, highlight at 3:1, text on a box highlight at 4.5:1, and every preset passes.
- **English and Russian previews.** Each caption preview plays the English sample, then the Russian one. The Russian sample text lives in `cli/lib/catalog/samples.ts` as Unicode escapes, so no Cyrillic lands in committed files; the rendered previews and builds (gitignored) show real Cyrillic.
- **The #563 font gap.** `catalog build-previews` now declares the vendored TTFs with `@font-face` and copies them into each build's `fonts/`, so the pinned HyperFrames compiler (0.6.31, which caches Google Fonts by weight and style only and kept a non-Latin subset for Anton) skips its own fetch. All layout, caption and camera previews rendered with the real faces. Documented in `.agents/skills/editor/references/caption-presets.md` and `cli/lib/catalog/fonts.ts`. The 35 #563 previews were not re-rendered (new items only); `ralphy catalog build-previews --force` picks up the fix.
- **Unlicensed-font lint.** `bun run lint:fonts` (`scripts/lint-font-licenses.ts`, wired into `bun run lint` and CI) and `ralphy catalog fonts lint` fail when a font lacks an allowed, pinned license, a file lacks its sha256, coverage is unmeasured, or any catalog fragment (or the preview harness) names a `font-family` that is not in the manifest; system faces such as Impact pass only as later fallbacks.
- **Verbs.** `ralphy catalog fonts list [--script <tag>] | pairs [--script <tag>] | sync [--id ...] [--write] | lint | preview [--pair ...]`; `ralphy catalog show <caption-id>` adds the computed contrast and gate limits.
- **Caption gate reads preset metadata.** `checkCaptions` takes `limits` (`CaptionReadabilityLimits`); `captionLimitsFromPreset` maps a preset to them (overcrowded above its words per screen, fail at about twice that, its own on-screen floor); `ralphy eval captions <project> --caption-preset <id>` applies them and the report records `limits`.
- **Catalog page** gained a font-pairs section (playable specimens, license and coverage table) and kind notes on caption, layout and camera cards.
- **Docs and tests.** `.agents/skills/editor/references/caption-presets.md` (fonts, pairs, presets, pacing defaults reconciled with the #571 retention review, gate) linked from the editor skill, `captions.md` and `motion-catalog.md`. `tests/unit/catalog-fonts.test.ts` (manifest, synthetic-TTF cmap parsing, lint cases, `@font-face` wiring, escaped samples), `tests/unit/catalog-captions.test.ts` (preset set, contrast, fonts, gate limits end to end), verb shapes for the new verbs.

## Gaps after the checkpoint

- **Pacing from outcomes.** Pacing defaults are craft defaults reconciled with #571; nothing reads #558 ledger outcomes yet (no data).
- **Preset choice is not recorded.** The gate applies preset limits only when the flag names the preset; a project does not record which preset its captions use, so `eval` cannot pick it up automatically.
- **Distribution.** Font binaries exist only on this machine; publish them to the `ralphy-assets` companion with the same sha256 pins so a fresh clone and the compiled binary get them (shared with the #563 SFX gap).
- **Faces.** Only upright faces except Playfair Display italic; files are TTF (no woff2 conversion); coverage sets stop at Latin and Cyrillic (no Greek, Vietnamese, Arabic, CJK).
- **Contrast on real footage.** The check compares declared colours; it does not sample the footage behind an outline-only preset. The band and box presets are the safe choice on bright, busy plates.
- **Slam emphasis.** `cap-one-word-slam` colours words of six letters or more as a demo heuristic; real use should mark emphasis words in the word list.
- **Splice verb.** No `ralphy catalog use <preset> --project <id>` that wires a preset, its font files and the project's `captions.json` into `index.html` (shared #563 gap).
- **#563 previews.** Re-render the 35 transition and element previews with `--force` so they use the vendored fonts.
- **CLI surface doc.** `docs/cli-surface.generated.md` not regenerated (owner instruction).
