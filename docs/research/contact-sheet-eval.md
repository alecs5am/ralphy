# Contact-sheet digest: quality vs cost eval (#557)

> **Status:** baseline measured 2026-10-28 on 18 labeled vertical videos.
> **Verb:** `ralphy ref digest <video|url>` (cli/commands/ref.ts, cli/lib/ref-digest.ts).
> **Dataset:** `cli/lib/eval/calibration-datasets/contact-sheet-digest.json` (labels, questions, variants; no media).
> **Raw results:** `docs/research/contact-sheet-eval-results.json` (per-variant answers, per-video scores, build stats).
> **Runner:** `bun run scripts/contact-sheet-eval.ts build|score`.

## Decision

The default is **fixed cadence, one frame every 0.5 s, 36 tiles per sheet, tile width fitted to the vision budget (126 px for 9:16 sources), at most 4 sheets.**

- It scored **0.94 overall**. A second blind analyzer on the same sheets scored 0.93.
- Cost:

  | Video length | Sheets | Image input tokens |
  |---|---|---|
  | 30 s | 2 | ~2,635 |
  | 60 s | 4 | ~5,269 |

- It sits at the knee of the Pareto front. Going from 1 s to 0.5 s cadence buys +0.03 overall for +2.4k tokens per minute. Going from 36 to 16 tiles buys another +0.02 for +6.5k tokens per minute.
- Building the bundle is local and free. It takes about 3.2 s of wall time per minute of footage (ffmpeg decode dominates). Each video in the set took 1.3 to 2.1 s.

Two other points on the front are worth knowing:

