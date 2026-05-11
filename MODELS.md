# Models registry

A short, opinionated list of the models we actually use. **Two API keys only:** `OPENROUTER_API_KEY` for media / LLM / transcription, `ELEVENLABS_API_KEY` for voice and music. Everything else is out of scope.

> **Last reviewed: 2026-05-08.** If this file is older than 30 days, re-check the models on OpenRouter — versions drift silently. The OR video catalog is the source of truth; surface it via `ralphy models list` (24h cached).

## How to use this file

1. **Before any model call**, open the matching section. The top pick has the reason it's the top pick.
2. **For video**, also run `ralphy models show <id>` — it returns the live `supported_durations`, `supported_resolutions`, `supported_aspect_ratios`, `supported_frame_images` from OR. Don't hand-pick parameters that aren't in those arrays — the submit will fail validation (`ralphy generate video` runs the check pre-flight; bypass with `--no-validate`).
3. **For image**, the `--size` flag is a prompt-level hint, not an enforced constraint — gemini and gpt image models round to their internal natural sizes (1024², 768×1376, …). If you need an exact dimension, post-process with `ralphy video extract-segment` / `ffmpeg` after generation.
4. **For cost preview**, every video gen accepts `--dry-run` — prints resolved request body + cost estimate without spending credits.
5. **If the task is new** (not in this file) — DO NOT invent a provider. Tell the user the task is out of scope or needs a model-list extension.

---

## Image generation

Endpoint: `POST /api/v1/chat/completions` with `modalities: ["image","text"]`. Output bytes arrive on `choices[0].message.images[0].image_url.url` as a `data:` URI or http URL. `cli/lib/providers/media.ts → generateImage()` decodes both. **Don't make direct fetches to fal.ai or openai.com.**

| Use case | Model | Price | Why |
|---|---|---|---|
| **Default** — keyframes with character consistency (multi-ref) | `google/gemini-3-pro-image-preview` (= nano-banana lineage) | ~$0.15 / image | Best multi-reference: face / wardrobe stay consistent across scenes. Multiple `--ref` images chain into the prompt. |
| **Premium** — high-quality studio photo | `openai/gpt-5.4-image-2` | ~$0.20 / image | Best photorealism when multi-ref consistency isn't required. |

**Reference images:** `--ref` accepts URL, local path, or `data:` URI. Local paths are auto-converted to `data:` URI in-process — no upload step.

**Size:** `--size 1080x1920` is forwarded to the model as a prompt-level hint; gemini-3-pro-image-preview will return either 1024² (close to 1:1 prompts), 768×1376 (close to 9:16), or 1280×720 (close to 16:9) — these are the model's natural output buckets. You will not get pixel-exact 1080×1920 from this model; downstream Remotion / ffmpeg compositions handle the scale-to-cover.

**Avoid:**
- Any model more than a year old (`stable-diffusion-xl`, `flux/schnell`, `dall-e-3`) — quality is below the current top picks at the same price.
- `gpt-image-1` / legacy `gpt-image-2` — gpt-5.4-image-2 is the newer, stable line.
- Hard-coded fal.ai endpoints — left the stack in Sprint 2.

---

## Video generation (text-to-video + image-to-video)

Endpoint: **async-job pattern** at `POST /api/v1/videos`. Submit returns `{ id, status, polling_url }`; poll until `completed`; download via `GET /api/v1/videos/{id}/content?index=0` (auth required). The legacy `/api/v1/videos/generations` returns 404. `cli/lib/providers/media.ts → generateVideo()` handles the full job lifecycle (15s × 80-poll = 20 min budget; tunable).

### Per-model matrix (live from `/api/v1/videos/models`, snapshot 2026-05-08)

Always re-check via `ralphy models list` — these arrays change.

