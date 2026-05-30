# model-stack — vpn-sticker-pack

Extracted from `workspace/projects/free-air-vpn-stickerpack/logs/generations.jsonl` (86 image calls) + postmortem section 04.

## Cost ballpark

| Phase | Min-viable run | Source actual | Why source overspent |
|---|---|---|---|
| Look-test grid | $0.60 (4 images, 1 look) | $1.95 (12) | Tested 3 looks × 4 concepts before deciding |
| Pack render (32 stickers, green, no outline) | $4.80 | $5.15 | One pass would have served both sets |
| No-outline re-gen pass | $0.00 | $5.10 | Only existed because v1 baked an outline |
| Quality re-rolls | ~$1.00 | ~$1.00 | Genuine creative iteration |
| Cutout / key / resize (local PIL/ffmpeg) | $0 | $0 | Local, free |
| **TOTAL** | **~$6.5** | **~$12.20** | ~$5.10 avoidable |

Round figure for a new pack on this template: **~$6.5** if rules 1-9 in README are followed (above all: generate clean-on-green from the first sticker).

## Model picks

| Use case | Model (endpoint) | Why | $/call |
|---|---|---|---|
| **Character-consistent stickers** (1 mascot across 30+ poses) | `google/gemini-3-pro-image-preview` (nano-banana-pro) | Holds the mascot identity via a single `--ref` anchor; tolerates ~6 concurrent; does faithful i2i edits | $0.15 |
| **One crisp rendered LETTER / word** | `openai/gpt-5.4-image-2` | Best typography; gemini smudges letterforms | $0.20 |

**Validated decision:** the user suggested "use gpt image"; MODELS.md says gemini wins for multi-ref character consistency. Leading with gemini and reserving gpt-image for the one text-bearing sticker was correct. Re-check MODELS.md before naming ids — training memory is stale.

## What broke (carry-forward warnings)

| Attempt | What broke | Lesson |
|---|---|---|
| `bunx hyperframes remove-background` (u2net) to cut stickers | Salient-object segmentation hugged the body and cut the white outline off | Key the background by flood-fill connectivity, never segment the subject |
| Binary alpha mask | Staircase edges | Soft alpha: greenness ramp OR `GaussianBlur(0.8)` feather |
| Per-pixel greenness ramp alone | Faint low-alpha green haze inflated the crop bbox → subjects sat small | Flood-fill connectivity from the borders removes the whole bg incl. haze |
| Padding to a 512² square | Subject looks tiny in the messenger | Crop solid bbox, scale long side = 512, no square pad |
| Baked the outline into v1, then needed a clean set | Outline can't be stripped from pixels → full 32-image re-gen (~$5.10) | Generate clean-on-green first; add the outline at the sizing step for set B |
| gemini i2i "remove the outline" | Ignored ~6% of the time (2 of 32) | Spot-check the requested edit; escalate the negative |
| First transient `certificate verification error` / empty `images[0]` | Looked like a content block | It's a network blip / flaky soft-refusal — retry the slot, $0, don't redesign |

## What we did NOT need

No video / VO / music / SFX / render. This is a pure still-image-set format. No HyperFrames, no ffmpeg-for-video, no ElevenLabs.
