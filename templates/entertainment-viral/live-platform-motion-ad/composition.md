# composition — live-platform-motion-ad

The deliverable is a HyperFrames `index.html` rendered to a 1080×1080 silent mp4. This file captures the 5-beat structure and the platform-asset workflow, generalized off the source platform.

## Slots

```
{{brand_name}}    — the platform / wordmark
{{site_url}}      — the platform site to ground tokens + fonts against
{{brand_svg}}     — the official multi-layer brand glyph SVG
{{palette}}       — brand HEX (primary, void bg, surface tiers, LIVE-red)
{{clip_sources}}  — N real platform clip URLs to pull for the stream-wall tiles
{{hooks}}         — per-beat all-caps caption hooks (display font), >=1.6s each
{{categories}}    — category pills for the marquee beat
{{cta}}           — end-slate CTA line + URL
{{duration_s}}    — default 15s
```

## Beat structure (source: 5 scenes over 15s)

```
Scene 0  (0.0-2.5s)   glitch-reveal {{brand_name}} wordmark on the void bg; LIVE dot pulses
Scene 1  (2.5-6.0s)   6-tile stream WALL flies in (real <video> clips); LIVE pills pop;
                      viewer counts tick up from 0
Scene 2  (6.0-9.5s)   one tile expands to full-bleed; faux chat-firehose scrolls the rail;
                      viewer count climbs
Scene 3  (9.5-12.5s)  category-pill marquee sweeps L->R in 2 staggered rows on a brand-gradient wash
Scene 4  (12.5-15.0s) wordmark slams center; CTA pill below; LIVE dot blinks; static hold to end
```

Each `{{hooks}}` caption is the narration (the ad is silent). Adapt the beat count to the platform's story — the real-`<video>`-tiles rule, the multi-layer brand SVG, and the pre-rolled motion are the discipline.

## The single-composition, opacity-gated scene pattern (load-bearing)

ONE composition, ONE paused GSAP timeline. Scenes are z-stacked absolutely-positioned divs gated by opacity. **No sub-compositions, no `data-composition-src`** — they do not time-gate reliably in HyperFrames 0.6.31 (multi-scene gating memory, confirmed again here).

```html
<div data-composition-id="root" data-width="1080" data-height="1080" data-start="0" data-duration="15">
  <div class="scene" id="scene-0">...</div>
  <div class="scene" id="scene-1" data-layout-allow-overflow>...</div>
  <!-- scene-2 ... scene-4 -->
</div>
<script>
  window.__timelines = window.__timelines || {};
  window.__timelines["root"] = tl;   // paused GSAP timeline, opacity-gates each scene
</script>
```

Mark scenes whose entrance animation overflows the frame with `data-layout-allow-overflow` so `hyperframes inspect` passes.

## Real `<video>` stream tiles (the register-defining detail)

A live platform demoed with static `<img>` thumbnails reads as an AI mockup. Real muted clips read as the actual product. HyperFrames handles multiple `<video>` tags per composition:

```html
<video id="tile-vid-0" src="video-src/clip-0-noaudio.mp4"
       data-start="2.85" data-duration="3.0" data-media-start="4" data-track-index="2"
       data-volume="0" muted playsinline></video>
```

Pull the clips fresh (URLs decay fast on live platforms) and strip audio at preprocess.

## The brand glyph is a MULTI-LAYER SVG (never reconstruct from memory)

The source burned 3 iterations because it guessed the glyph. The real glyph is three layers — copy the STRUCTURE, not one path:

```html
<svg viewBox="0 0 W H">
  <polygon class="glyph-fill" fill="#ffffff" points="..."/>          <!-- white interior, drawn first -->
  <path class="glyph-body" fill-rule="evenodd" d="..."/>             <!-- brand-color compound frame w/ cutout -->
  <rect class="eye" .../><rect class="eye" .../>                     <!-- eye bars -->
</svg>
```

Ask the user for the official SVG before authoring Beat 0.

## Chat-firehose scroll math

Each new message lands at the visible bottom while older ones drift up:

```
initialY = listHeight;
finalY   = -10;
duration = stagger * line_count;
```

Render chat lines as `username: message` (Inter 600 13px, username in a vivid brand-accent color), not emoji bubbles.

## Build workflow

```
1. Pre-flight (<=2 turns) — confirm aspect (1:1), duration (15s), audio (silent).
   ASK FOR THE BRAND SVG before running capture (capture won't extract a usable one).
2. Capture + DESIGN.md — npx hyperframes capture {{site_url}}; read tokens.json for
   HEX + fonts. Write DESIGN.md (exact hex, named brand-color vars, fonts, do/don't).
3. Asset pull (parallel) — yt-dlp the N {{clip_sources}}; ffmpeg -an each clip;
   unpack + flat-name the brand SVG.
4. Build — single index.html, N opacity-gated scenes, one paused GSAP timeline.
   Real <video> tiles for the wall; <img>/inline SVG only for brand marks.
   Pre-roll scene-N motion before the scene-N gate opens. Captions >=1.6s.
   LIVE-red dot in every beat. Final 0.5s static.
5. Validate + render — hyperframes lint (0 errors), inspect (mark intentional
   overflow), snapshot every beat hero frame, then ralphy render <id>.
```

## Render

`ralphy render <id>` is the only path. The source ran `bunx hyperframes render` directly because the ralphy HyperFrames wrapper didn't exist yet (logged in that project's `postmortem/03-cli-issues.md`); use the ralphy verb.
