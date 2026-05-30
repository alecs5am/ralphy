# Animated FB Showcase Reel (animated-fb-ad)

A single animated 1:1 square **silent motion piece** for Facebook / Meta / IG feed — a self-promo "showcase reel" for a tool that produces visual outputs, built entirely in HyperFrames as ONE opacity-gated GSAP timeline. The deliverable is one rendered mp4 (not a set of ad units). Derived from `ralphy-fb-ads-001` (a 30s square silent reel for the Ralphy CLI, final `renders/ralphy-fb-ads-001-v4.mp4`).

- **Kind:** vibe-style — the composition is brand-specific; hand-author `index.html` per `composition.md` (or copy the source and swap assets).
- **Category:** b2b-saas (a dev tool / SaaS driving consideration).
- **Format:** motion-design (one animated piece, not N static ad units). **Aspect:** 1:1, 1080×1080. **Length:** 15-30s. **Audio:** silent by design.

## How to use

```bash
ralphy template use animated-fb-ad --project <new-project-id> --brief "<brand + tagline + the output clips to showcase + integrations>"
```

Build per `composition.md`, then render with `ralphy render <id>` (HyperFrames `index.html`).

## Required inputs (slots)

| Slot | Required | What |
|---|---|---|
| `brand_name` | yes | The brand / wordmark. |
| `tagline` | yes | The hook + claim lines. |
| `accent_hex` | yes | Single brand accent hex (one hue; no neon glow). |
| `brand_fonts` | yes | Local woff2 brand fonts dropped into `assets/`. |
| `showcase_clips` | yes | The tool's OWN pre-rendered output clips (muted) for the wall (~9-13). |
| `cta` | yes | Wordmark + URL + button text for the CTA beat. |
| `featured_clip` | no | The single hero clip for the FEATURED beat. |
| `integration_logos` | no | Integration / model logo SVGs for the "plugs into your stack" marquee. |
| `duration_s` | no | 15-30s (TIME_SCALE stretches a 15s storyboard to 30s). |

## Files

| File | What's in it |
|---|---|
| `composition.md` | The 5-beat structure, the opacity-gated single-timeline pattern, the TIME_SCALE wrapper, the muted-video-wall workflow. Read this first. |
| `motion-stack.md` | The GSAP / CSS motion patterns that worked (video wall, logo marquee, TIME_SCALE, corner stamp) + tooling. |

## Cost ballpark

**$0** — HyperFrames render is local; the proof-wall clips are the tool's OWN pre-existing renders (reused muted), and fonts/logos/mascot are brand assets. No model calls. Only iteration time.

## Key rules

1. **Reuse the tool's OWN already-rendered outputs as the proof wall** (the whole concept; $0 new spend).
2. **One composition, opacity-gated beats — no sub-compositions** (they don't time-gate reliably).
3. **Drive every video layer MUTED — silent by design** (FB feed auto-mutes; clips ship as `-noaudio.mp4`).
4. **Use a TIME_SCALE wrapper to stretch the storyboard, not a rewrite** (author at 15s, ×2 → 30s).
5. **Snapshot every beat at its hero frame BEFORE rendering.**
6. **No box-shadow / neon glow per brand rules** — bg-tint steps + spacing; CTA "breath" is a subtle `scale(1.03)` yoyo.
7. **Single-accent lock** — one brand hue, plus a persistent corner stamp + brand fonts.

## Do not copy literally

The source is a self-promo reel for one CLI. Reuse the METHOD: a single opacity-gated GSAP composition, the HOOK → SHOWCASE-WALL → FEATURED → STACK → CTA beat arc, the tool's own renders as the muted proof wall, the integration-logo marquee, the TIME_SCALE pacing wrapper, silent-by-design, snapshot-before-render. Supply your own brand, tagline, clips, and logos.
