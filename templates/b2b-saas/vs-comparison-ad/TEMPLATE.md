# Head-to-Head Comparison Ad (vs-comparison-ad)

A vertical 9:16 "pick a side" product-comparison short (~60-70s) built as ONE HyperFrames composition driving AI-generated clips + motion-graphics overlays. Derived from `ralphy-vs-higgsfield-001` (a 68.6s 9:16 brand-comparison short, final `render/final-compressed.mp4`, user-rated 8.5/10).

- **Kind:** vibe-style — the cut + overlays are brand-specific; hand-author `index.html` per `composition.md` with the two brands' generated locations.
- **Category:** b2b-saas (a head-to-head comparison of two products / platforms).
- **Format:** motion-design (a HyperFrames composition driving clips + gauge / countdown / caption overlays). **Aspect:** 9:16, 1080×1920. **Length:** 60-70s.

> **Related:** this template captures the **comparison MECHANISM** (two-path color sides + a draining meter + timeline-gated overlays), reusable for any "us vs them" ad in any register. The source project's specific *analog-horror skin* is a separate template, `entertainment-viral/analog-horror-pick-a-door` — use that one when you want the horror aesthetic; use THIS one for the generalized comparison structure.

## How to use

```bash
ralphy template use vs-comparison-ad --project <new-project-id> --brief "<safe brand vs bad brand + the draining meter label + per-beat captions>"
```

Build per `composition.md`, then render with `ralphy render <id>` (HyperFrames `index.html`).

## Required inputs (slots)

| Slot | Required | What |
|---|---|---|
| `safe_brand` | yes | The SAFE / winning brand (calm accent, no meter). |
| `bad_brand` | yes | The BAD / losing brand (opposite accent, the gauge drains on it). |
| `safe_accent` | yes | Calm-side accent HEX. |
| `bad_accent` | yes | Opposite-side accent HEX. |
| `meter_label` | yes | The draining-gauge label (LIMITS / CREDITS / TOKENS / …). |
| `captions` | yes | Per-beat kinetic caption lines (the silent narration). |
| `endcard` | yes | End-card line + the SAFE brand mark. |
| `source_clip` | no | Optional source video to remix the cut blueprint from. |
| `display_font` | no | Overlay display/HUD font (VT323-style retro mono by default). |

## Files

| File | What's in it |
|---|---|
| `composition.md` | The two-path cut structure, the single-track-clips + always-present-overlay-divs pattern, the gauge / countdown / caption mechanics, the one-aesthetic rule, and the build workflow. Read this first. |
| `model-stack.md` | The model stack (gemini multi-ref identity lock, seedance plunges, wan push-ins), the VHS/grade post-pass, and the cost rollup. |

## Cost ballpark

**~$13.85** in the source (41 image gens, 13 video gens; VO/music/SFX on subscription). Genuine spend ~$11 (the distinct location + motion + character slots); ~$2.7 was avoidable design-discovery regens (face redesigns, realism register) that a locked guideline + frame-study up front would have cut.

## Key rules (each cost iterations in the source project)

1. **Hold ONE aesthetic end-to-end.** The single biggest post-ship miss: the door room read as liminal-spaces but the SAFE montage broke into a different look. Lock one visual register and validate every clip against it before composing.
2. **Single root composition: sequential clips on ONE track 0, overlays as always-present divs gated by the GSAP timeline.** Don't sub-compose; gate overlay visibility with the one paused timeline.
3. **Keep ALL labels/wordmarks as a HyperFrames overlay, never baked into the generated frames** — the image model smudges on-screen text. Crop any leaked subtitle band off a source-frame ref before using it.
4. **Lock identity with multi-ref on every gen** — pass `master + character + source-frame` to gemini so locations + characters stay on-model across the whole cut.
5. **The draining gauge is the BAD side's core device** — `scaleX` fill + an `onUpdate` percent counter on a proxy `{v}` tween: slow drain across the bad-side scenes, then a 1s crash on the trigger beat, color flips to danger-red at zero.
6. **Ken-Burns push-in on every still; 0.5s opacity crossfades, never hard cuts.** Stills with a slow `scale 1.0 → 1.07` read as motion; hard cuts read as a slideshow.
7. **VHS / grade / mirage is a post-process ffmpeg pass, not in-composition** — then x264 CRF23 +faststart compress (the source went 76→31 MB, visually lossless on grainy content).

## Model picks (defaults)

- **Locations / characters → `gemini-3-pro-image-preview`** (multi-ref identity lock, ~$0.15, parallel-friendly).
- **Door-through / plunge motion → `seedance-2.0`** (honors first+last frame; stylized silhouettes + empty rooms pass the privacy filter; ~$0.14/s).
- **Gentle push-ins on a still → `wan-2.7`** (~$0.10/s, half the price; don't spend seedance money on a slow push).
- **VO → ElevenLabs IVC clone; music → ElevenLabs Music; SFX → ElevenLabs Sound Gen** (subscription, iterate freely).

## Do not copy literally

The source's two brands, the horror skin, the monster, and the specific copy are one-off. Reuse the MECHANISM: a two-path color comparison (calm side vs draining-meter side), one root composition with sequential clips on track 0 + always-present timeline-gated overlays, the `scaleX`+proxy-tween gauge, the SVG-ring countdown, text as a HyperFrames overlay, multi-ref identity lock, the one-aesthetic rule, Ken-Burns + crossfades, and a post-process VHS/grade pass.
