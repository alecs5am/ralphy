# motion-stack — ship-announcement

The GSAP / CSS motion patterns that worked, lifted from `workspace/projects/openrouter-ship-001/` and generalized. $0 model spend — these are all local HyperFrames composition tricks.

## Tooling

| Stage | Tool | Note |
|---|---|---|
| Intro-primitive ID (if remixing) | ffmpeg frame-extract | 2-4 fps over the source's first 0.5s reveals typewriter vs slide vs fade |
| Composition | HyperFrames `index.html` | Single composition, variables-first, opacity-gated beats, GSAP timeline on `window.__timelines` |
| Comparison harness | ffmpeg hstack | `source_4s | mine_4s` + `source_7s | mine_7s`, rebuilt every render |
| Legibility gate | ffmpeg `scale=100:100 ... scale=400:400:flags=neighbor` | Quantitative contrast check |
| Render | `ralphy render <id>` | The source ran `bunx hyperframes render` directly (no wrapper then); use the verb |

No image / video / VO / music model calls. This format is deliberately AI-gen-free — the brand's wordmark + accent + copy carry it.

## Pattern: parallel typewriter via clip-path + steps()

`ease: "steps(N)"` with N = char count gives discrete-character reveal. clip-path is GPU-friendly. No DOM manipulation. Multiple text streams run in parallel at different per-char speeds (wordmark ~0.07s/char, body copy ~0.025s/char) so they finish staggered. The reverse-out is the same tween direction-flipped. (Full helper in `composition.md`.)

## Motion-pattern vocabulary (name it before tweening)

Declare which pattern each layer uses and write its one-line GSAP signature in a comment BEFORE writing motion code. Tuning params inside the wrong pattern is the #1 iteration sink.

| Pattern | What it is | GSAP signature |
|---|---|---|
| **Drift** | Continuous translate over duration | `tl.fromTo(el, {y:-H}, {y:0, duration:D, ease:"none"})` |
| **Discrete hop** | Snap from cell A to cell B in one tween | `tl.to(el, {x:CELL, duration:0.4, ease:"power2.inOut"})` |
| **Out-and-back** | Hop away + hop back later (net zero) | two `tl.to`s, second negates first |
| **Twinkle** | Yoyo opacity in place, no position change | `tl.fromTo(el, {opacity:1}, {opacity:0.2, repeat:N, yoyo:true})` |
| **Wave** | Many elements share one tick time | shared `t` across cubes — reads "synchronized", often too rigid |
| **Spread** | Many elements with unique times via hash | `t = base + (c*7 + r*13) % 23 * 0.1` — no synchrony |

The source background settled on **spread** after cycling drift → hop → twinkle → out-and-back. Pick once, up front.

## Pattern: probability-based placement reads as "radial", slice() reads as "striped"

Any "scattered" / "radial" / "asymmetric" placement uses per-cell probability. `pool.slice(N)` always reads as ordered rows.

```js
function placementProbability(c, r) {
  if (r <= 3)  return 0.32;                 // top dense
  if (r >= 10) return 0.42;                 // bottom dense
  if (c <= 1 || c >= COLS - 2) return 0.20; // mid edges
  return 0.05;                              // mid center rare
}
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < COLS; c++)
    if (rng() < placementProbability(c, r)) placeCube(c, r);
```

Reads as "corners full, middle empty" because density depends on `(c, r)`, not on iteration order — which keeps the cube field out of the central text band.

## Pattern: zone clamp + direction clamp keep bg motion text-safe

Two separate guardrails. Both are necessary; neither alone is sufficient.

```js
// Guardrail 1: zone clamp — a cube can never enter a different zone
if (zoneOf(nextRow) !== cube.zone) continue;

// Guardrail 2: direction clamp — a cube can never drift TOWARD center
if (cube.zone === "top"    && dy > 0)  continue; // top → never down
if (cube.zone === "bottom" && dy < 0)  continue; // bottom → never up
if (cube.zone === "mid"    && dy !== 0) continue; // mid → only horizontal
```

Zone clamp alone lets a cube hop one row into the text band over time; direction clamp alone lets a cube teleport via multiple hops. Together they make background motion provably text-safe.

## Pattern: dual-scale grid (structured + ambient)

Two moving element sets at different scales read better than one:

- Main grid: 12×12, cell 90px → cubes 70px, gap 20px. Carry the structure.
- Sub grid: 18×18, cell 60px → particles 4-25px, blink only. Carry the ambience.

One scale alone reads as either too rigid or too chaotic.

## The comparison harness + legibility gate (the two highest-leverage QA signals)

- **Comparison harness:** two fixed files updated after every render — `cmp_4s.png` (source 4s | mine 4s, hstacked) and `cmp_7s.png`. Read both before responding. This collapses contrast-pendulum iterations.
- **Legibility gate:** after every contrast change, `ffmpeg ... scale=100:100 ... scale=400:400:flags=neighbor`. If you can read the wordmark AND see the cube outlines at thumbnail scale, ship; otherwise adjust. Stop iterating when it passes — even if it "could be better".

## `autoAlpha` shorthand

`autoAlpha` combines `opacity` + `visibility:hidden` — cleaner than two separate sets for beat-gating.
