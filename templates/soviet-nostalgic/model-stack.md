# Model stack rationale (v2 — OpenRouter)

What to use, in what order, и что важно — what to avoid с failure mode чтобы next chat не re-discover.

> **Migrated from fal.ai → OpenRouter в Sprint 2.** Old fal-ai endpoints commented in "Avoid" sections для исторической памяти.

## Order of operations

```
1. Character refs        → gemini-3-pro-image-preview text2img    (~$0.15/img)
2. User-provided photos  → uploaded в workspace/projects/<id>/assets/uploaded/
3. 8 keyframes           → gemini-3-pro-image-preview multi-ref   (~$0.15/img × 8 = $1.20)
4. 8 videos              → kling-v3.0-pro, no audio              (~$0.14/sec × 65s = $9.10)
5. Voiceover             → ElevenLabs eleven_multilingual_v2     (subscription)
6. Music                 → Soviet bed (trend, copy) + ElevenLabs Music (modern bed) (subscription)
7. Captions              → OpenRouter whisper-1                  (~$0.006/min)
8. Composition           → Remotion 4.0.441                      (local)
```

## Keyframes — `google/gemini-3-pro-image-preview` через OpenRouter

```bash
ralphy generate image \
  --project <id> --slot scene-NN-keyframe \
  --prompt "<scene fragment + setting fragment + NO_FRAME suffix>" \
  --ref <character-ref-url> <product-ref-url> \
  --negative "no archival matte border, no Свема text, no plastic skin" \
  --size 1080x1920
```

- **Why:** Best multi-reference character consistency at this price tier. Holds face / hair / wardrobe across 8 different settings когда дано 3 reference photos.
- **Config:** size `1080x1920` (9:16), output PNG (default), single image per call. Multi-ref через `--ref <url>...`.
- **Cost:** $0.15/image.
- **Failure modes:**
  - **Unwanted archival matte border.** Любой prompt с "Soviet archival photograph" / "1970s documentary" tempts gemini в beige/cream matte с vertical "СВЕМА 35 / ФОТОГРАФИЯ" text. Срезает usable area на 9:16 + reads kitschy в motion. Fix: всегда append `NO_FRAME` fragment из `fragments.md` к Soviet-era image prompts. Confirmed на `soviet-engineer-001` — 6/6 keyframes были framed без explicit no-frame instruction.

### Avoid (legacy)
- `fal-ai/nano-banana-pro/edit` — был default до Sprint 2; gemini-3-pro-image-preview через OR даёт сравнимое качество без FAL_KEY.
- `openai/gpt-image-2` с `output_format: "jpeg"` → compression artifacts на grainy Soviet scenes. Always PNG.
- `openai/gpt-image-2` с `image_size: "1024x1536"` → 422 error.

## Video — `kwaivgi/kling-v3.0-pro` через OpenRouter

```bash
ralphy generate video \
  --project <id> --slot scene-NN-vid \
  --image <keyframe-url> \
  --prompt "<motion + camera + NEGATIVE_VIDEO_BASE>" \
  --duration 8 \
  --model kwaivgi/kling-v3.0-pro
```

- **Why:** Best motion fidelity среди тестированных i2v. Поддерживает duration до 15s. Хорошо handles locked-off subtle motion (key для Soviet-era постановочных шотов).
- **Config:** `generate_audio: false` (always — VO добавим отдельно). Cost $0.14/sec.
- **Failure modes:**
  - `bytedance/seedance-2.0` с `generate_audio: true` → ukrainian-coloured voice на русский. Даже с explicit LANGUAGE LOCK в промпте. Use video-only.
  - `google/veo-3.1` с `generate_audio: true` → mature/elderly voice вместо 25yo, текст обрывается на ~4s из 8s clip. Не используем для narrative length.
  - `kwaivgi/kling-v3.0-pro` с `generate_audio: true` на русском → docs confirm TTS только Chinese + English, русский auto-translate.

### Avoid (legacy)
- `fal-ai/kling-video/v3/pro/image-to-video` — legacy fal endpoint; kwaivgi/kling-v3.0-pro через OR — современный путь.
- `undici` (Node 20+ fetch) timeout patterns — actual через `cli/lib/providers/media.ts` уже handles retries.

## Voiceover — ElevenLabs `eleven_multilingual_v2`

```bash
ralphy generate voiceover \
  --project <id> --slot scene-NN-vo \
  --voice <user-voiceId> \
  --text "<scene VO line>"
```

