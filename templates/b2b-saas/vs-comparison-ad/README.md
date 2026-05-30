# vs-comparison-ad

A vertical 9:16 "pick a side" head-to-head product-comparison short (~60-70s), built as ONE HyperFrames composition driving AI-generated clips + motion-graphics overlays. Source: `workspace/projects/ralphy-vs-higgsfield-001/` (a 68.6s 9:16 brand-comparison short, final `render/final-compressed.mp4`, user-rated 8.5/10).

**Kind:** vibe-style (the cut + overlays are brand-specific; hand-author `index.html` following `composition.md` with the two brands' generated locations).
**Category:** b2b-saas (a head-to-head comparison of two products / platforms).
**Format:** motion-design (a HyperFrames composition driving clips + gauge / countdown / caption overlays).
**Aspect:** 9:16, 1080×1920.
**Length:** 60-70s (source: 68.6s).

> This template captures the comparison **MECHANISM** (two-path color sides + a draining meter + timeline-gated overlays), reusable for any "us vs them" ad in any register. The source's specific *analog-horror skin* is a separate template, `entertainment-viral/analog-horror-pick-a-door` — use that for the horror aesthetic; use THIS for the generalized comparison structure.

## How to use

```bash
ralphy template use vs-comparison-ad \
  --project <new-project-id> \
  --brief "<safe brand vs bad brand + the draining meter label + per-beat captions>"
```

Then run the build in `composition.md`. The render path is `ralphy render <id>` (HyperFrames `index.html`), followed by the VHS/grade ffmpeg post-pass.

## Files

| File | What's in it |
|---|---|
| `composition.md` | The two-path cut structure, the single-track-clips + always-present-overlay-divs pattern, the gauge / countdown / caption mechanics, the one-aesthetic rule, and the build workflow. Read this first. |
| `model-stack.md` | The model stack (gemini multi-ref identity lock, seedance plunges, wan push-ins), the identity-lock discipline, the VHS/grade post-pass, and the cost rollup. |

## Heavy assets

No assets are committed here — every remix generates its OWN two-brand locations + characters and supplies its OWN copy. If a brand's locked character/location set proves reusable, it lives in `ralphy-assets/pool/<brand-slug>/`.

## Cost ballpark

**~$13.85** in the source (41 image gens, 13 video gens; VO/music/SFX on subscription). Genuine ~$11; ~$2.7 avoidable design-discovery regens that a locked guideline + frame-study up front would have cut.

## Key rules (each cost iterations in the source project)

1. **Hold ONE aesthetic end-to-end.** The single biggest post-ship miss: the door room read as liminal-spaces but the SAFE montage broke into a different look. Lock one register and validate every clip against it before composing.
2. **Single root composition: sequential clips on ONE track 0, overlays as always-present timeline-gated divs.** Don't sub-compose.
3. **Keep ALL labels/wordmarks as a HyperFrames overlay, never baked into the gen** — the image model smudges on-screen text. Crop leaked subtitle bands off any source-frame ref.
4. **Lock identity with multi-ref on every gen** (`master + character + source-frame`) so locations + characters stay on-model across the whole cut.
5. **The draining gauge is the BAD side's core device** — `scaleX` fill + an `onUpdate` percent counter on a proxy `{v}` tween: slow drain, then a 1s crash on the trigger beat, color flips danger-red at zero.
6. **Ken-Burns push-in on every still; 0.5s crossfades, never hard cuts;** the trigger-beat zoom is an INSTANT `tl.set`.
7. **VHS / grade / mirage is a post-process ffmpeg pass, not in-composition** — then x264 CRF23 +faststart (source went 76→31 MB).

## Do not copy literally

The source's two brands, the horror skin, the monster, and the specific copy are one-off. Reuse the MECHANISM: a two-path color comparison (calm side vs draining-meter side), one root composition with clips on track 0 + always-present timeline-gated overlays, the `scaleX`+proxy-tween gauge, the SVG-ring countdown, text as a HyperFrames overlay, multi-ref identity lock, the one-aesthetic rule, Ken-Burns + crossfades, and a post-process VHS/grade pass.