- **Budget preset:** `--every 1` gives 0.91 overall at about 1.5k tokens per 30 s. Use it for corpus-scale digests (#556).
- **Max-legibility preset:** `--tiles 16` gives 0.96 overall and **0.98** hook-text accuracy, against 0.88 for the default, at about 5.7k tokens per 30 s. Use it when on-screen text must be transcribed exactly.

## What the owner asked, answered

**The ask:** a frame every 0.25 s, with the worry that a sheet stops being readable after vision downscaling.

**The answer:** that worry holds, and it is about tile pixels, not cadence.

- **At 36 tiles per sheet:** 0.25 s cadence (A-f025) scored 0.91. That is no better than 0.5 s (0.94), at twice the tokens (10.3k against 5.3k per minute).
- **At 120 tiles per sheet (B-f025-t120):** packing 0.25 s into one sheet per 30 s keeps cut accuracy (cut F1 0.94), but hook-text accuracy collapses to **0.59**. Each tile is only 68 px wide.
- **Above 0.5 s,** extra cadence adds almost nothing on this question set. Shot boundaries that last under 0.5 s are rare in the set. The detector's `scenes.cuts` in `digest.json` already gives frame-exact hard cuts at no image cost.

## Cost model (the exact rule applied)

All token numbers come from `visionImageCost()` in `cli/lib/ref-digest.ts`. The function computes:

```text
scale  = min(1, 1568 / max(w, h), sqrt(1_150_000 / (w * h)))
w', h' = floor(w * scale), floor(h * scale)   (unchanged when scale = 1)
tokens = ceil(w' * h' / 750)
```

The rule has two caps: a long edge of at most 1568 px, and an area of at most about 1.15 MP. A sheet at the cap costs about 1,500 to 1,533 tokens.

Pixels above the cap are discarded by the API's own downscale. So the planner fits every sheet to the cap: the tile width is the largest even width whose sheet still fits. The column count is chosen to give each tile the most pixels, with ties going to fewer empty cells and then to the squarer sheet.

The cap values are knobs: `--max-sheet-pixels` and `--max-sheet-edge`. Raise them if the consuming model accepts larger images.

Wall time is measured as `cost.buildMs` in each `digest.json`. It covers ffprobe, the scene-score pass, frame extraction, compositing and encoding. The analyzer's reading time is not part of build time.

## Reference set and labels

There are 18 short vertical videos, 9 to 74 s long, about 600 s in total. They come from material already on the maintainer machine:

- 17 rendered finals and 1 downloaded reference.
- The content mixes AI presenter promos, split-screen interviews, carousel and slide explainers, a meme, game-style choose-your-path horror, and a talking head over slides.
- They are listed in the dataset, with each path relative to `.ralphy/workspaces/`.
- The videos were read only. Every eval artifact went to `.ralphy/cache/digest-eval/`.

Labels came from separate labeling sessions that never saw an analyzer answer. Their inputs were:

- **High-resolution label sheets:** one frame every 0.5 s at 20 tiles per sheet (172 px tiles), plus a 9-tile hook sheet covering 0 to 2 s (258 px tiles).
- **The ffmpeg scene-score detector:** hard cuts above 0.4 at full resolution, plus every weaker peak from 0.2 to 0.4 rendered as before/after frame pairs for a yes/no call.
- **Project metadata where it matched the render:** the CTA times of two compositions.

How each label type was built:

- **Cuts:** detector hard cuts, minus clear false positives such as flashes inside one shot, plus candidates the labeler confirmed, plus gradual boundaries (slides, pushes, crossfades) read from the dense sheets.
- **Text presence and shot class:** labeled on a 1 s grid at t = k + 0.5. Those times are tiles on the label sheets, so each grid label is a direct high-resolution observation.

The maintainer hand-checked a few labels against the label sheets:

- v07: five hard cuts.
- v10: three flash-bridged takes.
- v13: split-screen top-panel cuts at 0.43, 4.6 and 7.75 s.

Known label ambiguities, recorded per video in `labelNotes`:

- Whether a CG presenter who is not visibly speaking counts as talking_head or b_roll (v01, v02, v05, v12).
- Flash-bridged takes from one tripod position (v10, counted as cuts).
- Speaker jump cuts inside split-screen and green-screen layouts (not labeled).
- Game-style first-person footage where camera whips and cuts blur together (v14 to v16, v18).

## Question set and scoring

The analyzer answers each question from the sheets plus the tile-to-timestamp map. The detector's cut list and the transcript are deliberately withheld, so the score measures the visual channel only. Each question is scored from 0 to 1 (`cli/lib/eval/digest-eval.ts`):

| Key | Question | Score |
|---|---|---|
| cutF1 | shot boundary positions | greedy one-to-one match within ±0.5 s, F1 |
| cutCount | number of shot boundaries | 1 − \|pred − true\| / max(true, 1) |
| text | on-screen text present over time | accuracy on the 1 s grid |
| hookText | text visible in the first 2 s, transcribed | bag-of-words F1 (non-Latin tokens ignored on both sides) |
| hook | face, text overlay, cut in first 2 s, opening class | mean accuracy of the four facts |
| transitions | set of transition types used (hard_cut, dissolve_fade, motion) | Jaccard |
| shotClass | talking_head / b_roll / graphics over time | accuracy on the 1 s grid |
| cta | explicit call to action, start time | present plus start within 1.5 s = 1, within 3 s = 0.5 |

`overall` is the mean of the eight question means.

### Who answered

The analyzer is the agent's own vision. No provider vision call was made. Each variant was answered by a fresh, blind session of the same model:

- Each session read only that variant's packet and sheet copies, in a folder without `digest.json`.
- No session saw a label.
- No session saw more than one variant. Seeing a video at a finer cadence first cannot inflate a coarser variant's score.
- Two variants were split by video across two sessions, because a single session could not hold all of the sheet images.

One variant was answered twice by independent sessions (A-f050 and R-f050) to measure run-to-run noise. Overall scores differed by **0.01**, and no single question differed by more than **0.03**. Treat differences under about 0.03 as noise.

## Design (fractional, stated)

A full factorial (4 cadences × 4 tile counts × 3 widths × 18 videos) was not run.

**Phase A: cadence sweep at 36 tiles per sheet, fitted width.**

- Fixed cadence at 0.25, 0.5 and 1.0 s.
- Cut-adaptive with an in-shot cadence of 0.5 and 1.0 s.

**Phase B: tile sweep at the best Phase A cadence (0.5 s).**

- 16, 64 and 120 tiles per sheet.
- 0.25 s at 120 tiles: the owner's "0.25 s in one sheet" scenario.

**R: test-retest replicate of A-f050.**

**Widths were settled analytically,** with no answers collected. At 36 tiles the fitted width is 126 px. Requested widths of 160, 240 and 320 px all exceed it. With `--no-fit`, the API downscales those sheets to an effective 128 to 130 px per tile at the same ~1,533 tokens per sheet. That is the same information as the fitted sheet, at slightly more tokens. So the CLI clamps by default.

Widths below the fit (for example `--tile-width 96` at 36 tiles: 866 tokens per sheet, 96 px tiles) cost about the same per frame as more tiles per sheet at the fit (64 tiles, 94 px). Phase B therefore covers that axis.

Cut-adaptive rows were measured before one fix to the sampler. The first shot's first tile was then at 0.25 s rather than t = 0, which slightly handicaps the hook questions in A-ca050 and A-ca100. The fix has since landed: the first tile is now the first frame.

## Baseline table

These are means over 18 videos. tok/min is image input tokens per minute of footage. ms/min is build wall time per minute of footage.

| Variant | Cadence | Tiles | Tile px | cutF1 | cutCount | text | hookText | hook | transitions | shotClass | cta | **overall** | tok/min | ms/min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A-f025 | fixed 0.25 s | 36 | 126 | 0.94 | 0.90 | 0.98 | 0.90 | 0.94 | 0.82 | 0.85 | 0.94 | **0.91** | 10,327 | 3,249 |
| A-f050 | fixed 0.5 s | 36 | 126 | 0.95 | 0.92 | 0.98 | 0.88 | 0.97 | 0.84 | 0.93 | 1.00 | **0.94** | 5,305 | 3,227 |
| R-f050 (replicate) | fixed 0.5 s | 36 | 126 | 0.94 | 0.93 | 0.98 | 0.89 | 0.96 | 0.81 | 0.93 | 1.00 | **0.93** | 5,305 | 3,377 |
| A-f100 | fixed 1.0 s | 36 | 126 | 0.91 | 0.85 | 0.97 | 0.88 | 0.94 | 0.83 | 0.91 | 1.00 | **0.91** | 2,861 | 3,165 |
| A-ca050 | cut-adaptive 0.5 s | 36 | 126 | 0.94 | 0.90 | 0.98 | 0.83 | 0.93 | 0.81 | 0.85 | 1.00 | **0.91** | 5,468 | 3,173 |
| A-ca100 | cut-adaptive 1.0 s | 36 | 126 | 0.90 | 0.91 | 0.96 | 0.82 | 0.96 | 0.76 | 0.88 | 1.00 | **0.90** | 2,949 | 3,099 |
| B-f050-t16 | fixed 0.5 s | 16 | 194 | 0.91 | 0.87 | 0.99 | 0.98 | 0.99 | 0.93 | 0.98 | 1.00 | **0.96** | 11,767 | 3,422 |
| B-f050-t64 | fixed 0.5 s | 64 | 94 | 0.88 | 0.81 | 0.98 | 0.79 | 0.94 | 0.78 | 0.88 | 1.00 | **0.88** | 2,925 | 3,267 |
| B-f050-t120 | fixed 0.5 s | 120 | 68 | 0.94 | 0.90 | 0.94 | 0.54 | 0.92 | 0.81 | 0.84 | 0.89 | **0.85** | 1,626 | 3,406 |
| B-f025-t120 | fixed 0.25 s | 120 | 68 | 0.94 | 0.91 | 0.94 | 0.59 | 0.94 | 0.81 | 0.84 | 0.89 | **0.86** | 3,132 | 3,388 |

## Pareto front (overall vs tokens per minute)

| Variant | tok/min | Overall | On front |
|---|---|---|---|
| B-f050-t120 | 1,626 | 0.85 | yes |
| A-f100 | 2,861 | 0.91 | yes |
| B-f050-t64 | 2,925 | 0.88 | no (A-f100 is cheaper and better) |
| A-ca100 | 2,949 | 0.90 | no |
| B-f025-t120 | 3,132 | 0.86 | no |
| **A-f050 (default)** | 5,305 | 0.94 | **yes** |
| A-ca050 | 5,468 | 0.91 | no |
| A-f025 | 10,327 | 0.91 | no |
| B-f050-t16 | 11,767 | 0.96 | yes |

## Findings

1. **Tile pixels drive legibility.** Hook-text accuracy follows effective tile width almost monotonically:

   | Tile width | Hook-text accuracy |
   |---|---|
   | 68 px | 0.54 to 0.59 |
   | 94 px | 0.79 |
   | 126 px | 0.88 to 0.90 |
   | 194 px | 0.98 |

   Shot class and transition type follow the same direction.

2. **At equal tokens, fewer bigger tiles beat denser cadence.** A-f100 (1 s, 126 px) beats B-f050-t64 (0.5 s, 94 px) at the same ~2.9k tokens per minute: 0.91 against 0.88. Likewise A-f050 beats A-f025 while costing half as much.

3. **Cut localization barely depends on tile size.** Cut F1 stays between 0.88 and 0.95 across every layout. Cuts are visible even at 68 px. Cadence matters more, and only below 1 s. For hard cuts, the detector in `digest.json` (`scenes.cuts`) is the cheaper and frame-exact source. The sheets add gradual transitions the detector misses: slides, pushes and crossfades. Many of the generated videos here have such transitions and no detector peak at all.

4. **Cut-adaptive sampling did not beat fixed cadence** at the same cost (0.91 against 0.94, and 0.90 against 0.91). It spends tiles at shot starts, but the detector misses most gradual boundaries, so the extra tiles land in the wrong places. It stays available as `--mode cut-adaptive` for hard-cut-heavy material.

5. **CTA and on-screen text presence are near ceiling** on every layout except 120 tiles. End cards are big and readable.

## Tuning knobs

| Flag | Default | Effect |
|---|---|---|
| `--every <sec>` | 0.5 | Fixed cadence; in cut-adaptive mode, the in-shot cadence (fast shots use half of it). |
| `--mode fixed\|cut-adaptive` | fixed | Cut-adaptive gives one tile just after every detected cut, plus in-shot tiles, under the frame cap. |
| `--tiles <n>` | 36 | Tiles per sheet. Fewer tiles give bigger, more legible tiles and more tokens. 16 is the max-legibility preset. |
| `--tile-width <px>` | fitted | Explicit width. Values above the fit are clamped unless `--no-fit` is passed. |
| `--no-fit` | off | Keep oversized sheets, for human viewing. They cost the same tokens after the API downscale. |
| `--max-sheets <n>` | 4 | Cost ceiling: about 6.1k tokens. Frames beyond tiles × sheets are evenly subsampled. With the defaults, that means videos longer than 72 s. |
| `--max-frames <n>` | tiles × sheets | Explicit frame cap. |
| `--cut-threshold <score>` | 0.4 | Detector threshold for `scenes.cuts` and cut-adaptive sampling. |
| `--format jpg\|png` | jpg | Sheet encoding. Tokens depend on pixels, not bytes. |
| `--max-sheet-pixels`, `--max-sheet-edge` | 1,150,000 / 1568 | The vision budget the planner fits to. |
| `--transcript <path>` / `--transcribe` | sibling transcript, else skipped | The paid `--transcribe` path runs only on request. |
| `--metrics <json\|path>` | yt-dlp `meta.info.json` when present | Known metrics merged into `digest.json`. |

## Threats to validity

- **Same model family.** The labels and the answers came from the same model family. The labels used 2 to 2.5 times the tile pixels plus detector evidence. They are "silver" labels, not human labels, and are hand-checked only on a few videos.
- **Mostly own renders.** 17 of the 18 videos are this machine's own rendered finals. Several are cut from real footage (interviews, a meme), but only one is a downloaded creator reference. Real creator footage, with more hard cuts and handheld talking heads, may shift cut scores. The verb and the runner are ready to extend the set (#556).
- **Single run per variant.** Each variant was answered once, apart from the replicate. Differences under about 0.03 are within run-to-run noise.
- **Untested axes.** The audio and transcript channels were out of scope. Analyzer reading time was not measured.

## Reproduce

```bash
bun run scripts/contact-sheet-eval.ts build --variants A-f050,B-f050-t16   # writes .ralphy/cache/digest-eval/
# answer each blind/<variant>/packet.json in a fresh session -> blind/<variant>/answers.json
bun run scripts/contact-sheet-eval.ts score                                  # rewrites the results JSON + prints the table
```