- **Why:** Только path к чистому deadpan native Russian. User-owned voice clones работают best. No regional accent slip.
- **Config:** stability 0.55, similarity_boost 0.8, style 0.25, use_speaker_boost true. Output mp3_44100_128.
- **Pattern:** Genереть 8 per-scene mp3s + 1 full-master mp3. Sequential (not parallel) — free/starter caps на 3 concurrent → 429.
- **Failure modes:**
  - Cloudflare 403 на `api.elevenlabs.io` с default UA. media.ts шлёт `Mozilla/5.0` UA.
  - Default library voices (clyde-warvet, dave-british-mature, daniel-deep) — too theatrical. Use custom clone.

## Music

### Soviet bed — canonical trend track (required, не generate)

Shipped в template'е как `assets/trend-soviet-bed.mp3` (60s). **Do not generate substitute.** Specific track = audio signature trend'а на TikTok; audience recognition в 1-2s = load-bearing для format'а. Copy в каждый project на scaffold time.

### Modern era bed — ElevenLabs Music

```bash
ralphy generate music \
  --project <id> --slot music-modern \
  --prompt "Confident modern hip-hop beat, instrumental, 90 BPM, no vocals, no lyrics, no ad-libs, slight vinyl crackle, polished but not over-mixed." \
  --duration 35
```

- **Why:** Subscription cost ($0 incremental), instrumental, takes structured text prompts. Раньше fal-ai/lyria2 был default — заменён в Sprint 2.
- **Config:** `force_instrumental: true` (default в media.ts). Strong negative в promote ("no vocals, no lyrics, no human voice").

### Avoid (legacy)
- `fal-ai/lyria2` — legacy. ElevenLabs Music через ralphy generate music — v2 path.

### Looping (either track)

Если track короче чем нужен — crossfade-loop через ffmpeg recipe (см. `cli/lib/ffmpeg-recipes.ts` если/когда создан, иначе inline):
```bash
ffmpeg -y -i in.mp3 -i in.mp3 -filter_complex "[0:a][1:a]acrossfade=d=4:c1=tri:c2=tri[a]" -map "[a]" -b:a 192k out.mp3
```

## Captions — `openai/whisper-1` через OpenRouter

```bash
ralphy generate captions \
  --project <id> \
  --audio workspace/projects/<id>/assets/voiceover/master.mp3 \
  --language ru
```

- ~$0.006/audio-min. 65s видео ≈ $0.007.
- Word-level timestamps по дефолту (используется HormoziCaptions / Karaoke).

## Composition — Remotion 4.0.441

- **Transitions:** `@remotion/transitions` TransitionSeries + `fade()` + `linearTiming({ durationInFrames: 12 })` для 0.4s crossfades.
- **VO sync:** Precompute `CLIP_STARTS[]` на shortened timeline; каждый scene's VO `<Sequence from={CLIP_STARTS[i]}>` с 6-frame volume fade-in/out.
- **Music split:** Two separate `<Sequence>`. Soviet bed на `[0, CLIP_STARTS[5]]` volume 0.14 с duck-out 5 frames. Hip-hop на `[CLIP_STARTS[5], CLIPS_TOTAL_FRAMES]` volume 0.28 с 2-frame attack и 60-frame fade-out.
- **Studio preview quirk:** audio transitions между VO sequences звучат abrupt в Studio preview, но рендерятся clean. Don't chase non-existent bug.
- **Render:** `ralphy render <id>` (см. Sprint 6.3); add `--loudnorm` для EBU R128.

## Cost estimate per video (v2)

| Stage | Items | Cost |
|---|---|---|
| gemini-3-pro-image-preview | 8 keyframes + 1 portrait + 1 product mod | ~$1.50 |
| kling-v3.0-pro | 8 × ~8s | ~$9.10 |
| kling regenerations | typical 2-3 iterations | $1.60-2.50 |
| ElevenLabs (TTS) | 9 mp3s | subscription |
| ElevenLabs Music | 1 modern bed | subscription |
| whisper-1 captions | 65s audio | $0.007 |
| Render | local | $0 |
| **Total** | | **~$12-14** |

(Cost ~the same as fal era; OpenRouter не cheaper, но один key стек.)

## Quality gate

- `scoreImage` avg ≥7 на каждый keyframe.
- `scoreImage` avg ≥8 на frames с product (logo accuracy критична).
- `scoreVideo` motion ≥5 на каждом clip.
- `scoreScenario` passing перед art-director handoff.

Two consecutive failures на slot → стоп, refer пользователю.
