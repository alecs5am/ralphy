# Model stack rationale (v2 — OpenRouter)

What to use, in what order, and the failure modes that matter — so the next chat doesn't have to re-discover them.

> **Migrated from fal.ai → OpenRouter in Sprint 2.** Legacy fal-ai endpoints are kept in "Avoid" sections for historical memory.

## Order of operations

```
1. Character refs        → gemini-3-pro-image-preview text2img    (~$0.15/img)
2. User-provided photos  → uploaded to workspace/projects/<id>/assets/uploaded/
3. 8 keyframes           → gemini-3-pro-image-preview multi-ref   (~$0.15/img × 8 = $1.20)
4. 8 videos              → kling-v3.0-pro, no audio              (~$0.14/sec × 65s = $9.10)
5. Voiceover             → ElevenLabs eleven_multilingual_v2     (subscription)
6. Music                 → Soviet bed (trend, copy) + ElevenLabs Music (modern bed) (subscription)
7. Captions              → OpenRouter whisper-1                  (~$0.006/min)
8. Composition           → Remotion 4.0.441                      (local)
```

## Keyframes — `google/gemini-3-pro-image-preview` via OpenRouter

```bash
ralphy generate image \
  --project <id> --slot scene-NN-keyframe \
  --prompt "<scene fragment + setting fragment + NO_FRAME suffix>" \
  --ref <character-ref-url> <product-ref-url> \
  --negative "no archival matte border, no Cyrillic 'Svema' text, no plastic skin" \
  --size 1080x1920
```

- **Why:** best multi-reference character consistency at this price tier. Holds face / hair / wardrobe across 8 different settings when given 3 reference photos.
- **Config:** size `1080x1920` (9:16), output PNG (default), single image per call. Multi-ref via repeated `--ref <url>`.
- **Cost:** $0.15/image.
- **Failure modes:**
  - **Unwanted archival matte border.** Any prompt with "Soviet archival photograph" / "1970s documentary" tempts the model into drawing a beige/cream matte with vertical Cyrillic "SVEMA 35 / PHOTOGRAPH" text along the edges. That eats usable area on 9:16 and reads kitschy in motion. Fix: always append the `NO_FRAME` fragment from `fragments.md` to Soviet-era image prompts. Confirmed on `soviet-engineer-001` — 6/6 keyframes were framed without the explicit no-frame instruction.

### Avoid (legacy)
- `fal-ai/nano-banana-pro/edit` — was the default before Sprint 2. `gemini-3-pro-image-preview` via OR delivers comparable quality without `FAL_KEY`.
- `openai/gpt-image-2` with `output_format: "jpeg"` → compression artifacts on grainy Soviet scenes. Always PNG.
- `openai/gpt-image-2` with `image_size: "1024x1536"` → 422 error.

## Video — `kwaivgi/kling-v3.0-pro` via OpenRouter

```bash
ralphy generate video \
  --project <id> --slot scene-NN-vid \
  --image <keyframe-url> \
  --prompt "<motion + camera + NEGATIVE_VIDEO_BASE>" \
  --duration 8 \
  --model kwaivgi/kling-v3.0-pro
```

- **Why:** best motion fidelity among the i2v models we tested. Supports durations up to 15s. Handles locked-off subtle motion well (key for Soviet-era staged shots).
- **Config:** `generate_audio: false` (always — VO is added separately). Cost $0.14/sec.
- **Failure modes:**
  - `bytedance/seedance-2.0` with `generate_audio: true` → Ukrainian-tinted voice on Russian text, even with an explicit LANGUAGE LOCK in the prompt. Use video-only.
  - `google/veo-3.1` with `generate_audio: true` → mature/elderly voice instead of a 25-year-old, text cuts off around 4s of an 8s clip. Don't use for narrative-length clips.
  - `kwaivgi/kling-v3.0-pro` with `generate_audio: true` on Russian → docs confirm TTS supports only Chinese + English, Russian gets auto-translated.

### Avoid (legacy)
- `fal-ai/kling-video/v3/pro/image-to-video` — legacy fal endpoint; `kwaivgi/kling-v3.0-pro` via OR is the current path.
- Direct `undici` (Node 20+ fetch) timeout patterns — `cli/lib/providers/media.ts` already handles retries.

## Voiceover — ElevenLabs `eleven_multilingual_v2`

```bash
ralphy generate voiceover \
  --project <id> --slot scene-NN-vo \
  --voice <user-voiceId> \
  --text "<scene VO line>"
```

