# model-stack — multi-scene-product-launch

Aggregated from `workspace/projects/nothing-hp1-001/logs/generations.jsonl` (270 entries, 260 ok / 10 error, $50.69 total spend).

## What worked

| Stage | Model | Provider | Calls | Spend | Params | Why it won |
|---|---|---|---|---|---|---|
| Scene keyframes (9:16) | `google/gemini-3-pro-image-preview` | OpenRouter | 198 | $28.35 | size=1080x1920 (delivers 768x1376 native) | The ONLY OR-hosted image model that respects 9:16. Multi-ref handling is the strongest of any tested model (3-4 refs in one call: storyboard + character + wardrobe + product). |
| Product hero masters | `openai/gpt-5.4-image-2` | OpenRouter | 41 | $8.20 | size=1024x1024 | Strong on product detail / typography in 1:1. Use ONLY for square product shots — useless for 9:16 (silently downgrades). |
| Image-to-video | `kwaivgi/kling-v3.0-pro` | OpenRouter | 30 | $14.14 | duration=3-5s, aspect=9:16, resolution=720p | No content-moderation filter on AI faces. Solid motion quality once the locked block stack (STATIC + MID-MOTION + NEGATIVE) is applied. |

## What we tried and dropped

| Stage | Model | Reason dropped |
|---|---|---|
| i2v | `bytedance/seedance-2.0` | `InputImageSensitiveContentDetected.PrivacyInformation` filter blocks ~80% of photoreal AI faces in the first frame, independent of prompt. Untrustable for any character-heavy spot. (1 test call, 0 spend — filter rejected.) |

## Models the BEST-PRACTICES.md cheat-sheet flags but the gen-log didn't use

| Stage | Model | Notes |
|---|---|---|
| Shot detection | `google/gemini-3.1-pro-preview` via `ralphy ref analyze-video --shots <N>` | Native video input, understands shot timing + audio cues. Strongly preferred over frame-based `ralphy ref analyze` for fast-cut commercials. ~$0.05-0.10 per call. |
| Talking-head i2v | `google/veo-3.1` | Backup for face-heavy / lip-sync clips. More expensive (~$0.50/s) but better at faces than Kling. Not needed for this template's no-VO recreation pattern. |
| Cheaper i2v (product-only) | `bytedance/seedance-2.0` | Safe for product-only shots that don't contain faces. ~$0.40/clip. Worth re-trying for the macro / flat-lay shots in act 2 of this template. |

## Cost rollup (source project)

| Bucket | Spend | Calls |
|---|---|---|
| Image — gemini-3-pro-image-preview (9:16 keyframes, character masters, scene regens) | $28.35 | 198 |
| Image — gpt-5.4-image-2 (product hero masters, square only) | $8.20 | 41 |
| Video — kwaivgi/kling-v3.0-pro (i2v, 30 attempts across 22-25 scenes) | $14.14 | 30 |
| Video — bytedance/seedance-2.0 (rejected test) | $0.00 | 1 |
| **Total** | **$50.69** | **270** |

Status breakdown: 260 ok, 10 error (3.7% error rate — mostly Kling motion retries and seedance content-filter rejection).

## Cost per stage (recommended single-pass budget)

Source project ran 6 prompt-iteration passes. For a DISCIPLINED single-pass run using this template's locked prompts, expect ~40-50% of the source spend:

| Stage | Single-pass budget | With 1 regen pass | Worst-case (≥2 regens) |
|---|---|---|---|
| Character masters (2 cast x 4 variants) | $1.20 | $2.40 | $4.00 |
| Product hero masters (6 angles x 1 gen) | $1.20 | $2.40 | $3.60 |
| Scene keyframes (27 scenes x 4 variants) | $16.20 | $24.30 | $32.40 |
| i2v (22 scenes x 1 clip avg 3.3s) | $10.20 | $15.30 | $20.40 |
| Misc / probes | $1.00 | $2.00 | $4.00 |
| **Total** | **~$30** | **~$46** | **~$64** |

## Params (the values that actually got committed across the 198 keyframe calls)

```jsonc
{
  "image_keyframe": {
    "model": "google/gemini-3-pro-image-preview",
    "size": "1080x1920",          // delivered 768x1376; lanczos-upscale post
    "refs": 3,                     // storyboard + character-base + wardrobe-ref
    "refs_for_product_scenes": 4,  // + product hero
    "variants_per_scene": 4,       // parallel, $0.60/scene
    "post_process": "ffmpeg -y -i in.png -vf scale=1080:1920:flags=lanczos out.png"
  },
  "image_product_master": {
    "model": "openai/gpt-5.4-image-2",
    "size": "1024x1024",
    "refs": 4,                     // multi-angle user-supplied product photos
    "variants": 1                  // single-pass usually fine for hero shots
  },
  "video_i2v": {
    "model": "kwaivgi/kling-v3.0-pro",
    "duration": "max(3, ceil(scene.durationSec))",
    "aspect": "9:16",
    "resolution": "720p",           // upscale in Remotion
    "image_ref": "scenes/NN/picked.png",
    "concurrency": 5                // parallel submits to provider
  }
}
```

## When to deviate from this stack

- **Replacing the brand audio with original VO**: add `elevenlabs/eleven_multilingual_v2` for {{target_language}} VO. Verify language quality (Russian and JP often drift via Kling's `--audio` flag — see global rule "Kling --audio: EN yes / RU no").
- **Original music (no source-1:1)**: `elevenlabs/elevenlabs-music` with category-matched prompt (cinematic strings + sonic chime for tech, ambient electronic for fitness, soft piano for beauty). Ban artist names — ToS.
- **Lip-sync product spokesperson**: switch face-heavy clips from Kling to `google/veo-3.1`. Cost rises ~3x.
- **Cheaper product-only shots**: try `bytedance/seedance-2.0` for any clip without faces (~$0.40 vs Kling's $0.42 for similar duration, no quality dip on product-only).
