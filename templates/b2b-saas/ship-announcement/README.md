# ship-announcement

A square 1:1 typographic product-announcement motion card in the "Ship Week" developer-launch register — built entirely in HyperFrames, $0 model spend. Source: `workspace/projects/openrouter-ship-001/` (an 8.5s 1:1 silent typographic announcement, final `render/final.mp4`).

**Kind:** vibe-style (the layout is variables-first; the consumer sets `data-composition-variables` per brand, or hand-authors `index.html` following `composition.md`).
**Category:** b2b-saas (a developer / SaaS product launch).
**Format:** motion-design.
**Aspect:** 1:1, 1080×1080.
**Length:** 8-12s (source: 8.5s).
**Audio:** silent by design.

## How to use

```bash
ralphy template use ship-announcement \
  --project <new-project-id> \
  --brief "<brand + accent + manifesto line + 5 feature rows + url>"
```

Then run the build in `composition.md`. The render path is `ralphy render <id>` (HyperFrames `index.html`).

## Files

| File | What's in it |
|---|---|
| `composition.md` | The beat structure, the variables-first opacity-gated single-timeline pattern, the parallel-typewriter primitive, and the build workflow. Read this first. |
| `motion-stack.md` | The motion-pattern vocabulary, probability placement, zone/direction clamps, dual-scale grid, the comparison harness, and the legibility gate. |

## Heavy assets

No assets are committed here — every remix supplies its OWN brand wordmark, accent HEX, manifesto, table rows, and (optional) logo. A brand logo can be AI-generated (`gpt-5.4-image-2`, ~$0.05) or user-supplied; pre-rasterize it to a hires PNG if it scales >2×.

## Cost ballpark

**$0** — HyperFrames render is local; copy + accent come from the user. No model calls. Optional AI-gen variants (logo, copy alternatives) add ~$0.15-0.30.

## Key rules (each cost iterations in the source project)

1. **Identify the signature intro primitive from the source's first 0.5s BEFORE authoring.** Partial text = typewriter; partial position = slide; partial opacity (no edges moving) = fade. The source assumed fade-in, the source was parallel typewriter — that was iteration v1 → v2.
2. **Pin a side-by-side comparison harness from iteration one.** Two fixed hstacked files (`source_4s ↔ mine_4s`, `source_7s ↔ mine_7s`) read before every response. ~14 of the source's 23 iterations were contrast-pendulum cycles that collapse to ~5 with this harness.
3. **Declare a named motion pattern per layer before tweening** (drift / hop / out-and-back / twinkle / wave / spread). The source cycled through five of them, one per iteration, because the pattern wasn't named up front.
4. **Trust hand-measured specs verbatim.** Numeric specs (px, hex, ASCII grid) converged in 1 cycle; feel-words ("more contrast", "livelier") averaged 3. Ask for a number or screenshot before committing to a feel-word.
5. **Gate background contrast on a 100×100 downscale legibility test.** The cleanest single QA signal of the session; should have been step 1, not step 12.
6. **Use per-cell probability for scattered placement** — `pool.slice(N)` always reads as visible rows/stripes.
7. **Zone clamp AND direction clamp keep background motion out of the text band.** Both are required.

## Do not copy literally

The source brand's wordmark, accent, rows, and logo are one-off. Reuse the METHOD: variables-first single composition, opacity-gated beats, the clip-path + `steps(N)` parallel-typewriter reveal, a sparse cube grid placed by probability and clamped out of the text band, the comparison harness, and the legibility gate. Silent by design.
