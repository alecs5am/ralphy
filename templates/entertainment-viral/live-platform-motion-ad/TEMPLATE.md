# Live Platform Motion Ad (live-platform-motion-ad)

A square 1:1 silent feed ad for a live-streaming / always-on platform, built entirely in HyperFrames — $0 model spend. Derived from `twitch-fb-ads-001` (a 15s 1:1 silent FB ad, final `renders/twitch-fb-ads-001-v4.mp4`).

- **Kind:** vibe-style — the composition is platform-specific; hand-author `index.html` per `composition.md` with the brand's real SVG + pulled clips.
- **Category:** entertainment-viral (a live-streaming / gaming platform).
- **Format:** motion-design. **Aspect:** 1:1, 1080×1080. **Length:** 15s. **Audio:** silent by design (FB feed auto-mutes).

## How to use

```bash
ralphy template use live-platform-motion-ad --project <new-project-id> --brief "<platform + site URL + N clip sources + hooks + CTA>"
```

Build per `composition.md`, then render with `ralphy render <id>` (HyperFrames `index.html`).

## Required inputs (slots)

| Slot | Required | What |
|---|---|---|
| `brand_name` | yes | The platform / wordmark. |
| `site_url` | yes | The platform site to ground tokens + fonts against. |
| `brand_svg` | yes | The official multi-layer brand glyph SVG. Never reconstruct from memory. |
| `palette` | yes | Brand HEX (primary, void bg, surface tiers, LIVE-red). |
| `clip_sources` | yes | N real platform clip URLs (audio stripped at preprocess). |
| `hooks` | yes | Per-beat all-caps caption hooks, ≥1.6s each on screen. |
| `cta` | yes | End-slate CTA line + URL. |
| `categories` | no | Category pills for the marquee beat. |
| `duration_s` | no | Default 15s. |

## Files

| File | What's in it |
|---|---|
| `composition.md` | The 5-beat structure, the opacity-gated multi-scene pattern, the real-`<video>`-tile rule, the chat-firehose math, the brand-SVG layer structure, and the build workflow. Read this first. |
| `motion-stack.md` | The broadcast-UI motion patterns (glitch reveal, stream-wall fly-in, viewer-count tick, pre-rolled marquee), the asset-pull tooling, and the silent-ad caption rules. |

## Cost ballpark

**$0** — HyperFrames render is local; clips are pulled from the platform; the brand SVG is user-supplied. No model calls. The only cost is iteration time + clip-pull bandwidth.

## Key rules (each cost iterations in the source project)

1. **Ask for the brand SVG BEFORE Beat 0 — never reconstruct a branded glyph from memory.** The source burned two iterations rebuilding the platform glyph (first a "donut", then a solid bubble), both wrong. Even a well-known site won't expose a usable inline logo SVG via capture.
2. **Read the brand SVG structurally, not just its path data.** The source glyph is THREE layers: a white interior polygon, a compound purple path with a `fill-rule="evenodd"` cutout, and the eye bars. Copy only the path and you ship a solid silhouette.
3. **Default the stream-wall to real muted `<video>` tags, not `<img>`.** A live platform demoed with static thumbnails reads as an AI mockup; real clips read as the actual product. HyperFrames handles multiple `<video id … data-start data-duration muted playsinline>` tags cleanly.
4. **Pre-roll continuous motion BEFORE the scene gate opens.** Start the marquee scroll while the prior scene is still visible (opacity 0 hides staging), or the viewer registers the slam→pause→resume choppiness.
5. **Strip clip audio at preprocess (`ffmpeg -an`) even when tags are `muted`** — belt + suspenders, and keeps file size down.
6. **Captions ≥1.6s on screen** (FB silent-viewer threshold); the **LIVE-red dot is on screen in every beat** as the silent "watch now" cue; the **final 0.5s holds static** for a clean FB end frame.
7. **Chat-firehose scroll math:** `initialY = listHeight; finalY = -10; duration = stagger × line_count` — each new line lands at the visible bottom while older ones drift up.

## Do not copy literally

The source platform's brand, glyph, clips, and copy are one-off. Reuse the METHOD: single composition with opacity-gated scene divs, real muted `<video>` stream tiles pulled fresh, the multi-layer brand-SVG rule, viewer-count ticks + LIVE-dot pulse, the pre-rolled category marquee, broadcast-functional (never bouncy) motion, captions ≥1.6s, and a static final frame. Silent by design.
