# composition — silent-square-site-ad

The deliverable is a HyperFrames `index.html` rendered to a 1080×1080 silent mp4. This file captures the beat structure and the brand-asset workflow, generalized off the source brand.

## Slots

```
{{brand_name}}       — the brand / wordmark
{{site_url}}         — the live site to ground against (asset + CSS source)
{{palette}}          — brand HEX tokens (pull from the site, not from memory)
{{logo_asset}}       — the brand logo (pulled from the site, pre-rasterized if it scales)
{{sticker_shapes}}   — the site's mask-image SVG shapes (circle/pill/razor/ellipse/...)
{{feature_cards}}    — the article / product cards to feature (image + title each)
{{pivot_element}}    — the hero object that swings (cart, bottle, device, ...)
{{manifesto_words}}  — 3 pop-color verbs filling the upper dead air
{{duration_s}}       — 15-21s
```

## Beat structure (source: 6 beats over 21s)

```
Beat 0  (0.0-0.3s)   topbar + {{brand_name}} anchor flash
Beat 1  (0.3-3s)     3-word color manifesto slides in (stagger), upper third
Beat 2  (3-7s)       sticker pool drops in (back.out overshoot), establishing
Beat 3  (7-12s)      feature card A (image + title)
Beat 4  (12-16s)     feature card B
Beat 5  (16-20s)     {{pivot_element}} center-pivot pendulum + logo
Beat 6  (20-21s)     half-canvas color split, logo as the bridge, CTA hold
```

Adapt the beat count to the brand's story — the structure is the discipline, not the literal beat list.

## The single-composition, opacity-gated pattern (load-bearing)

One composition, ONE timeline, beats are z-layered divs gated by `autoAlpha`. **No sub-compositions, no `data-composition-src`** — they do not time-gate reliably (per the multi-scene gating memory). The HyperFrames capture engine seeks deterministically across this.

```html
<div id="root" data-composition-id="root" data-width="1080" data-height="1080" data-start="0" data-duration="21">
  <div class="beat" id="b1">...</div>
  <div class="beat" id="b2">...</div>
</div>
```

```css
.beat { position: absolute; inset: 80px 0 0 0; opacity: 0; visibility: hidden; }
```

```js
const tl = gsap.timeline({ paused: true });
tl.set("#b1", { autoAlpha: 1, visibility: "visible" }, 0.3);
tl.set("#b1", { autoAlpha: 0 }, 2.55);
tl.set("#b2", { autoAlpha: 1, visibility: "visible" }, 2.5);
window.__timelines["root"] = tl;
```

## Brand-asset workflow (the cheap, on-brand path)

```
1. Capture & inspect (10 min)
   - Capture the site, then Playwright DOM-inspect {{site_url}}:
       * pull mask-image SVGs, logos, hero / product images
       * extract the exact animation @keyframes + computed transform-origin
   - Convert webp → png where needed.
   (Per AGENTS.md #15 — dispatch the site-grounding sub-agent crawl.)

2. Brief lock (5 min)
   - Confirm: format (1:1), {{duration_s}}, silent (yes), what to feature.
   - DESIGN.md from the site's real {{palette}}. Get explicit "go".

3. Storyboard (10 min)
   - STORYBOARD.md, beat-by-beat with sticker positions.
   - Cite the site animation CSS verbatim for any brand-DNA effect. Get "go".

4. Build (30-40 min)
   - index.html, single composition, opacity-gated beats.
   - Build beat 0 first, snapshot @ t=0.2, pass. Repeat per beat with a
     snapshot-before-next-beat gate. NO render until every beat is reviewed.

5. Asset upscale (5 min)
   - Pre-rasterize any vector scaling >2x to a hires PNG; swap inline SVG for <img>.

6. QA & render
   - ralphy render <id>  (HyperFrames → 1080x1080 mp4)
   - Extract verify frames from the actual mp4 and re-review.
```

## Render

`ralphy render <id>` is the only path. The source used `bunx hyperframes render` directly because no ralphy wrapper existed at the time (logged in that project's `postmortem/03-cli-issues.md`); use the ralphy verb.