| Model | Durations (s) | Resolutions | Aspects | Frame anchors | $/sec billed |
|---|---|---|---|---|---|
| `kwaivgi/kling-v3.0-pro` | 3-15 | 720p | 9:16, 16:9, 1:1 | first + last | $0.14 ✓ |
| `kwaivgi/kling-v3.0-std` | 3-15 | 720p | 9:16, 16:9, 1:1 | first + last | $0.14 ✓ (not ½ pro — same rate) |
| `kwaivgi/kling-video-o1` | 5, 10 | 720p | 9:16, 16:9, 1:1 | first + last | ~$0.14 |
| `google/veo-3.1` | 4, 6, 8 | 720p, 1080p | 9:16, 16:9 | first + last | ~$0.50 |
| `google/veo-3.1-fast` | 4, 6, 8 | 720p, 1080p, 4K | 9:16, 16:9 | first + last | $0.14 ✓ (was ~$0.25 — wrong) |
| `google/veo-3.1-lite` | 4, 6, 8 | 720p, 1080p | 9:16, 16:9 | first + last | ~$0.09 |
| `openai/sora-2-pro` | model-dep | model-dep | model-dep | model-dep | ~$0.50 |
| `minimax/hailuo-2.3` | 6, 10 | 1080p | **16:9 only** | first only | ~$0.10 |
| `alibaba/wan-2.6` | 5, 10 | 720p, 1080p | 9:16, 16:9 | first only | ~$0.10 |
| `alibaba/wan-2.7` | 2-10 | 720p, 1080p | 9:16, 16:9, 1:1, 4:3, 3:4 | first + last | ~$0.10 |
| `bytedance/seedance-2.0` | 4-15 | 480p, 720p, 1080p | **7 aspects incl 21:9 cinema** | first + last | $0.14 ✓ |
| `bytedance/seedance-2.0-fast` | 4-15 | 480p, 720p | 7 aspects | first + last | $0.14 ✓ (was ~$0.05 — wrong) |
| `bytedance/seedance-1-5-pro` | 4-12 | 480p, 720p, 1080p | 7 aspects | first + last | ~$0.10 |

> **Pricing reality check (2026-05-11):** OpenRouter bills video generation **per-clip flat** — the duration parameter sets the clip length, the billed cost ≈ rate × duration. A `✓` in the rate column means the rate was empirically verified against actual OR billing on 2026-05-11 (see `docs/render-test-2026-05-11.md` §1.1). Earlier docs claimed half-price std and per-second steps that didn't match observation; those have been corrected here and in `cli/lib/providers/media.ts:VIDEO_PRICE_PER_SEC`. Models without `✓` are ballparks from the OR catalog — verify on first use and add `✓` once confirmed.

### When to pick which

| You need | Pick |
|---|---|
| **Default narrative i2v**, character consistency, hold a keyframe | `kwaivgi/kling-v3.0-pro` |
| **Cheap batch** (≥10 clips) where keyframe drift is acceptable | `kwaivgi/kling-v3.0-std` (NOTE: same per-second price as pro on OR — go to `veo-3.1-lite` for the real cheap-batch tier) |
| **Talking-head / face / lip-sync style** | `google/veo-3.1` (model-native audio with `--audio` works in EN; **off for RU/UA** — only Chinese + English are clean) |
| **4K** mastered hero piece | `google/veo-3.1-fast` (only model in catalog with 4K) |
| **Sharp physics motion** (parkour, sports, falling) | `bytedance/seedance-2.0` (also the only path to 21:9 cinema aspect) |
| **3:4 / 4:3 portrait magazine** | `alibaba/wan-2.7` (only model with these in stock) |
| **Cheapest viable** | `bytedance/seedance-2.0-fast` |

### Lessons from this session (2026-05-08)

1. **`kwaivgi/kling-v3.0-pro` rotates "wide" prompts inside the 9:16 container.** Phrases like *"wide overhead cityscape"*, *"massive crowd in town square"*, *"dancers under starlit sky"* bias the model toward landscape composition; OR returns a 1080×1920 file but the *content* is laid out for 16:9. **Fix:** anchor with `--first-frame <portrait-image>` and rewrite the prompt with explicit vertical wording (*"tall vertical portrait shot, low camera angle looking up, narrow alley framing, subjects centered vertically, half-timbered houses tower vertically on both sides"*). The first-frame image overrides the model's compositional bias.
2. **`--resolution 720p` is silently upgraded** to 1080p by `kwaivgi/kling-v3.0-pro` even though the catalog only lists 720p. The output dimension is whatever the model decides; treat resolution as a soft hint and let downstream Remotion / ffmpeg crop+scale to the composition's exact frame.
3. **OR's per-clip billing** is fixed (e.g., a 5s kling-pro clip is ~$0.70 regardless of "duration in body" precision). The per-second figures above are therefore ballparks; pre-flight `--dry-run` to see the estimate before submitting.
4. **`generate_audio: true` is unsafe outside English.** Confirmed for `kwaivgi/kling-v3.0-pro`, `bytedance/seedance-2.0`, and `google/veo-3.1` on Russian — accent slips, voice age drifts, text gets cut. Default is `false`; only enable for EN with `--audio`.

**Avoid:**
- `kling-video/v1.6` or `v2.x` — outdated.
- `luma-dream-machine` — worse than kling at the same price; out of OR catalog now.
- `fal-ai/*` endpoints — the stack moved to OpenRouter in Sprint 2.

