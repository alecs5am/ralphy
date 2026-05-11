# Model stack — talking-head-rant

Order of operations and the specific models we call (via OpenRouter or ElevenLabs). Two-key stack: `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. No FAL.

## Stage 1 — Character image

**Model:** `google/gemini-3-pro-image-preview` via OpenRouter
**Cost:** ~$0.15
**Goal:** photorealistic character in their setting, eye-level, with eye contact (5° offset).

```bash
ralphy generate image \
  --project <id> --slot character-keyframe \
  --prompt "<character fragment from fragments.md>" \
  --negative "no logo, no branded text, no watermark, no plastic skin" \
  --size 1080x1920
```

If the user supplied a persona reference photo at `workspace/projects/<id>/assets/uploaded/`:

```bash
ralphy generate image ... --ref <ref-url>
```

## Stage 2 — Talking-head video

### Default: veo-3.1 (premium lip-sync)

**Model:** `google/veo-3.1` via OpenRouter
**Cost:** $0.50/sec → $7.50 for a 15s clip
**Why:** best lip-sync quality in the pool. Worth it for the talking-head format because mouth-audio mismatch is the #1 thing that makes a talking-head video read as fake.

```bash
ralphy generate video \
  --project <id> --slot talking-head \
  --image <character-keyframe-url> \
  --prompt "Character speaks naturally to camera, subtle head movements, eye blinks. Lip-sync to provided audio." \
  --duration 15 \
  --model google/veo-3.1
```

**Production note:** veo-3.1 needs an audio reference for lip-sync. As of writing, `cli/lib/providers/media.ts → generateVideo` doesn't pass audio in the request body — that's a tracked follow-on. Workaround for now: use the kling fallback (below) and let HormoziCaptions hide most desync.

### Cheap fallback: kling-v3.0-pro (no native lip-sync)

**Model:** `kwaivgi/kling-v3.0-pro`
**Cost:** $0.14/sec × 15 = $2.10
**Approach:** generate generic talking motion, not real lip-sync. The VO plays on top — mouth/audio mismatch is visible but `HormoziCaptions` covers most of it visually.

```bash
ralphy generate video \
  --project <id> --slot talking-head \
  --image <character-keyframe-url> \
  --prompt "Subtle head movements, occasional nods, eye blinks, slight body shifts. Mouth movement implied but not synced." \
  --duration 15 \
  --model kwaivgi/kling-v3.0-pro
```

**When to pick which:**
- **veo-3.1** — single-shot premium video, budget ≥ $7, lip-sync is load-bearing.
- **kling-v3.0-pro** — bulk batches (10+ videos) where lip-sync precision isn't critical and HormoziCaptions cover the mouth.

## Stage 3 — Voiceover

**Model:** ElevenLabs `eleven_multilingual_v2`
**Voice:** user-chosen clone (best for deadpan).
**Settings:** stability 0.55, similarity_boost 0.8, style 0.25, use_speaker_boost: true.

```bash
ralphy generate voiceover \
  --project <id> --slot vo-master \
  --voice <voiceId> \
  --text "<full monologue text>"
```

Long monologue — single TTS call. If the scenarist split the script into beats, generate per-beat clips and concat them in the composition.

## Stage 4 — Captions

```bash
ralphy generate captions \
  --project <id> \
  --audio workspace/projects/<id>/assets/voiceover/vo-master.mp3 \
  --language en   # or ru / es / etc., matching the VO
```

Word-level timestamps. `HormoziCaptions` and `KaraokeCaptions` both consume the standard `Caption[]` format.

## Stage 5 — Music

```bash
ralphy generate music \
  --project <id> --slot music-bed \
  --prompt "minimal lo-fi background, very low energy, subtle piano, 60 BPM, almost imperceptible, no vocals" \
  --duration 18
```

Volume 0.10 - 0.12 in the composition (very low — the music must not compete with the VO).

## Stage 6 — Hook screenshot (optional)

If the scenario specifies a hook screenshot:
1. Either the user supplies one at `assets/uploaded/hook.png`, or chat generates a mockup screenshot (any image tool — Pencil MCP, an image generator, or a hand-built PNG).
2. The composition uses `src/lib/components/overlays/HookScreenshot.tsx` (TODO component — see `composition.md` for the inline fallback that ships today).

## Stage 7 — Compose + render

```bash
ralphy render <id>
ralphy render <id> --loudnorm   # post-process EBU R128 -16 LUFS for TikTok
```

## Cost rollup (15s video, veo-3.1 path)

| Stage | Detail | Cost |
|---|---|---|
| Character image | gemini-3-pro-image-preview | $0.15 |
| Talking-head video | veo-3.1 × 15s | $7.50 |
| VO | subscription | $0 |
| Captions | whisper-1 | $0.001 |
| Music | subscription | $0 |
| Render | local | $0 |
| **Total** | | **~$7.65** |

### Cheap path (kling fallback)

| Stage | Cost |
|---|---|
| Character image | $0.15 |
| Talking-head video (kling × 15) | $2.10 |
| Other | ~$0 |
| **Total** | **~$2.25** |

## Quality gate

- `scoreImage` on the character keyframe — average ≥ 7.
- `scoreVideo` on the talking-head clip — motion ≥ 5 (no warping face, no melting eyes).
- veo-3.1 usually nails it on the first try; kling can need 1-2 regens.

## Avoid

- `veo-3.1` with `generate_audio: true` — its native TTS doesn't handle Russian well and other non-English languages drift in tone (see `MODELS.md` Avoid). Generate VO separately via ElevenLabs.
- A static "frozen" image-as-video (e.g. an `ImageSequence` of one frame stretched over 15s) — looks cheap and unprofessional.
- `wan-25` — not in the v2 stack (it was a fal.ai endpoint; we're OpenRouter-only).
