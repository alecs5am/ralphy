# animated-fb-ad

A single animated 1:1 square **silent motion piece** for Facebook / Meta / IG feed — a self-promo "showcase reel" for a tool that produces visual outputs, built entirely in HyperFrames as ONE opacity-gated GSAP timeline. The deliverable is one rendered mp4 (not a set of ad units). Source: `workspace/projects/ralphy-fb-ads-001/` (a 30s square silent reel for the Ralphy CLI, final `renders/ralphy-fb-ads-001-v4.mp4`).

**Kind:** vibe-style (the composition is brand-specific; hand-author `index.html` per `composition.md`, or copy the source composition and swap assets).
**Category:** b2b-saas (a dev tool / SaaS driving consideration).
**Format:** motion-design (one animated piece, not N static ad units).
**Aspect:** 1:1, 1080×1080.
**Length:** 15-30s (source: 30s, via a 2× TIME_SCALE on a 15s storyboard).
**Audio:** silent by design (FB feed auto-mutes — never gate the message on sound).

## How to use

```bash
ralphy template use animated-fb-ad \
  --project <new-project-id> \
  --brief "<brand + tagline + the output clips to showcase + integrations>"
```

Then build per `composition.md` and render with `ralphy render <id>` (HyperFrames `index.html`).

## Files

| File | What's in it |
|---|---|
| `composition.md` | The 5-beat structure, the opacity-gated single-timeline pattern, the TIME_SCALE wrapper, the muted-video-wall workflow. Read this first. |
| `motion-stack.md` | The GSAP / CSS motion patterns that worked (video wall, logo marquee, TIME_SCALE, corner stamp) + the tooling. |

## Heavy assets

No assets are committed here. Every remix supplies its OWN brand fonts (woff2), accent hex, mascot/wordmark, integration logo SVGs, and — the load-bearing part — the tool's OWN already-rendered output clips for the proof wall. Reusing existing renders is what makes this $0. If a brand's locked assets prove reusable, they live in `ralphy-assets/pool/<brand-slug>/`.

## Cost ballpark

**$0** — HyperFrames render is local; the proof-wall clips are the tool's OWN pre-existing renders (reused muted), and the fonts/logos/mascot are brand assets. No model calls. The only cost is iteration time.

## Key rules

1. **Reuse the tool's OWN already-rendered outputs as the proof wall.** The whole "showcase reel" concept is built on existing renders — tiling 9-13 of them muted is the proof of range, at $0 new spend. Do not generate new media for the wall.
2. **One composition, opacity-gated beats — no sub-compositions.** All five beats are z-layered `.scene` divs gated by `opacity` on a SINGLE paused GSAP timeline registered on `window.__timelines`. `data-composition-src` sub-comps do not time-gate reliably (per the multi-scene gating memory).
3. **Drive every video layer MUTED — silent by design.** FB / IG feed auto-mutes; the message must read with no sound. The showcase clips ship as `-noaudio.mp4`.
4. **Use a TIME_SCALE wrapper to stretch the storyboard, not a rewrite.** Author the beats at a tight 15s, then wrap `tl.to/from/fromTo/set` to multiply every position + duration by 2 → a 30s render with the same structure at half pacing. Changing the pace is a one-constant edit.
5. **Snapshot every beat at its hero frame BEFORE rendering.** Build beat 0, snapshot, pass; repeat per beat. No render until every beat is reviewed — the snapshot-before-render gate is what keeps the iteration count down.
6. **No box-shadow / neon glow per brand rules.** Separate elements with bg-tint steps + spacing, not glow. The CTA "breath" is a subtle `scale(1.03)` yoyo, not a shadow pulse.
7. **Single-accent lock.** One brand hue across the whole reel; a persistent corner stamp + brand fonts carry the identity.

## Do not copy literally

The source is a self-promo reel for one CLI (its mascot, its "ONE PROMPT" tagline, its specific renders). Reuse the METHOD: a single opacity-gated GSAP composition, the HOOK → SHOWCASE-WALL → FEATURED → STACK → CTA beat arc, the tool's own renders as the muted proof wall, the integration-logo marquee, the TIME_SCALE pacing wrapper, silent-by-design, snapshot-before-render. Supply your own brand, tagline, clips, and logos.
