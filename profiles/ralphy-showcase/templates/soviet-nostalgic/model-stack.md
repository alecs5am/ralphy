# Model stack rationale

What to use, in what order, and — critically — what to avoid, with the failure mode documented so the next chat doesn't re-discover it.

## Order of operations

```
1. Character refs        → nano-banana-pro text2img         (~$0.15/img)
2. User-provided photos  → upload to fal CDN                (free)
3. 8 keyframes           → nano-banana-pro/edit multi-ref   (~$0.15/img × 8 = $1.20)
4. 8 videos              → kling-video/v3/pro, no audio     (~$0.14/sec × 65s = $9.10)
5. Voiceover             → ElevenLabs eleven_multilingual_v2 (subscription)
6. Music × 2             → Lyria2                           ($0.10/track × 2)
7. Composition           → Remotion 4.0.441                 (local)
```

## Keyframes — `fal-ai/nano-banana-pro/edit`

- **Why:** Best multi-reference character consistency we've found at this price. Holds face/hair across 8 different settings when given 3 reference photos.
- **Config:** `aspect_ratio: "9:16"`, `resolution: "2K"`, `output_format: "png"`, `num_images: 1`.
- **Ref input pattern:** `image_urls: [ref1, ref2, ref3, product_ref]` — last slot typically the product for consistency.
- **Cost:** $0.15/image.
- **Failure modes we hit:**
  - `openai/gpt-image-2` with `output_format: "jpeg"` → visible compression artifacts on grainy Soviet scenes. Fix: always PNG.
  - `openai/gpt-image-2` with `image_size: "1024x1536"` → 422 error, only enum sizes accepted. Use `"portrait_16_9"`.
  - **Unwanted archival matte border.** Any prompt that cues "Soviet archival photograph" or "1970s documentary" tempts nano-banana-pro to render a beige/cream matte around the image with vertical "СВЕМА 35 / ФОТОГРАФИЯ" text along the edges. This shrinks the usable picture area on a 9:16 TikTok video and reads kitschy at motion. Fix: always append the `NO_FRAME` fragment from [fragments.md](fragments.md) to every Soviet-era image prompt. Confirmed on `soviet-engineer-001` — every one of the 6 keyframes came out framed despite no explicit frame instruction in the prompt.

## Video — `fal-ai/kling-video/v3/pro/image-to-video`

- **Why:** Best motion fidelity of the three tested i2v models (Seedance, Veo, Kling). Supports `duration` up to 15s. Handles locked-off subtle motion well.
- **Config:** `generate_audio: false`, `cfg_scale: 0.55`, per-clip motion prompt + NEGATIVE_VIDEO_BASE + era-specific preserve suffix.
- **Cost:** $0.14/sec.
- **Failure modes we hit:**
  - `bytedance/seedance-2.0/image-to-video` with `generate_audio: true` → produces a Ukrainian-colored voice on Russian script. Even with explicit LANGUAGE LOCK block describing hard-velar 'г', акание, etc., we got a Slavic-not-Russian voice. Gave up, now use video-only.
  - `fal-ai/veo3.1/image-to-video` with `generate_audio: true` → produced a mature/elderly voice when we wanted 25yo, AND text cut off at ~4s of an 8s clip. Not usable for narrative length.
  - `fal-ai/kling-video/v3/pro/image-to-video` with `generate_audio: true` on Russian → docs confirm TTS is Chinese + English only, Russian is auto-translated. Confirmed empirically.
  - `undici` (Node 20+ fetch) times out at 10s TCP connect for fal.ai queue calls. Fix: wrap `fetch` with 4-attempt retry + `AbortSignal.timeout(240_000)`.

## Voiceover — ElevenLabs `eleven_multilingual_v2`

- **Why:** Only path we found to clean deadpan native Russian. User-owned voice clones work well. No regional accent slip.
- **Config:** `stability: 0.55, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true`. Output `mp3_44100_128`.
- **Pattern:** Generate 8 per-scene mp3s + 1 full-master mp3. Sequential (not parallel) — free/starter plans cap at 3 concurrent, 429's otherwise.
- **Failure modes we hit:**
  - Cloudflare 403 on `api.elevenlabs.io` from default `User-Agent`. Fix: send `User-Agent: Mozilla/5.0 (...)`.
  - Default library voices (clyde-warvet, dave-british-mature, daniel-deep) all sounded wrong for deadpan young Russian — they're too theatrical. Use a custom cloned voice.

## Music

### Soviet bed — canonical trend track (required)

Ship with the template as `assets/trend-soviet-bed.mp3` (60s). **Do not generate a substitute.** This specific track is the audio signature of the trend on TikTok — audience recognition within 1–2s is load-bearing for the format. Copy into each project at scaffold time.

### Hip-hop bed — `fal-ai/lyria2`

- **Why:** $0.10 per 30s track, instrumental, takes structured text prompts. Works well for confident modern hip-hop beds that aren't trend-bound.
- **Config:** Instrumental prompt + strong negative block (`no vocals, no lyrics, no ad-libs, no human voice`). Duration emergent — our run came out 32.8s, enough for the 20–25s modern-era half.

### Looping (either track)

If a track is shorter than needed, crossfade-loop with ffmpeg:
```bash
ffmpeg -y -i in.mp3 -i in.mp3 -filter_complex "[0:a][1:a]acrossfade=d=4:c1=tri:c2=tri[a]" -map "[a]" -b:a 192k out.mp3
```

## Composition — Remotion 4.0.441

- **Why:** Proven, all packages pinned to same version (mixing versions breaks the bundler).
- **Transitions:** `@remotion/transitions` `TransitionSeries` + `fade()` + `linearTiming({ durationInFrames: 12 })` for 0.4s crossfades.
- **VO sync:** Precompute `CLIP_STARTS[]` on the shortened timeline; each scene's VO `<Sequence from={CLIP_STARTS[i]}>` with 6-frame volume fade-in/out to avoid click artifacts between VO handoffs.
- **Music split:** Two separate `<Sequence>` blocks. Soviet bed on `[0, CLIP_STARTS[5]]` volume 0.14 with duck-out 5 frames. Hip-hop on `[CLIP_STARTS[5], CLIPS_TOTAL_FRAMES]` volume 0.28 with 2-frame attack and 60-frame fade-out.
- **Studio preview quirk:** audio transitions between VO sequences sound abrupt in Studio preview but render cleanly. Don't chase a non-existent bug.

## Cost estimate per video

| Stage | Items | Cost |
|---|---|---|
| nano-banana-pro/edit | 8 keyframes + 1 portrait + 1 product mod | ~$1.50 |
| Kling v3 Pro | 8 × ~8s | ~$9.10 |
| Kling regenerations | typical 2–3 iterations on a fresh product | $1.60–2.50 |
| ElevenLabs | 9 mp3s | subscription |
| Lyria2 | 2 tracks | $0.20 |
| **Total** | | **~$12–14** |
