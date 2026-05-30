# motion-stack — live-platform-motion-ad

The broadcast-UI motion patterns + tooling, lifted from `workspace/projects/twitch-fb-ads-001/` and generalized. $0 model spend — all assets are platform clips + the brand SVG + ffmpeg.

## Tooling

| Stage | Tool | Note |
|---|---|---|
| Token + font + asset extraction | `npx hyperframes capture <url>` | Read `extracted/tokens.json` for HEX + fonts + CSS vars; `visible-text.txt`; `asset-descriptions.md` |
| Clip pull | `yt-dlp` | Pull N real platform clips fresh (URLs decay fast); `-f "best[height<=720]" --max-filesize 20M --playlist-end 1` |
| Audio strip | `ffmpeg -c:v copy -an` | Strip clip audio at preprocess even though tags are `muted` |
| Brand SVG unpack | `unzip` + flat-name | Keep the multi-layer structure intact |
| Composition | HyperFrames `index.html` | Single composition, opacity-gated scenes, real `<video>` tiles, GSAP timeline on `window.__timelines` |
| Render | `ralphy render <id>` | The source ran `bunx hyperframes render` directly (no wrapper then); use the verb |

No image / video / VO / music model calls. The platform's own clips + brand SVG carry it.

## The broadcast register (DO / DON'T)

Live-platform UI is functional, not playful. Motion is snappy and reactive, elevation is flat tier shifts + colored glow, never drop shadows.

- **Do** lean hard on the primary brand color — it must be the first thing you register at 1080×1080.
- **Do** pair the LIVE-red with a soft pulsing dot (0.8s ease loop); it is the silent "this is live" cue and must be on screen every beat.
- **Do** use all-caps display font for hooks (`LIVE`, `12.5K VIEWERS`, `WATCH NOW`) with 0.1em letter-spacing; a tight UI sans for counts/chat/pills.
- **Don't** use bouncy springs / playful overshoot — motion is broadcast-style.
- **Don't** use drop shadows — use a 30-60px brand-color radial glow behind a focused element.
- **Don't** use bright white backgrounds — the platform lives in its dark "void" or its brand-gradient zone.

## Pattern: glitch reveal (Scene 0 wordmark)

Inline SVG wordmark with 2-3 chromatic-aberration ghost copies offset in the brand color + a complementary; flicker their opacity + small x-offsets on a tight `steps()` loop for the first ~0.4s, then settle to the clean wordmark. LIVE-red dot pulses on a period/accent glyph.

## Pattern: stream-wall fly-in + viewer-count tick (Scene 1)

Six tiles fly in from staggered offsets (`power3.out`, ~0.4s, 0.06s stagger). Each tile's LIVE pill pops with a tiny scale-up. Viewer counts tick from 0 with a GSAP number tween:

```js
tl.to(counter, { val: 12500, duration: 1.2, ease: "power1.out",
  onUpdate: () => counter.el.textContent = fmtK(counter.val) }, sceneStart);
```

## Pattern: chat firehose (Scene 2)

A vertical list scrolled up so each new line lands at the visible bottom:

```
initialY = listHeight;  finalY = -10;  duration = stagger * line_count;
```

Lines are `username: message` (UI sans 13px, username vivid brand-accent), never emoji bubbles.

## Pattern: pre-rolled marquee (Scene 3)

The #1 transition bug: a marquee that slams in at scene open, stops, then starts scrolling reads as broken. Fix — start the continuous scroll BEFORE the gate opens (e.g. 8.6s instead of 9.5s for a 9.5s scene), so by the time the scene fades in, motion is already established. Two staggered rows sweep L→R on a brand-gradient wash.

> **General rule:** for any scene whose entrance is continuous motion, begin the tween while the prior scene is still on (opacity 0 hides the staging). Never start motion AT the gate.

## Pattern: wordmark slam + static end (Scene 4)

Wordmark scales in fast (`power4.out`, ~0.25s) to center; CTA pill fades below; LIVE dot blinks in a corner. The **final 0.5s holds completely static** — gives the FB algorithm a clean end frame.

## Silent-ad caption rules

- All-caps display 700 for hooks + CTA; UI sans 600 for small labels (counts, chat, pills) — never mix.
- Each caption ≥1.6s on screen (FB silent-viewer threshold).
- LIVE-red dot on screen in EVERY beat.
- No SFX, no music, no VO — audio track silent or omitted.
