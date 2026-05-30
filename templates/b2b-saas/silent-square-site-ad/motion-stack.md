# motion-stack — silent-square-site-ad

The GSAP / CSS motion patterns that worked, lifted from `workspace/projects/odindoma-fb-ad-001/` and generalized. $0 model spend — these are all local composition tricks.

## Tooling

| Stage | Tool | Note |
|---|---|---|
| Site asset + CSS extraction | Playwright (DOM inspect) | Pull mask-image SVGs, logos, hero images, exact `@keyframes` + computed `transform-origin` |
| Composition | HyperFrames `index.html` | Single composition, opacity-gated beats, GSAP timeline on `window.__timelines` |
| Vector → raster | Playwright headless screenshot | Bake any SVG that scales >2x to a 2-3x-target PNG |
| Render | `ralphy render <id>` | The source ran `bunx hyperframes render` directly (no ralphy wrapper then); use the verb |

No image / video / VO / music model calls. This format is deliberately AI-gen-free — the brand's own assets carry it.

## Pattern: sticker pool with CSS `mask-image` + `background-color`

The site's own technique — a colored div, masked by an SVG. No fake white outline; color from `background-color`, shape from `mask-image`. Infinitely color-swappable.

```css
.sticker { position: absolute; mask-repeat: no-repeat; mask-size: contain;
           -webkit-mask-repeat: no-repeat; -webkit-mask-size: contain; }
.sk-pill { width: 320px; height: 204px;
           mask-image: url("assets/sticker-pill.svg");
           -webkit-mask-image: url("assets/sticker-pill.svg"); }
```

```html
<div class="sticker sk-pill" id="st-1" style="background-color: var(--pink)"></div>
```

A persistent pool of ~12 sticker divs repositioned/rotated/recolored by GSAP at each beat boundary feels like "the same stickers carry through the story" and is faster to author than per-beat instances.

## Pattern: "dumped onto the canvas" drop

`back.out(1.7)` overshoot + random rotations + partial off-canvas clipping reads as a sticker pack just thrown into frame.

```js
tl.fromTo("#st-3",
  { x: -180, y: 800, scale: 0.5, rotation: r + 40, autoAlpha: 0 },
  { x: -180, y: 800, scale: 1, rotation: r, autoAlpha: 1, duration: 0.42, ease: "back.out(1.7)" }, t);
```

**Always set explicit `from x,y`.** Without it, `fromTo` reads the FROM x,y as "wherever it currently is" and the element travels through its previous position — a sticker can transit across canvas center over your text.

## Pattern: center-pivot pendulum

Default `transform-origin` for `transform: rotate()` is `50% 50%` (center). The site's `0% { rotate: -15deg } 50% { rotate: 15deg } 100% { rotate: -15deg }` translates to alternating GSAP rotations.

```css
#pivot { transform-origin: 50% 50%; }
```

```js
tl.to("#pivot", { rotation: 15,  duration: 2.0, ease: "sine.inOut" }, t);
tl.to("#pivot", { rotation: -15, duration: 2.0, ease: "sine.inOut" }, t + 2.0);
```

For an element that crops at the canvas edge while swinging, push it well off canvas at rest (`bottom: -240px`) rather than reducing the swing — the rotation arc keeps the off-canvas corners off-canvas, so no new crop edge appears.

## Pattern: half-canvas color split with the logo as bridge

Color plate top edge at canvas center (also the middle of the centered logo), extending to the bottom. The logo is bisected — top half on the light bg, bottom half on the color. Mirrors a site hero block where the wordmark sits on a colored band.

## Pattern: pre-rasterized SVG for crisp scale-up

Browsers often rasterize an inline SVG at intrinsic size then upscale the bitmap → blur at `scale(3.5)`. Bake to a hires PNG first:

```js
// Playwright: set the SVG into a sized viewport, screenshot with omitBackground
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.setContent(html /* svg sized to w x h */);
await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
```

Then `<img src="logo-hires.png">` instead of inline SVG → crisp at any GSAP scale-up.

## Pattern: 3-line color manifesto (dead-air filler)

Three pop-color verbs stacked in the upper third, each sliding in left-to-right with a 0.12s stagger (~0.84s total), fills the gap between the topbar and the main composition.

## `autoAlpha` shorthand

`autoAlpha` combines `opacity` + `visibility:hidden` — cleaner than two separate sets for beat-gating.
