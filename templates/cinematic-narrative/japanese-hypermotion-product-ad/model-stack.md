# Model Stack — Japanese Hyper-Motion Product Ad

Defaults validated on `flipper-hypermotion-001` (~$14 spent across one full project + one creative iteration on the human-orbit scene). Use these as the starting point — the rationale matters more than the exact model IDs (swap when MODELS.md updates).

## Image generation

| Use case | Model | Why | Cost / call |
|---|---|---|---|
| **Product fidelity** — real device, branding, typography, OLED pixel-art, internals/PCB, 10-layer exploded views, kana typography in-frame | `openai/gpt-5.4-image-2` | Holds brand text, real component topology, correct proportions, multiple precise text elements on one surface | $0.20 |
| **Photoreal human in real location** | `google/gemini-3-pro-image-preview` (banana) | Best photoreal humans. Requires "documentary photography, 50mm prime, ISO 1600 grain" prompt cues + explicit negative against anime / CGI / stylization | $0.15 |
| **Hybrid photoreal face + anime trope overlay** (e.g. money-eyes, sparkle-eyes, sweat-drop) | `google/gemini-3-pro-image-preview` | Banana handles layer-split when prompt says "applied over", "hybrid", "cartoonish graphic within an otherwise photoreal eye" | $0.15 |
| **Character continuity across multiple shots** | `google/gemini-3-pro-image-preview` with prior keyframe as `--ref` | Banana holds character ID (hair color, hoodie graphic, face shape) far better via image-ref than via text-only | $0.15 |
| **Disposable iteration / smoke test** | `openai/gpt-5-image-mini` | Cheap to spam | $0.08 |

**Multi-ref strategy.** Always pass 2-3 refs per call:
1. Canonical product PNG (from brand site)
2. This template's `assets/style-3d-floor-walls.png` or `style-hyperpop-tilegrid.png`
3. Scene-specific ref if applicable (location, character master)

`gemini-3-pro-image-preview` is materially better at holding 2+ refs simultaneously than `gpt-image-2`, but `gpt-image-2` wins on tiny details / typography / real-world product fidelity. Use each for what it's best at.

**C2PA strip is mandatory before i2v.** `ffmpeg -y -i in.png -map_metadata -1 -compression_level 100 stripped/out.png`. Embedded `caBX` chunks break base64 transport on some endpoints.

## Video generation (i2v)

| Use case | Model | Why | Cost |
|---|---|---|---|
| **Hyper-motion** — slam-stop, vertical explode, runway-sprint, falling, parkour, particle bursts, screen-shake | `bytedance/seedance-2.0` | Sharp physics, handles violent motion + screen-shake well, particle physics + bokeh look clean | $0.14/s ($0.56 / 4s) |
| **Macro tech** — coin-arc, pin-glint cascade, electrical-spark contact, light-glint sweep | `bytedance/seedance-2.0` | Particle physics + electrical/lightning prompts are seedance's strength | $0.14/s |
| **Photoreal human + cinematic camera move** (180° orbit, slow dolly on face) | `kwaivgi/kling-v3.0-pro` SINGLE-FRAME ONLY | Best face / orbit; holds keyframe identity. Use for whole-shot face + camera motion | $0.14/s ($0.70 / 5s) |
| **Face-only expression escalation** (no body movement, no camera move — just eye widening, smile widening, head tilt back) | `kwaivgi/kling-v3.0-pro` SINGLE-FRAME | Animates ONLY internal facial motion without distorting face structure. Don't ask kling to move the body; ask it to *intensify* what's already in the frame. | $0.42 / 2s |
| **Vendor moderation fallback** | `alibaba/wan-2.7` | Different moderation, accepts what seedance/kling reject (esp. person-content) | $0.10/s |

### Discovered breakage (must-know)

- **`kling-v3.0-pro` + `--first-frame` + `--last-frame` reliably 400s** with `"File is not in a valid base64 format"`. Stripping C2PA doesn't fix it. Use seedance for multi-frame, kling for single-frame only. Tracked as `cli/lib/providers/media.ts` open issue.
- **`seedance-2.0` returns `"OpenRouter video submit had no job.id"`** on some person-content combinations (esp. words like "hacker", "smug", "hack"). Two workarounds: (1) reframe with cultural-genre language ("gambling-ecstasy", "anime money-eyes trope") which reads as art reference instead of instruction; (2) fall back to `wan-2.7` or `kling-pro single-frame`.

