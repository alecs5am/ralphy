# silent-square-site-ad

A silent 1:1 square Facebook / Meta feed ad, built entirely in HyperFrames from a brand's **own live-site assets** — no AI media generation, $0 model spend. Source: `workspace/projects/odindoma-fb-ad-001/` (a 21s square silent feed ad for a media brand, final `renders/odindoma-fb-21s-v11.mp4`).

**Kind:** vibe-style (the composition is brand-specific; the consumer hand-authors `index.html` following `composition.md`, or copies the source composition and swaps assets).
**Category:** b2b-saas (a marketing / service brand driving consideration).
**Format:** fb-creative.
**Aspect:** 1:1, 1080×1080.
**Length:** 15-21s (source: 21s).
**Audio:** silent by design (FB feed auto-mutes — never gate the message on sound).

## How to use

```bash
ralphy template use silent-square-site-ad \
  --project <new-project-id> \
  --brief "<brand + site URL + what to feature>"
```

Then run the build below. The render path is `ralphy render <id>` (HyperFrames `index.html`).

## Files

| File | What's in it |
|---|---|
| `composition.md` | The beat structure, the opacity-gated single-timeline pattern, and the brand-asset workflow. Read this first. |
| `motion-stack.md` | The GSAP / CSS motion patterns that worked (sticker pool, center-pivot pendulum, color split, pre-rasterized SVG) + the tooling. |

## Heavy assets

No assets are committed here — every remix pulls its OWN brand's live-site assets (mask SVGs, logo, hero, product images). That site-grounding step is the whole point of the format. If a brand's locked assets prove reusable across multiple ads, they live in `ralphy-assets/pool/<brand-slug>/`.

## Cost ballpark

**$0** — HyperFrames render is local; all assets are pulled from the live site or supplied by the user. No model calls. The only cost is iteration time.

## Key rules (each cost iterations in the source project)

1. **Pull the live site's REAL assets BEFORE inventing design DNA.** The source hand-drew "jelly blob" SVGs in v1; the live site already used CSS `mask-image: url(/stickers/<shape>.svg)` with canonical mask SVGs. Inspecting the DOM via Playwright took 5 minutes and saved ~2 iteration cycles. (See AGENTS.md invariant #15 — dispatch the site-grounding crawl.)
2. **Read the SITE's animation CSS — don't guess physics.** The source cycled through cart pivot positions until the user pasted the site's actual `@keyframes` (`transform-origin` unset = `50% 50%` center). Extract the exact keyframes + computed transform-origin of the original.
3. **Snapshot EVERY beat at its hero frame BEFORE rendering — every time.** The source rendered-then-reviewed for 5 iterations until the user demanded a self-review gate. Snapshot all hero frames, self-critique, fix, THEN render. Roughly 3 of 11 iterations would not have happened with this gate.
4. **Pre-rasterize any vector that scales >2x.** Inline SVG at `scale(3.5)` rasterized blurry; bake it to a 2-3x-target PNG via a Playwright headless screenshot and use `<img>`.
5. **Match user-supplied images to the actual card titles — don't map by filename.** A vaguely-named "image" file was wired under the wrong article title and read as nonsense; open every supplied image and confirm it matches before composing.
6. **When the user moves a focal element, check adjacent elements for ripple.** "Center the logo" implied the color-split plate should move too — three iterations of plate-position churn. Ask about adjacent elements before re-rendering.
7. **For an element that crops at the canvas edge during rotation, push it well OFF canvas at rest** — don't try to limit the rotation. A pendulum element at `bottom: -240px` swings ±15° without exposing a new crop edge.
8. **GSAP `fromTo` without an explicit `from x,y` makes the element travel through its previous position.** Always set explicit `from { x, y }` so a sticker doesn't transit across the canvas center over your text.