---

## Voiceover (TTS)

| Use case | Model | Price | Why |
|---|---|---|---|
| **Default — Russian** | ElevenLabs `eleven_multilingual_v2` | subscription | The only path to clean deadpan Russian without regional accent slip. User-owned voice clones work best. |
| **English premium** | ElevenLabs `eleven_v3` | subscription | Most emotional for English. Validated 2026-05-08 against the brainrot test (Adam preset, dramatic narrator, 45-55s). **Unstable on Russian — don't use in production for RU.** |

**Voice settings (deadpan young Russian):**
```json
{ "model_id": "eleven_multilingual_v2", "voice_settings": { "stability": 0.55, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": true }, "output_format": "mp3_44100_128" }
```

**Voice settings (English brainrot dramatic narrator):**
```json
{ "model_id": "eleven_v3", "voice_settings": { "stability": 0.30, "similarity_boost": 0.75, "style": 0.40, "use_speaker_boost": true } }
```
Voice picks: Adam (`pNInz6obpgDQGcFmaJgB`) for dramatic narrator, Brian (`nPczCjzI2devNBz1zQrb`) for Reddit-monotone, Daniel (`onwK4e9ZLuTAKqWW03F9`) for British-sarcastic.

**Failure modes:**
- Default UA on Node 20+ → Cloudflare 403. Send `User-Agent: Mozilla/5.0 (...)`.
- Free/starter cap is 3 concurrent → 429. Run sequentially, not in parallel.
- Default library voices (`clyde-warvet`, `daniel-deep`, etc.) — too theatrical for RU. A custom clone is mandatory for RU production.
- VO drift: dramatic narration on `eleven_v3` consistently runs **~15-25% longer than scripted word-count would suggest** (Strasbourg 45s scenario rendered at 54.6s). Time-budget compositions to actual VO duration via `ralphy project transcribe`, not scenario text length.

**Avoid:**
- OpenAI `tts-1-hd` on Russian — flat American accent.
- ElevenLabs `eleven_v3` on Russian in production — unstable.

---

## Music generation

| Use case | Model | Price | Why |
|---|---|---|---|
| **Default** — instrumental beds | ElevenLabs Music (`music_v1`) | subscription (binary audio response) | Same key as VO. Validated 2026-05-08: 8s instrumental delivered cleanly via `ralphy generate music`. |

**Endpoint contract** (for `cli/lib/providers/media.ts → generateMusic()`):
```
POST https://api.elevenlabs.io/v1/music
Headers: xi-api-key: $ELEVENLABS_API_KEY, Content-Type: application/json
Body: { "prompt": "...", "music_length_ms": 30000, "force_instrumental": true, "output_format": "mp3_44100_128", "model_id": "music_v1" }
Response: 200 → binary mp3 (application/octet-stream)
         422 → JSON validation error
```

**Trend-music rule:** if a template references a specific trend track (`assets/trend-*.mp3`), copy the file from the `ralphy-assets` companion repo — **don't generate a substitute**. Track recognition is half of what makes a trend video a trend.

**Fallback** (if ElevenLabs Music quality regresses): temporarily route to `fal-ai/lyria2` via `FAL_KEY` as a documented exception. As of 2026-05-08 the fallback is not activated — ElevenLabs Music is the only path.

**Avoid:**
- Suno (not on OpenRouter).
- `lyria2` directly via `FAL_KEY` while ElevenLabs Music works — don't multiply optional keys.

---

## Audio transcription / Captions

| Use case | Model | Price | Why |
|---|---|---|---|
| **Default** — word-level captions for compositions | ElevenLabs `scribe_v1` (default in `cli/lib/transcribe.ts`) | ~$0.004 per audio-minute | Returns word-level timestamps natively in the shape Remotion's caption components expect; no second normalization pass. Verified end-to-end on the brainrot 54.6s VO → 121 word entries. |
| **Fallback** — when ElevenLabs is down | OpenRouter `openai/whisper-1` (`--backend openrouter`) | ~$0.006 / min | One key covers it. Sometimes 400s on long audio; re-encode to 64kbps mono mp3 if you hit them. |

CLI: `ralphy generate captions --project <id> --audio <vo.mp3> --language en` (writes `captions.json` next to the project).

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
- After every failure mode on a new model — add it to "Avoid" / "Lessons" with the reason.
- When you change a default in a skill or script — sync it here.
- When you add a verb to `ralphy generate` or a flag — sync the price / param notes here.
- At least once a month — even if nothing broke.