## Music

| Use case | Model | Notes |
|---|---|---|
| **Music bed** | ElevenLabs `music_v1` | Generate 3 variants up front for A/B/C compare. 15s clips honest 15.07s. Structural energy differs across genres: orchestral drops energy mid-track, electronic-glitch and j-pop hold tension better. |

Slot names lowercase-kebab only (`music-a-orchestral`, NEVER `music-A-orchestral`).

## LLM (vision / analysis)

| Use case | Model | Notes |
|---|---|---|
| Vision analyze of reference frames (shot count, motion, palette extraction) | `google/gemini-2.5-flash` | Default in `ralphy ref analyze`. $0.001/frame. Surface `language_detected_in_text` carefully — auto-detection has missed Korean vs Japanese on past refs. |

## Captions

**None.** This template has no caption layer. All on-screen text is diegetic katakana baked into the still (impact text, speech bubbles, exploded-view labels, final logo + slogan). The text IS part of the still composition, not a Remotion caption overlay.

## Cost per stage (Flipper baseline, disciplined run target)

| Stage | Items | Disciplined $ | Realistic-with-1-iter $ |
|---|---|---|---|
| Reference pull + vision analyze | 1 video, 16 frames, vision JSON | $0.01 | $0.01 |
| Stills (14 anchors) | 12 × gpt-5.4-image-2 + 2 × banana for photoreal hero | $2.70 | $4.00 (incl. re-rolls) |
| i2v (8 clips) | 6 × seedance + 2 × kling-pro single-frame | $4.50 | $5.50 (incl. vendor-fallback) |
| Music (3 variants) | ElevenLabs music_v1 | subscription | subscription |
| Renders × 3 | local CPU | $0 | $0 |
| **TOTAL** | | **~$7-8** | **~$10-12** |

Flipper's actual first run hit ~$13 (pre-discipline) + $1.30 for one creative scene-03 redo = ~$14.30 final. The $6.30 over-baseline traces to:
- $1.20 on phase-3 stills BEFORE storyboard was locked (avoidable — see TEMPLATE.md rule 1)
- $1.60 on v2 product-shot redo after wrong canonical refs (avoidable — see rule 2)
- $0.84 on kling multi-frame failures (CLI bug — see open-issues)
- $1.28 on the scene-03 split-instead-of-regen redo (genuine creative iteration — accept this class of spend)
- $1.40 leftover banana/gpt iteration on stills (mixed)

## What worked / what dropped

| Model | Verdict | Notes |
|---|---|---|
| `openai/gpt-5.4-image-2` | KEEP as default for product/typography/internals | Nails kana, brand-text, 10-layer disassemblies, OLED pixel-art |
| `google/gemini-3-pro-image-preview` (banana) | KEEP for photoreal humans + hybrid overlays + character ID via ref | Strong; documentary-photography prompt cues required |
| `bytedance/seedance-2.0` | KEEP as default i2v | Hyper-motion / physics / particles / sparks — clean every time |
| `kwaivgi/kling-v3.0-pro` single-frame | KEEP for human face + expression escalation | Use as scoped — body movement / camera rotation is wrong tool |
| `kwaivgi/kling-v3.0-pro` MULTI-frame | DROP | Reliably 400s with base64 error. Use seedance for multi-frame. |
| `alibaba/wan-2.7` | KEEP as moderation-refusal fallback only | Lower fidelity than seedance/kling but accepts when others refuse |
| `openai/gpt-5-image-mini` | KEEP for smoke / disposable iteration | Cheap enough to spam — useful for testing scene framing before $0.20 calls |

## Open CLI / playbook issues (carry into next project)

1. `kling-v3.0-pro` multi-frame submit consistently 400s — needs fix in `cli/lib/providers/media.ts` (request body, or document limitation in MODELS.md).
2. `gpt-5.4-image-2` silent empty response on some prompts — `media.ts` should retry once with slightly modified prompt before erroring.
3. Auto-strip metadata from i2v ref images — add `auto_strip_metadata` step in `cli/lib/providers/media.ts → generateVideo()` before base64-encode, save manual ffmpeg every project.
4. MODELS.md "kling-v3.0-pro = default narrative i2v" needs nuance: "for hyper-motion / explosions / fast camera moves → seedance-2.0. kling-pro for talking-head and slow narrative."
5. Vision analyze should call out language/region with a `language_detected_in_text` field — past ref was Korean labeled "japanese-katakana".
