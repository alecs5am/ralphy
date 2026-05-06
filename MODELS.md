# Models registry

A short, opinionated list of the models we actually use. **Two API keys only:** `OPENROUTER_API_KEY` for media / LLM / transcription, `ELEVENLABS_API_KEY` for voice and music. Everything else is out of scope.

> **Last reviewed: 2026-05-06.** If this file is older than 30 days, re-check the models on OpenRouter.

## 🚨 Before every model call

1. Open this table — it has the current top pick and the reason for it.
2. **Don't hard-code stale model versions from memory.** Model versions drift silently.
3. If the task is new (not in this table) — DO NOT invent a provider. Tell the user that the task is out of scope or needs a model-list extension.

---

## Image generation

| Use case | Model | Price ballpark | Why |
|---|---|---|---|
| **Default** — keyframes with character consistency (multi-ref) | `google/gemini-3-pro-image-preview` (= nano-banana lineage) | ~$0.15/img | Best multi-reference: face / wardrobe stay consistent across scenes. PNG 2K 9:16. |
| **Premium** — high-quality studio photo | `openai/gpt-5.4-image-2` | ~$0.20/img | Best photorealism when multi-ref consistency isn't required. |

All calls go through `cli/lib/providers/media.ts → generateImage()` which hits OpenRouter. **Don't make direct fetches to fal.ai or openai.com.**

**Avoid:**
- Any models more than a year old (`stable-diffusion-xl`, `flux/schnell`, `dall-e-3`) — quality is below the current top picks at the same price.
- `gpt-image-1` / legacy `gpt-image-2` — gpt-5.4-image-2 is the newer, stable line.
- Hard-coded fal.ai endpoints — left the stack in Sprint 2.

---

## Image-to-video (i2v)

| Use case | Model | Price ballpark | Why |
|---|---|---|---|
| **Default** narrative i2v | `kwaivgi/kling-v3.0-pro` | ~$0.14/sec | Best motion in our pool, holds the keyframe composition, supports up to 15s. **`generate_audio: false` — mandatory for Russian VO.** |
| **Premium** narrative t2v/i2v | `google/veo-3.1` | ~$0.50/sec | Best narrative generation. Use when the keyframe pipeline doesn't fit (style/abstraction) or for talking-head in the `talking-head-rant` template. |
| **Fast/cheap** — sharp motion | `bytedance/seedance-2.0` | ~$0.10/sec | Fast physics (running, falling, sports). **Audio off** — seedance-2.0's TTS gives Russian a Ukrainian accent. |

**Avoid:**
- `seedance-2.0` with `generate_audio: true` on Russian → Ukrainian-tinted accent even with LANGUAGE LOCK.
- `veo-3.1` with `generate_audio: true` → an older voice instead of a young one, text cuts off around 4s of an 8s clip.
- `kling-v3.0-pro` with `generate_audio: true` on Russian → docs confirm TTS supports only Chinese + English; everything else gets auto-translated.
- `kling-video/v1.6` or `v2.x` — outdated.
- `luma-dream-machine` — worse than kling at the same price.
- Any fal.ai endpoints — the stack moved to OpenRouter in Sprint 2.

---

## Voiceover (TTS)

| Use case | Model | Price | Why |
|---|---|---|---|
| **Default — Russian** | ElevenLabs `eleven_multilingual_v2` | subscription | The only path to clean deadpan Russian without regional accent slip. User-owned voice clones work best. |
| **English premium** | ElevenLabs `eleven_v3` | subscription | Most emotional for English. Unstable on Russian — don't use in production. |

**Voice settings (deadpan young Russian):**
```json
{ "model_id": "eleven_multilingual_v2", "voice_settings": { "stability": 0.55, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": true }, "output_format": "mp3_44100_128" }
```

**Failure modes:**
- Default UA on Node 20+ → Cloudflare 403. Send `User-Agent: Mozilla/5.0 (...)`.
- Free/starter cap is 3 concurrent → 429. Run sequentially, not in parallel.
- Default library voices (`clyde-warvet`, `daniel-deep`, etc.) — too theatrical. A custom clone is mandatory.

**Avoid:**
- OpenAI `tts-1-hd` on Russian — flat American accent.
- ElevenLabs `eleven_v3` on Russian in production — unstable.

---

## Music generation

| Use case | Model | Price | Why |
|---|---|---|---|
| **Default** — instrumental beds | ElevenLabs Music (`music_v1`) | subscription (binary audio response) | Same key as VO. **Validated 2026-05-06**: API endpoint `POST https://api.elevenlabs.io/v1/music` accepts `prompt`, `music_length_ms` (3000-600000), `force_instrumental: true`, `output_format` (e.g. `mp3_44100_128`). Auth header `xi-api-key`. Returns binary mp3. |

