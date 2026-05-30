# composition — animated-fb-ad

The deliverable is a HyperFrames `index.html` rendered to a 1080×1080 silent mp4. This file captures the 5-beat structure, the single-timeline / opacity-gated pattern, the TIME_SCALE wrapper, and the muted-video-wall workflow — generalized off the source brand.

## Slots

```
{{brand_name}}         — the brand / wordmark
{{tagline}}            — the hook + claim lines ("ONE PROMPT." / "PRODUCTION READY.")
{{accent_hex}}         — single brand accent hex (one hue; never neon-glow)
{{brand_fonts}}        — local woff2 brand fonts (display/mono) in assets/
{{showcase_clips}}     — the tool's OWN pre-rendered output clips (muted,
                         -noaudio.mp4), tiled in the showcase wall (~9-13)
{{featured_clip}}      — the single hero clip for the FEATURED beat
{{integration_logos}}  — integration / model logo SVGs for the marquee
{{cta}}                — wordmark + URL + button text for the CTA beat
{{duration_s}}         — 15-30s (TIME_SCALE stretches a 15s storyboard to 30s)
```

## Beat structure (source: 5 beats, 15s authored → 30s rendered via TIME_SCALE 2×)

```
Beat 0  HOOK           mascot drops in (gentle nod), eyebrow + {{tagline}} line 1
Beat 1  SHOWCASE WALL  a tiled grid of ~9-13 muted {{showcase_clips}} — proof of range
Beat 2  FEATURED       one hero {{featured_clip}} large + the "one prompt" claim
Beat 3  STACK          a horizontal marquee of {{integration_logos}} — "plugs into your stack"
Beat 4  CTA            mascot + {{brand_name}} wordmark + URL + button (subtle breath)
```

Adapt the beat count to the brand's story — the HOOK → SHOWCASE-WALL → FEATURED → STACK → CTA arc is the discipline, not the literal beat list. A persistent corner stamp fades in from beat 1 and out before the CTA.

## The single-composition, opacity-gated pattern (load-bearing)

One composition, ONE paused GSAP timeline; beats are z-layered `.scene` divs gated by `opacity`. **No sub-compositions, no `data-composition-src`** — they do not time-gate reliably (per the multi-scene gating memory). The HyperFrames capture engine seeks deterministically across this single timeline (it also drives the muted `<video>` layers deterministically).

```html
<div data-composition-id="root" data-width="1080" data-height="1080" data-start="0" data-duration="30">
  <div class="scene" id="scene-0">...</div>
  <div class="scene" id="scene-1" data-layout-allow-overflow>...</div>
  <!-- ... -->
</div>
```

```css
.scene { position: absolute; inset: 0; opacity: 0; pointer-events: none; }
```

```js
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
tl.to("#scene-0", { opacity: 1, duration: 0.01 }, 0);
tl.to("#scene-0", { opacity: 0, duration: 0.35, ease: "power2.in" }, 3.35);
tl.to("#scene-1", { opacity: 1, duration: 0.3 }, 3.4);
// ...
window.__timelines["root"] = tl;
```

## The TIME_SCALE wrapper (author at 15s, render at 30s)

Author every beat at a tight 15s storyboard, then wrap the timeline methods so each authored position + `duration` is multiplied by a constant. Changing the pace becomes a one-constant edit instead of rewriting every tween.

```js
const TIME_SCALE = 2; // 15s storyboard -> 30s render
["to", "from", "fromTo", "set"].forEach((m) => {
  const orig = tl[m].bind(tl);
  tl[m] = function (...args) {
    const last = args.length - 1;
    if (typeof args[last] === "number") args[last] *= TIME_SCALE;          // position
    const scale = (v) => (v && typeof v.duration === "number" ? { ...v, duration: v.duration * TIME_SCALE } : v);
    if (m === "fromTo") { if (args[1]) args[1] = scale(args[1]); if (args[2]) args[2] = scale(args[2]); }
    else if (m === "to" || m === "from") { if (args[1]) args[1] = scale(args[1]); }
    return orig(...args);
  };
});
```

Set `data-duration` on the root composition to the SCALED total (30), and author all positions below in storyboard (15s) time.

## The muted-video-wall workflow (the $0 proof)

```
1. Gather the tool's OWN renders (5 min)
   - Pick ~9-13 of {{showcase_clips}} that show range. Strip audio:
       ffmpeg -i <clip>.mp4 -an -c:v copy video-src/<clip>-noaudio.mp4
   - These are EXISTING renders — no new model spend.

2. Brief lock (5 min)
   - Confirm: format (1:1), {{duration_s}}, silent (yes), the tagline + claim, CTA.
   - Drop {{brand_fonts}} (woff2) into assets/; declare them with @font-face.

3. Storyboard (10 min)
   - STORYBOARD.md beat-by-beat: which clips on the wall, the featured clip,
     which {{integration_logos}}, the CTA copy. Get explicit "go".

4. Build (30-45 min)
   - index.html, single composition, opacity-gated beats, TIME_SCALE wrapper.
   - <video ... muted> layers for the wall + featured clip.
   - Build beat 0 first, snapshot @ t=0.2, pass; repeat per beat with a
     snapshot-before-next-beat gate. NO render until every beat is reviewed.

5. QA & render
   - ralphy render <id>  (HyperFrames -> 1080x1080 silent mp4)
   - Extract verify frames from the actual mp4 and re-review.
```

## Render

`ralphy render <id>` is the only path — it expects `workspace/projects/<id>/index.html`. Direct `bunx hyperframes render` is reserved for debugging.
