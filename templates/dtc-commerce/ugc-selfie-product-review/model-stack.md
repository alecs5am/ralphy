# Model Stack — UGC Selfie Product Review

Defaults validated on `glitter-cream-001`. Total spend $13.79 across 11 successful video clips + 18 images + 3 music tracks + render. Disciplined run lands $6-8.

## What worked

| Stage | Model | Provider | Why it won | Cost (typical) |
|---|---|---|---|---|
| Product master + studio packshot | `openai/gpt-5.4-image-2` | OpenRouter | Best screen-printed label typography. Holds brand wordmark + script logotype + icon across re-renders. | $0.20 / shot |
| Persona master + scene first-frames | `google/gemini-3-pro-image-preview` | OpenRouter | Best at holding face / wardrobe / room across MULTI-REF calls (product + persona). Verified — same freckles, glasses, pajama, bedroom across 5+ generations. | $0.15 / shot |
| All UGC selfie video clips | `kwaivgi/kling-v3.0-pro` (`--audio`) | OpenRouter | Honors internal HARD JUMP CUTs (~0.2s precision). Renders EN speech + tactile SFX inline. Holds locked first-frame identity. | $0.14 / sec |
| BG instrumental music | `elevenlabs/music_v1` | ElevenLabs | $0 on subscription. `force_instrumental: true`. 3 variant pass standard. | $0 |
| Render + loudnorm | Remotion 4.0.441 + ffmpeg loudnorm | local | $0. Composition-props.json required even prop-less. | $0 |

Both image models accept local PNG paths via `--ref` (auto-data-URI'd in-process). No upload step.

## What we tried and dropped

| Tried | Result | Why dropped |
|---|---|---|
| `kwaivgi/kling-v3.0-pro` WITHOUT `--audio` on take 1 | Silent clip | MODELS.md flag-help said "Veo 3 only" but body confirmed kling supports EN. Wasted $0.42. Lesson: read MODELS.md body, not just flag help. |
| `kwaivgi/kling-v3.0-pro` with jar-near-cheek geometry | Collapsed to "powder-compact stamping" pose, TWICE with different DO-NOT blocks | The "tap product on face" archetype is too strong a prior. Workaround: redesign scene to keep product >=30cm from face. Cost dropped: $2.24. |
| Veo 3 escalation for "kling generated silence" | Never needed — false alarm | RMS reading -21.5 LUFS isn't silence; intimate UGC audio is naturally quiet. Listen, don't measure. |
| Option A 15s single-call (5 shots, 4 cuts) | Worked but lost A/B vs two-clip split | A/B was informative ($2.10 sunk-cost on the losing side). Multi-cut single call IS viable but coordination overhead at 5 shots is high. Default to 2-3 shots per call. |
| Sticker-style label on product master v1 | Rejected by user | "Looks too cartoon-y." Fix: explicit "premium minimalist cosmetics packaging in Glossier / Charlotte Tilbury style, NO sticker, screen-print directly on glass" up front. |
| AI-airbrushed model first pass | Rejected by user ("слишком иишно идеально") | Default gemini-3-pro idealizes skin. Fix: "natural imperfect skin texture, no AI smoothing, visible freckles, real-girl morning vibe" in EVERY persona/scene gen. |
| Kling `--audio` on Russian | (memory) | Accent slip + voice-age drift. Russian / non-English -> kling audio off, ElevenLabs `eleven_multilingual_v2` post-hoc. |

## Cost per stage (source project breakdown)

| Phase | Items | $ |
|---|---|---|
| Reference pull + analyze + blueprint | 1 source video, 8 frames | ~$0.01 |
| Product master exploration (4 variants gpt-5.4-image-2) | 4 shots | $0.80 |
| Initial persona master (gemini-3-pro) | 1 shot | $0.15 |
| Studio frontal shots v1+v2 | 4 shots | $0.80 |
| Product redesign + persona redo v2 | 4 shots | $0.70 |
| Scene-01 firstframes v1+v2 (gemini-3-pro x2) | 4 shots | $0.60 |
| B2 firstframe + B2 v3 firstframe | 1 shot | $0.15 |
| Product master v2 (specificity bait) | 1 shot | $0.20 |
| Scene-01 firstframe v3 (specificity bait) | 1 shot | $0.15 |
| **Image subtotal** | **18 shots** | **$3.15** |
| Kling take1 (no `--audio`, 3s) | 1 clip | $0.42 |
| Kling take2 (`--audio`, 3s, RMS misread) | 1 clip | $0.42 |
| Kling take3 multi-cut probe (6s) - research win | 1 clip | $0.84 |
| Opt A 15s single-call (5 shots, 4 cuts) - lost A/B | 1 clip | $2.10 |
| Opt B v1 (8s + 7s) - pacing rejected | 2 clips | $2.10 |
| Opt B v2 (9s chill + 8s jar-as-powder bug) | 2 clips | $2.38 |
| **Opt B v3 cheek-tilt-light + B1 v3 specificity-bait - SHIPPED** | 2 clips | $2.38 |
| **Video subtotal** | **11 clips + 4 zero-cost 400 errors** | **$10.64** |
| ElevenLabs music x 3 variants | 3 tracks | $0 |
| Remotion render + loudnorm | 1 render | $0 |
| **TOTAL** | | **$13.79** |

## Cost ballpark for the next user of this template

| Scenario | $ |
|---|---|
| Disciplined run (locked refs upfront, no A/B, single retry per clip) | $6-8 |
| First-time / exploratory (some master regens, one A/B axis) | $10-14 |
| Heavy retry / multiple action-drift fights | $15-20 |

## Discovered breakages to watch for

- **Kling labels on rotating products** -> typography smudges within ~5 deg of tilt. User judgment in source project: invisible on TikTok mobile playback at small size; don't fight it.
- **Kling prompts > 2500 chars** -> `400 prompt: size must be between 0 and 2500` from OpenRouter. CLI does not pre-validate. Gate locally `<=2300`.
- **Composition-props.json required even prop-less** -> `cli/commands/render.ts:31` errors if missing. Auto-write `{"compositionId": "<id>"}` stub.
- **Slot-id capital letters / underscores** rejected by CLI. Lowercase kebab-case only.