**Endpoint contract (for `cli/lib/providers/media.ts → generateMusic()`):**
```
POST https://api.elevenlabs.io/v1/music
Headers: xi-api-key: $ELEVENLABS_API_KEY, Content-Type: application/json
Body: { "prompt": "...", "music_length_ms": 30000, "force_instrumental": true, "output_format": "mp3_44100_128", "model_id": "music_v1" }
Response: 200 → binary mp3 (application/octet-stream)
         422 → JSON validation error
```

**Trend-music rule:** if a template references a specific trend track (`assets/trend-*.mp3`), copy the file — **don't generate a substitute**. Track recognition is half of what makes a trend video a trend.

**Fallback** (if ElevenLabs Music quality regresses in production): temporarily route to `fal-ai/lyria2` via `FAL_KEY` as an exception. Document the activation here and in `cli/lib/capabilities.ts`. As of 2026-05-06 the fallback is not activated — ElevenLabs Music is the only path.

**Avoid:**
- Suno (not on OpenRouter).
- `lyria2` directly via `FAL_KEY` while ElevenLabs Music works — don't multiply optional keys.

---

## Audio transcription

| Use case | Model | Price | Why |
|---|---|---|---|
| Default | OpenRouter `openai/whisper-1` via `cli/lib/transcribe.ts` | ~$0.006 per audio-minute | One key covers everything. Word-level timestamps via `timestamp_granularities[]=word` map cleanly to our caption components. ≤25MB per file (re-encode long audio to 64kbps mono mp3). Use `ralphy project transcribe <id> --audio <path>`. |

**Avoid:**
- Local whisper.cpp — large binary, no real benefit over the cloud at our volumes.
- Direct OpenAI API — we route through OpenRouter so one key covers vision + scoring + transcription.

---

## LLM (for skills and analytics)

**Provider routing.** All LLM / vision calls go through `cli/lib/providers/llm.ts → callLLM()`. **The only provider is OpenRouter.**

| Use case | Model | Why |
|---|---|---|
| Vision analysis of images / videos (extract-design, find-viral-moments, face-bbox, scoreImage, scoreVideo) | `google/gemini-2.5-flash` | Cheap vision (~$0.001/frame), accurate enough for smart-crop and moment detection. Use `pro` when long context is needed. |
| Deep vision (extract-design on complex landing pages) | `google/gemini-2.5-pro` | Best quality on long prompts + complex screenshots. ~3× the cost of flash. |
| Scenarist / VO rewrite / feedback parsing | `anthropic/claude-sonnet-4.6` or `anthropic/claude-opus-4.6` | RU/EN at the same level, nuances revisions well. |
| This chat | Claude Opus 4.7 | The one you're reading right now. |

**Avoid:**
- Direct `fetch("https://openrouter.ai/...")` calls in new scripts. Go through `callLLM()` so users can switch providers via `ralphy setup`.
- Hard-coded `anthropic.com` or `openai.com` URLs — everything through OpenRouter.

---

## Out-of-scope / dropped

These models / families were removed during OpenRouter consolidation (Sprint 1.3 / 2). Don't bring them back without an explicit plan upgrade:

- `fal-ai/nano-banana-pro/edit` — replaced with `google/gemini-3-pro-image-preview` via OR.
- `fal-ai/flux-pro/v1.1-ultra`, `fal-ai/flux/dev/inpainting`, `fal-ai/flux-pro/v1.1-ultra/redux` — out.
- `fal-ai/luma-dream-machine/image-to-video` — out (worse than kling).
- `fal-ai/wan-25` — lipsync stage dropped entirely in v2 (no FAL_KEY pipeline).
- `fal-ai/sync-lipsync`, `fal-ai/veed/lipsync` — out.
- `fal-ai/lyria2` — out (fallback reserved in the Music section).
- `fal-ai/seedream` — out.
- Replicate `wav2lip` — out (no token, no stage).
- `openai/gpt-image-1`, `dall-e-3`, `stable-diffusion-xl`, `flux/schnell` — outdated.
- Apify — replaced with a Playwright scraper in `/ralph-researcher` (deferred to v2).
- Higgsfield Soul, Fireworks Whisper — require separate keys, not in the stack.
- Vercel AI Gateway, direct OpenAI API — single-provider OpenRouter in v2.

---

## When to update this file

- On the first session in a new chat — check `Last reviewed`, refresh if stale.
- After every failure mode on a new model — add it to "Avoid" with the reason.
- When you change a default in a skill or script — sync it here.
- At least once a month — even if nothing broke.
