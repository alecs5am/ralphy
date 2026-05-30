# Silent Square Site Ad (silent-square-site-ad)

A silent 1:1 square Facebook / Meta feed ad, built entirely in HyperFrames from a brand's **own live-site assets** — no AI media generation, $0 model spend. Derived from `odindoma-fb-ad-001` (a 21s square silent feed ad, final `renders/odindoma-fb-21s-v11.mp4`).

- **Kind:** vibe-style — the composition is brand-specific; hand-author `index.html` per `composition.md` (or copy the source and swap assets).
- **Category:** b2b-saas (a marketing / service brand driving consideration).
- **Format:** fb-creative. **Aspect:** 1:1, 1080×1080. **Length:** 15-21s. **Audio:** silent by design (FB feed auto-mutes).

## How to use

```bash
ralphy template use silent-square-site-ad --project <new-project-id> --brief "<brand + site URL + what to feature>"
```

Build per `composition.md`, then render with `ralphy render <id>` (HyperFrames `index.html`).

## Required inputs (slots)

| Slot | Required | What |
|---|---|---|
| `brand_name` | yes | The brand / wordmark. |
| `site_url` | yes | The live site to ground against (asset + CSS source). |
| `palette` | yes | Brand HEX tokens, pulled from the site (not from memory). |
| `logo_asset` | yes | Brand logo pulled from the site; pre-rasterized if it scales >2×. |
| `sticker_shapes` | no | The site's mask-image SVG shapes. |
| `feature_cards` | no | Article / product cards (image + title each). |
| `pivot_element` | no | The hero object that swings. |
| `manifesto_words` | no | Three pop-color verbs for the upper dead air. |
| `duration_s` | no | 15-21s. |

## Files

| File | What's in it |
|---|---|
| `composition.md` | Beat structure, the opacity-gated single-timeline pattern, the brand-asset workflow. Read this first. |
| `motion-stack.md` | GSAP / CSS motion patterns that worked (sticker pool, center-pivot pendulum, color split, pre-rasterized SVG) + tooling. |

## Cost ballpark

**$0** — HyperFrames render is local; all assets come from the live site or the user. No model calls. The only cost is iteration time.

## Key rules (each cost iterations in the source project)

1. **Pull the live site's REAL assets BEFORE inventing design DNA.** The source hand-drew blob SVGs in v1; the site already used `mask-image` SVGs. DOM-inspect via Playwright (AGENTS.md #15 — dispatch the site-grounding crawl).
2. **Read the SITE's animation CSS — don't guess physics.** Extract the exact `@keyframes` + computed `transform-origin` of the original.
3. **Snapshot EVERY beat at its hero frame BEFORE rendering — every time.** Self-critique, fix, then render. ~3 of 11 iterations would not have happened with this gate.
4. **Pre-rasterize any vector that scales >2×** (inline SVG at `scale(3.5)` rasterizes blurry).
5. **Match user-supplied images to the actual card titles — don't map by filename.**
6. **When the user moves a focal element, check adjacent elements for ripple** before re-rendering.
7. **For an element that crops while rotating, push it well OFF canvas at rest** (`bottom: -240px`), don't reduce the swing.
8. **GSAP `fromTo` without an explicit `from x,y` makes the element travel through its previous position** over your text.

## Do not copy literally

The source brand's assets and copy are one-off. Reuse the METHOD: site-grounding first, single composition with opacity-gated beats, mask-image sticker pool, center-pivot pendulum, half-canvas color split with the logo as bridge, snapshot-before-render discipline. Silent by design — never gate the message on audio.
