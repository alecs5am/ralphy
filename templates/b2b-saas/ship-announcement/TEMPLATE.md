# Ship Announcement Card (ship-announcement)

A square 1:1 typographic product-announcement motion card in the "Ship Week" developer-launch register — built entirely in HyperFrames, $0 model spend. Derived from `openrouter-ship-001` (an 8.5s 1:1 silent typographic announcement, final `render/final.mp4`).

- **Kind:** vibe-style — the layout is variables-first; set `data-composition-variables` per brand (or hand-author `index.html` per `composition.md`).
- **Category:** b2b-saas (a developer / SaaS product launch).
- **Format:** motion-design. **Aspect:** 1:1, 1080×1080. **Length:** 8-12s. **Audio:** silent by design.

## How to use

```bash
ralphy template use ship-announcement --project <new-project-id> --brief "<brand + accent + manifesto line + 5 feature rows + url>"
```

Build per `composition.md`, then render with `ralphy render <id>` (HyperFrames `index.html`).

## Required inputs (slots)

| Slot | Required | What |
|---|---|---|
| `wordmark` | yes | The brand / wordmark typed out in the hero beat. |
| `accent` | yes | Brand accent HEX (highlighted chip + tail). |
| `copy` | yes | The one-line manifesto under the wordmark. |
| `rows` | yes | JSON array of feature/model rows `{k, v}` (5 rows). |
| `url` | yes | End-slate URL + request line. |
| `finalRowIndex` | no | Index of the row that stays during the reverse-out beat. |
| `logo_asset` | no | Brand logo (pre-rasterized if it scales >2×); geometric shapes substitute. |
| `duration_s` | no | 8-12s. |

## Files

| File | What's in it |
|---|---|
| `composition.md` | Beat structure, the variables-first opacity-gated single-timeline pattern, the build workflow. Read this first. |
| `motion-stack.md` | The parallel-typewriter primitive, the cube-grid motion patterns (probability placement, zone/direction clamps), the comparison harness, and the legibility gate. |

## Cost ballpark

**$0** — HyperFrames render is local; the copy + accent come from the user. No model calls. Optional AI-gen variants (a brand logo via `gpt-5.4-image-2`, copy alternatives via `callLLM`) add ~$0.15-0.30.

## Key rules (each cost iterations in the source project)

1. **Identify the signature intro primitive from the source's first 0.5s BEFORE authoring.** Partial text = typewriter; partial position = slide; partial opacity (no edges moving) = fade. The source assumed fade, was actually parallel typewriter — that was a whole iteration.
2. **Pin a side-by-side comparison harness from iteration one** (`source_4s ↔ mine_4s` hstacked). Half the source session was contrast iterations for lack of it; ~14 of 23 versions collapse to ~5 with it.
3. **Declare a named motion pattern per layer** (drift / discrete-hop / out-and-back / twinkle / wave / spread) and write a one-line GSAP signature in a comment before tweening. Tuning params inside the wrong pattern burned cycles.
4. **Trust hand-measured specs verbatim** (px, hex, ASCII grid). Numeric specs converged in 1 cycle; feel-words ("more contrast") averaged 3 — ask for a number or screenshot first.
5. **Gate background contrast on a 100×100 downscale legibility test** ("can you read the wordmark AND see the cube outlines at thumbnail size?"). Stop iterating when it passes.
6. **Use per-cell probability for "scattered" placement**, never `pool.slice(N)` — slicing reads as visible rows/stripes.
7. **Two guardrails keep bg motion text-safe:** a zone clamp (a cube never leaves its zone) AND a direction clamp (a cube never drifts toward center). Both are needed.

## Do not copy literally

The source brand's wordmark, accent, rows, and logo are one-off. Reuse the METHOD: variables-first single composition, opacity-gated beats, the clip-path + `steps(N)` parallel-typewriter reveal, a sparse cube grid placed by probability and clamped out of the text band, the comparison harness, and the legibility gate. Silent by design.
