# live-platform-motion-ad

A square 1:1 silent feed ad for a live-streaming / always-on platform, built entirely in HyperFrames — $0 model spend. Source: `workspace/projects/twitch-fb-ads-001/` (a 15s 1:1 silent FB ad for a live-streaming platform, final `renders/twitch-fb-ads-001-v4.mp4`).

**Kind:** vibe-style (the composition is platform-specific; hand-author `index.html` following `composition.md` with the brand's real SVG + pulled clips).
**Category:** entertainment-viral (a live-streaming / gaming platform).
**Format:** motion-design.
**Aspect:** 1:1, 1080×1080.
**Length:** 15s.
**Audio:** silent by design (FB feed auto-mutes — never gate the message on sound).

## How to use

```bash
ralphy template use live-platform-motion-ad \
  --project <new-project-id> \
  --brief "<platform + site URL + N clip sources + per-beat hooks + CTA>"
```

Then run the build in `composition.md`. The render path is `ralphy render <id>` (HyperFrames `index.html`).

## Files

| File | What's in it |
|---|---|
| `composition.md` | The 5-beat structure, the opacity-gated multi-scene pattern, the real-`<video>`-tile rule, the chat-firehose math, the brand-SVG layer structure, and the build workflow. Read this first. |
| `motion-stack.md` | The broadcast-UI register, the per-scene motion patterns (glitch reveal, stream-wall fly-in, viewer-count tick, chat firehose, pre-rolled marquee, wordmark slam), the asset-pull tooling, and the silent-ad caption rules. |

## Heavy assets

No assets are committed here — every remix pulls its OWN platform's clips fresh (URLs decay fast) and supplies its OWN brand SVG. That fresh-pull + brand-asset step is the whole point of the format.

## Cost ballpark

**$0** — HyperFrames render is local; clips are pulled from the platform; the brand SVG is user-supplied. No model calls. The only cost is iteration time + clip-pull bandwidth.

## Key rules (each cost iterations in the source project)

1. **Ask for the brand SVG BEFORE Beat 0 — never reconstruct a branded glyph from memory.** The source spent the hardest three hours of the session rebuilding the platform glyph (donut, then solid bubble), both wrong; only fixed after the user pointed at a screenshot. Even a well-known site won't expose a usable inline logo SVG via capture.
2. **Read the brand SVG structurally, not just its path.** The source glyph is three layers — white interior polygon, compound brand-color path with a `fill-rule="evenodd"` cutout, eye bars. Copy only the path and you ship a solid silhouette.
3. **Default the stream-wall to real muted `<video>` tags, not `<img>`.** The first three versions used static thumbnails and read as an AI mockup; switching to six pulled clips jumped the ad to "actual product demo" register.
4. **Pre-roll continuous motion BEFORE the scene gate opens.** A marquee that slams in, pauses, then scrolls looks broken; start the scroll while the prior scene is still visible (opacity 0 hides staging).
5. **Strip clip audio at preprocess (`ffmpeg -an`)** even when tags are `muted` — belt + suspenders, smaller files.
6. **Captions ≥1.6s; LIVE-red dot in every beat; final 0.5s static** for a clean FB end frame.
7. **Chat-firehose math:** `initialY = listHeight; finalY = -10; duration = stagger × line_count`.

## Do not copy literally

The source platform's brand, glyph, clips, and copy are one-off. Reuse the METHOD: single composition with opacity-gated scene divs, real muted `<video>` stream tiles pulled fresh, the multi-layer brand-SVG rule, viewer-count ticks + LIVE-dot pulse, the pre-rolled category marquee, broadcast-functional (never bouncy) motion, captions ≥1.6s, and a static final frame. Silent by design.
