# composition — brand-motion-ad

The default deliverable is a HyperFrames `index.html` rendered to a ~6s 4:3 (or 1:1) mp4. An optional `seedance-2.0` t2v pass renders a fully-animated alternate cut (see `prompt-cookbook.md`). This file captures the beat structure and the boil-layer technique, generalized off the source brand.

## Slots

```
{{brand_name}}     — the wordmark; the hand-correction beat swaps/adds one letter
{{site_url}}       — the live site to ground palette + webfonts against
{{palette}}        — base / ink / primary accent / highlight HEX (pull from the site)
{{display_font}}   — chunky rounded display font (wordmark + keyword)
{{body_font}}      — supporting sans (slogan + footer)
{{mascot_desc}}    — the ONE sustained drawn mascot
{{product_window}} — the product-shaped window the wipe shrinks into (phone/house/bottle/device)
{{slogan}}         — two-line slogan, ONE word highlighted
{{footer_url}}     — bottom-right footer URL
{{aspect}}         — 4:3 (matches the reference) or 1:1
```

## Beat structure (source: 6 beats over 6.0s)

```
A  0.0-1.0s   wordmark pops in centered (scale 0 -> 1.05 -> 1, elastic.out)
B  1.0-2.0s   hand-correction — one letter swaps/adds in the highlight color, tilted
C  2.0-2.7s   organic blob marker-wipe sweeps in from a corner, floods the canvas
D  2.7-3.5s   wipe shrinks back into {{product_window}}; first slogan word types in
E  3.5-5.0s   mascot pops inside the window (elastic), starts a 2-frame wave loop;
              slogan line 1 lands word-by-word, keyword in the highlight font
F  5.0-6.0s   slogan line 2 finishes; {{footer_url}} fades in; mascot keeps waving
```

The big reveal in beat D is that the green/accent flood the viewer just watched paint IS the product window, zoomed in — the camera pulls back to reveal the window. A clean `inset()` shape morph, not a circle iris. Adapt the beat count to the brand — the boil layer + elastic pop-ins + single-sustained-mascot are the discipline, not the literal beat list.

## The single-composition, opacity-gated pattern (load-bearing)

ONE composition, ONE paused GSAP timeline. Layer stack back-to-front: stage bg → wordmark → blob wipe → product window → mascot → slogan → footer URL. **No sub-compositions, no `data-composition-src`** (they do not time-gate reliably — multi-scene gating memory).

```html
<div id="root" data-composition-id="root" data-start="0" data-duration="6.0"
     data-width="1440" data-height="1080">
  <div class="deco-blob boil">...</div>
  <div class="house boil">...</div>     <!-- the product window -->
  <span class="wordmark">...</span>
  <!-- slogan words, footer ... -->
</div>
<script>
  window.__timelines = window.__timelines || {};
  window.__timelines["root"] = tl;   // paused GSAP timeline
</script>
```

## The boil layer (the secret sauce)

Every drawn shape (wordmark, product window, blob, footer) AND the mascot PNG is wrapped in a `.boil` parent — a 1-2px frame-by-frame vertex jitter that sells the frame-by-frame cel-animation feel instead of crisp vector:

```css
.boil > * { animation: boil 0.166s steps(1, end) infinite; }
@keyframes boil {
  0%   { transform: translate(0,0); }
  50%  { transform: translate(1px,-1px); }
  100% { transform: translate(-1px,1px); }
}
```

Source note: do NOT boil the wordmark layer if its letters already have a spring entrance — the boil-jitter on top makes the wordmark visibly judder. Boil the static drawn shapes; leave springing letters alone.

## Elastic pop-ins everywhere (never linear fades)

Every entrance overshoots: `scale 0 -> 1.08 -> 1`. The source uses `elastic.out(1, 0.6)` for the wordmark/mascot and `back.out(1.4..2)` for the letter correction + slogan-word stagger. A linear fade reads as "PowerPoint", not "hand-drawn".

```js
gsap.from('.wordmark', { scale: 0, duration: 0.5, ease: 'elastic.out(1, 0.6)' });
gsap.from('.word', { opacity: 0, y: 6, stagger: 0.13, ease: 'power2.out' }); // per-word slogan
```

## Single sustained mascot, no cuts

ONE drawn character, on screen the whole second half, with continuous micro-motion (a 2-frame wave loop + the boil jitter). No cuts to other shots. This is the picture-book register's anchor.

## Build workflow

```
1. Site-ground (10 min) — Playwright the brand site for its real palette +
   self-hosted webfonts. Override the reference's accent to the brand's own;
   pick the highlight color from ACROSS the color wheel so it never clashes.
   (AGENTS.md #15 — dispatch the site-grounding crawl.)
2. Reference motion-study — frame-step the reference at 0.1s; name each beat's
   primitive (pop / correction / wipe / flip / wave).
3. DESIGN.md + SCRIPT.md + STORYBOARD.md — beat-by-beat, with the mascot brief
   and the boil-layer audit. Get explicit "go".
4. Generate the ONE mascot (the only paid asset) — see model-stack.md.
5. Build index.html: single composition, boil layer on every drawn shape,
   elastic pop-ins, single sustained mascot. Snapshot per beat before the next.
6. QA & render — ralphy render <id>; extract verify frames and re-review.
   (Optional: fire the seedance alt-cut from prompt-cookbook.md.)
```

## Render

`ralphy render <id>` is the only path for the HyperFrames cut. The optional video alt-cut goes through `ralphy generate video` (see `prompt-cookbook.md`).
