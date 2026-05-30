# motion-stack — animated-fb-ad

The GSAP / CSS motion patterns that worked, lifted from `workspace/projects/ralphy-fb-ads-001/` and generalized. $0 model spend — all local composition tricks over the tool's own pre-existing renders.

## Tooling

| Stage | Tool | Note |
|---|---|---|
| Strip audio from showcase clips | `ffmpeg -i clip.mp4 -an -c:v copy clip-noaudio.mp4` | Silent by design; reuse the tool's OWN renders |
| Composition | HyperFrames `index.html` | Single composition, opacity-gated beats, GSAP timeline on `window.__timelines` |
| Brand fonts | `@font-face` woff2 in `assets/` | Display + mono; `font-display: block` so they're present at capture |
| Integration logos | inline SVG / `<img>` per logo | The "plugs into your stack" marquee |
| Render | `ralphy render <id>` | The 1080×1080 silent mp4 |

No image / video / VO / music model calls. The format is deliberately AI-gen-free — the tool's existing renders carry the proof.

## Pattern: opacity-gated scene beats on one timeline

Each beat is a full-bleed `.scene` div at `opacity: 0`. The timeline flips opacity at the beat boundaries — one quick fade in, hold, one fade out — so only one beat is visible at a time. No sub-compositions.

```js
tl.to("#scene-1", { opacity: 1, duration: 0.3, ease: "power2.out" }, 3.4);
tl.to("#scene-1", { opacity: 0, duration: 0.3, ease: "power2.in" }, 6.4);
```

## Pattern: muted video wall (the proof of range)

Tile ~9-13 of the tool's own renders into a grid; each is a `<video muted>` layer. The wall is the single most persuasive beat — it shows breadth at a glance — and costs $0 because the clips already exist.

```html
<video id="wall-vid-0" src="video-src/<output>-noaudio.mp4" muted playsinline></video>
```

Strip audio up front (`ffmpeg -an`) so nothing competes with the silent-by-design rule. HyperFrames drives the `<video>` layers deterministically across the timeline seek.

## Pattern: TIME_SCALE wrapper (one-constant pacing)

Wrap `tl.to/from/fromTo/set` to multiply each position + `duration` by a constant, so a tight 15s storyboard renders as a 30s piece without touching any authored number. See `composition.md` for the full wrapper; the win is that re-pacing is a single edit.

## Pattern: logo marquee ("plugs into your stack")

A horizontal row of integration logos slid across the canvas with a linear (`ease: "none"`) tween over the beat's duration. Two staggered rows scrolling opposite directions read as "a whole ecosystem".

```js
tl.fromTo("#s3-row1", { x: 200 },   { x: -1700, duration: 3.8, ease: "none" }, 9.0);
tl.fromTo("#s3-row2", { x: -1700 }, { x: 200,   duration: 3.8, ease: "none" }, 9.0);
```

## Pattern: mascot drop + gentle nod (editorial, no overshoot)

The mascot enters with a soft `power3.out` (NOT a `back.out` overshoot — overshoot reads playful, this brand is editorial), then a small yoyo nod loop to feel alive without distracting.

```js
tl.fromTo("#s0-mascot", { opacity: 0, y: -30, rotation: -6 },
                        { opacity: 1, y: 0, rotation: 0, duration: 0.55, ease: "power3.out" }, 0.1);
tl.to("#s0-mascot",     { rotation: 4, duration: 1.0, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0.7);
```

## Pattern: persistent corner stamp

A small monospace label (no neon) fades in from beat 1 and out before the CTA — it carries the brand identity through the body beats without competing with the content.

```js
tl.to("#corner-stamp", { opacity: 1, duration: 0.4, ease: "power2.out" }, 3.65);
tl.to("#corner-stamp", { opacity: 0, duration: 0.3, ease: "power2.in" }, 12.5);
```

## Pattern: CTA "breath" (no box-shadow)

Per brand rules (no visible borders / no neon glow), the CTA pulse is a subtle `scale(1.03)` yoyo, NOT a shadow or glow pulse.

```js
tl.to("#s4-cta", { scale: 1.03, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1 }, 14.0);
```

## Background layering

Three stacked low-alpha layers (warm radial blobs in opposite corners + a fine Swiss grid + a subtle dot grid) plus a thin bottom scanline strip with monospace coordinates — depth without clutter, all on the single accent + ink palette.