- **Why:** the only path to clean deadpan native Russian. User-owned voice clones work best. No regional accent slip.
- **Config:** stability 0.55, similarity_boost 0.8, style 0.25, use_speaker_boost true. Output mp3_44100_128.
- **Pattern:** generate 8 per-scene mp3s + 1 full-master mp3. Sequential (not parallel) — free/starter plans cap at 3 concurrent and 429 above that.
- **Failure modes:**
  - Cloudflare 403 on `api.elevenlabs.io` with the default Node UA. `media.ts` sends a `Mozilla/5.0` UA to avoid it.
  - Default library voices (clyde-warvet, dave-british-mature, daniel-deep) are too theatrical and break the deadpan vibe. Use a custom clone.

## Music

### Soviet bed — canonical trend track (required, do not generate)

Shipped with the template at `assets/trend-soviet-bed.mp3` (60s). **Do not generate a substitute.** The specific track is the audio signature of the trend on TikTok; audience recognition within 1-2s is load-bearing for the format. The track is auto-copied into each new project at `ralphy template use` time.

### Modern era bed — ElevenLabs Music

```bash
ralphy generate music \
  --project <id> --slot music-modern \
  --prompt "Confident modern hip-hop beat, instrumental, 90 BPM, no vocals, no lyrics, no ad-libs, slight vinyl crackle, polished but not over-mixed." \
  --duration 35
```

- **Why:** subscription cost ($0 incremental), instrumental, takes structured text prompts. Replaced `fal-ai/lyria2` in Sprint 2.
- **Config:** `force_instrumental: true` (default in `media.ts`). Strong negative in the prompt ("no vocals, no lyrics, no human voice").

### Avoid (legacy)
- `fal-ai/lyria2` — legacy. `ralphy generate music` (ElevenLabs Music) is the v2 path.

### Looping (either track)

If a track is shorter than needed, crossfade-loop it with ffmpeg (also exposed via `cli/lib/ffmpeg-recipes.ts → loopTrack` when that helper lands; inline below until then):

```bash
ffmpeg -y -i in.mp3 -i in.mp3 -filter_complex "[0:a][1:a]acrossfade=d=4:c1=tri:c2=tri[a]" -map "[a]" -b:a 192k out.mp3
```

## Captions — `openai/whisper-1` via OpenRouter

```bash
ralphy generate captions \
  --project <id> \
  --audio workspace/projects/<id>/assets/voiceover/master.mp3 \
  --language ru
```

- ~$0.006/audio-min. A 65s video ≈ $0.007.
- Word-level timestamps by default (consumed by `HormoziCaptions` / `KaraokeCaptions`).

## Composition — Remotion 4.0.441

- **Transitions:** `@remotion/transitions` `TransitionSeries` + `fade()` + `linearTiming({ durationInFrames: 12 })` for 0.4s crossfades.
- **VO sync:** precompute `CLIP_STARTS[]` on the shortened timeline; each scene's VO `<Sequence from={CLIP_STARTS[i]}>` gets a 6-frame volume fade-in/out.
- **Music split:** two separate `<Sequence>` blocks. Soviet bed on `[0, CLIP_STARTS[5]]` at volume 0.14 with a 5-frame duck-out. Hip-hop on `[CLIP_STARTS[5], CLIPS_TOTAL_FRAMES]` at volume 0.28 with a 2-frame attack and a 60-frame fade-out.
- **Studio preview quirk:** audio transitions between VO sequences sound abrupt in Studio preview but render cleanly. Don't chase a non-existent bug.
- **Render:** `ralphy render <id>`; add `--loudnorm` for EBU R128 -16 LUFS.

## Cost estimate per video (v2)

| Stage | Items | Cost |
|---|---|---|
| gemini-3-pro-image-preview | 8 keyframes + 1 portrait + 1 product mod | ~$1.50 |
| kling-v3.0-pro | 8 × ~8s | ~$9.10 |
| kling regenerations | typical 2-3 iterations | $1.60 - $2.50 |
| ElevenLabs (TTS) | 9 mp3s | subscription |
| ElevenLabs Music | 1 modern bed | subscription |
| whisper-1 captions | 65s audio | $0.007 |
| Render | local | $0 |
| **Total** | | **~$12-14** |

(Cost is roughly the same as the fal era; OpenRouter isn't cheaper but it's one key for the whole stack.)

## Quality gate

- `scoreImage` average ≥ 7 on every keyframe.
- `scoreImage` average ≥ 8 on frames where the product is visible (logo accuracy is critical).
- `scoreVideo` motion ≥ 5 on every clip.
- `scoreScenario` passes before the art-director handoff.

Two consecutive failures on the same slot → stop and refer the options back to the user.
