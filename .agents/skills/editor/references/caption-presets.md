# Fonts, font pairs and caption presets

> #565. Read when a composition needs captions or on-screen type: which free font, which pair for the register, which caption preset, and how the caption gate judges it. English first; every font in a pair and every caption preset also renders Cyrillic.

## Fonts: only what the manifest licenses

`catalog/fonts.json` is the license manifest: 23 free fonts from `google/fonts` at a pinned commit, each with its license (OFL-1.1 or Apache-2.0, both fine for commercial video), the license file's sha256, every file's sha256 and size, the weight range, and glyph coverage tags measured from the file itself (`latin`, `latin-ext`, `cyrillic`, `cyrillic-ext`).

```bash
ralphy catalog fonts list                      # family, license, coverage, synced?
ralphy catalog fonts list --script cyrillic    # only fonts that cover Russian
ralphy catalog fonts sync                      # download into .ralphy/catalog/fonts/ and verify (once per machine)
ralphy catalog fonts lint                      # fails on any font-family without a recorded license
```

The binaries live under the gitignored data root (`.ralphy/catalog/fonts/<id>/`, about 9 MB), next to each font's `LICENSE.txt`. Copy the files a project uses into `<project>/fonts/` and declare them with `@font-face` in `index.html`; do not reference `.ralphy/catalog/` from a composition.

**Why declare the files yourself.** The pinned HyperFrames compiler (0.6.31) fetches Google Fonts on its own when a family has no `@font-face`, but its cache keys by weight and style only, so one unicode subset overwrites the others: the cached Anton 400 was a 5 KB non-Latin subset and renders fell back to system fonts. A declared `@font-face` makes the compiler skip its fetch. The catalog uses full TTFs from `google/fonts` (Latin and Cyrillic in one file) for exactly this reason, and `ralphy catalog build-previews` declares them automatically.

Adding a font: add the entry (id, family, designer, category, license id and path, files with their repository paths), run `ralphy catalog fonts sync --id <id> --write` to pin hashes and measure coverage, then `ralphy catalog fonts lint`. Never add a font whose license is not OFL or Apache; never ship a family that is only a system fallback (`Impact`, `Arial`) as the primary face.

## Font pairs by register

```bash
ralphy catalog fonts pairs                     # 10 pairs, with the scripts both faces cover
ralphy catalog fonts preview --pair editorial  # 9:16 specimen, English then Russian
```

| Pair | Register | Display + body |
|---|---|---|
| `bold-creator` | bold creator | Montserrat 900 caps + Inter 500 |
| `editorial` | editorial | Playfair Display 800 + Manrope 400 |
| `tech` | tech | JetBrains Mono 700 + IBM Plex Sans 400 |
| `playful` | playful | Rubik 800 + Nunito 600 |
| `luxury` | luxury | Cormorant Garamond 500 caps, tracked + Tenor Sans 400 |
| `horror` | horror | Rubik Wet Paint caps + Old Standard TT 400 |
| `news` | news and documentary | Oswald 700 caps + PT Sans 400 |
| `retro-arcade` | retro arcade | Press Start 2P + Exo 2 500 |
| `handwritten-warm` | handwritten warm | Caveat 700 + Rubik 400 |
| `modern-geometric` | modern geometric | Unbounded 700 + Golos Text 400 |

Both faces of every pair cover Latin and Cyrillic. Latin-only faces (Anton, Bebas Neue, Space Grotesk, Special Elite) are fine for English-only cuts; for Russian, swap to the pair's display face or Oswald.

## Caption presets

Twelve presets are catalog items of kind `caption` (`ralphy catalog list --kind caption`). Each is a HyperFrames fragment, `function catalog_<id>(tl, o)`, that takes the word-level timings (`o.words = [{ text, start, end }]`, composition seconds, from `ralphy generate captions`: AGENTS.md #16) and builds the chunks, entries and highlights on your timeline.

Insert one with `ralphy catalog use <preset> --project <id> --at <vo-start> --words artifacts/captions/<slot>.json` (#594, see [`motion-catalog.md`](./motion-catalog.md)): the word timings are seconds from the clip start, so the captions JSON of a voice-over that starts at `--at` fits as is.

| Words per screen | Presets |
|---|---|
| 1 | `cap-one-word-pop`, `cap-one-word-color-cycle`, `cap-one-word-slam`, `cap-one-word-arcade` |
| 3 | `cap-three-word-highlight`, `cap-three-word-box`, `cap-three-word-underline`, `cap-three-word-handwritten`, `cap-three-word-reveal` |
| 5 | `cap-five-word-karaoke`, `cap-five-word-band`, `cap-five-word-subtle` |

Chunks break at the preset's word count, at a pause over 0.3 s, or after clause punctuation, so a chunk never straddles a breath. Each chunk stays up for at least the preset's `minOnScreenMs` unless the next chunk starts sooner. A word longer than the preset's `maxCharsPerLine` shrinks the chunk's font proportionally (Russian words run long); check the result with `ralphy editor lint-safe-zones <id>`. The `caption` block in the manifest records words per screen, lines, characters per line, entry (`cut`, `pop`, `slide`, `fade`, `typewriter`), highlight (`none`, `color`, `box`, `underline`, `scale`), stroke, shadow, font and colours; `ralphy catalog show <id>` adds the computed contrast and the gate limits.

Colours: `text` and `highlight` are checked against `background` (the outline, shadow, band or box colour): text at 4.5:1 or better, highlight at 3:1, and for a box highlight the text on the box at 4.5:1. Recolour through the params and keep those ratios.

## Pacing defaults

These are defaults, not rules: the retention review (#571, [`retention-review.md`](../../scenarist/references/retention-review.md)) treats captions as usually helpful and their style as a tone decision.

- Hooks and fast talking heads: 1 word per screen, or 3 with an active-word highlight.
- Explainers and podcasts: 3 words per screen; the active word carries the emphasis.
- Storytelling and long voice-over: 5 words per screen, calmer entry (fade, slide), karaoke or no highlight.
- Premium, cinematic, documentary: 5 words, subtle or band; no pop.
- Keep captions inside the safe box (y 1100..1450 or 260..420; see [`vertical-layouts.md`](./vertical-layouts.md)) and run `ralphy editor lint-safe-zones <id>`.

Outcome data from #558 will replace these defaults per register once the ledger has enough posts.

## Gate

`ralphy eval captions <project> --caption-preset <id>` runs the caption gate (#441) with the preset's own limits: more words in a window than the preset shows is a warning (about twice as many fails), and the preset's `minOnScreenMs` replaces the generic 600 ms floor. Without the flag the gate keeps its defaults (7 / 11 words, 600 / 350 ms).
