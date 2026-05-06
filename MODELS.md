# Models registry

Current list of models we use in this project. Claude's training has a cutoff — this file is the single source of truth. **Read it before every generation.**

> **Last reviewed: 2026-04-23.** If the file is more than 30 days old — re-check via `mcp__fal-ai__search_models` and refresh.

## 🚨 Mandatory rule before calling any model

**Never hardcode an old model version from memory.** Before a call:

1. Open this table — it has the current top pick and the reason for the choice.
2. If the model is in this file, or you want a sibling — call `mcp__fal-ai__search_models` with the family base name (`kling`, `seedance`, `veo`, `flux`, `nano-banana`, `lyria`, `gpt-image`) and check whether a fresher version exists. If yes — use it and update this file.
3. If the task is new (not in the table) — use `mcp__fal-ai__recommend_model` with a description of the task.
4. Pricing — `mcp__fal-ai__get_pricing` before kicking off expensive batches.

Families go stale silently — `kling-video/v1.6` is still available, but `v3/pro` is usually better for the same money. Don't inherit a pick from old code — re-check on every new project.

## Image generation (text-to-image and edit)

| Purpose | Model | Price | Why |
|---|---|---|---|
| Keyframes with character consistency (multi-ref) | `fal-ai/nano-banana-pro/edit` | ~$0.15/img | Best multi-reference consistency for face/clothing across 8 different scenes. PNG 2K 9:16. |
| Pure text-to-image (no reference) | `fal-ai/nano-banana-pro` | ~$0.15/img | Same stack, but without `image_urls`. Use to generate one character-reference before a series of keyframes. |
| High-quality editorial photo | `fal-ai/flux-pro/v1.1-ultra` | ~$0.06/img | When you need a photorealistic studio shot without a strong character lock. Cheaper than nano-banana. |
| Structural edit with mask / inpainting | `fal-ai/flux-pro/v1.1-ultra/redux` or `fal-ai/flux/dev/inpainting` | ~$0.04–0.08 | Replace part of an image while preserving the rest. |

**Avoid:**
- `openai/gpt-image-2` with `output_format: "jpeg"` — visible JPEG artifacts on grainy/retro film texture. Always PNG.
- `openai/gpt-image-2` with `image_size: "1024x1536"` — 422 error, accepts only enums (`portrait_16_9`, `square_hd`, etc.).
- Any model older than a year (`stable-diffusion-xl`, `flux/schnell`, `dall-e-3`) — quality below current top picks for the same money.

## Image-to-video (i2v)

| Purpose | Model | Price | Why |
|---|---|---|---|
| **Default i2v** for narrative clips | `fal-ai/kling-video/v3/pro/image-to-video` | ~$0.14/sec | Best motion among tested options, holds keyframe composition, supports duration up to 15s. **`generate_audio: false` — required for Russian VO.** |
| When you need strong physics and fast motion | `fal-ai/seedance-2.0/image-to-video` | ~$0.10/sec | Beats Kling on scenes with sharp motion (running, falling, sport). But native TTS — Ukrainian accent on Russian, turn audio off. |
| Cheap black-box | `fal-ai/luma-dream-machine/image-to-video` | ~$0.08/sec | For drafts. Worse quality than Kling. |

**Avoid (with documented issues):**
- `bytedance/seedance-2.0/image-to-video` with `generate_audio: true` on Russian → Ukrainian-tinted voice, even with an explicit LANGUAGE LOCK block. Use video-only.
- `fal-ai/veo3.1/image-to-video` with `generate_audio: true` → older voice instead of young, text gets cut at ~4s out of 8s. Not viable for narrative.
- `fal-ai/kling-video/v3/pro/image-to-video` with `generate_audio: true` on Russian → docs confirm TTS is Chinese+English only, the rest is auto-translated. Empirically confirmed.
- `kling-video/v1.6` or `v2.x` — outdated, v3/pro is better at the same price.

## Lipsync (talking-head with synced lips)

| Purpose | Model | Price | Why |
|---|---|---|---|
| **Default talking-head from scratch** (image + audio → video) | `fal-ai/wan-25` | ~$0.10/sec | One call: takes image (face) + audio (mp3/wav, ≥3s) + prompt → returns talking-head video with built-in lip-sync. Duration 5/10s, resolution 480p/720p/1080p. Replaces `kling i2v` + separate wav2lip. |
| **Re-lipsync an existing video** (video + new audio) | `fal-ai/sync-lipsync` | ~$0.05/sec | Takes an already-rendered video and overlays new speech, redrawing only the lips. Use when you need to swap VO quickly without regenerating the whole scene. |
| Alternative for re-lipsync | `fal-ai/veed/lipsync` | ~$0.05/sec | VEED's competitor to `sync-lipsync`. Similar quality, try if the first one struggles with a specific face/lighting. |

**Default rule:** for the talking-character template we use `wan-25` (one API call instead of two). If a talking-head was already generated via regular `kling/v3/pro/i2v` (e.g. for silent scenes) and voice is needed later — `sync-lipsync`.

**Avoid:**
- Replicate `wav2lip` — needs `REPLICATE_API_TOKEN` (not in our env), visual quality below wan-25.
- `wan-25` with audio < 3 seconds — endpoint requires at least 3s of audio, otherwise it fails.
- `wan-25` with the face out of frame or strongly turned — lip-sync falls apart on a profile.

## Text-to-video (t2v)

| Purpose | Model | Price | Why |
|---|---|---|---|
| Default t2v | `fal-ai/veo3.1/text-to-video` | ~$0.50/sec | Best narrative generation without a reference frame. Use when there's no keyframe pipeline. |
| Cheap alternative | `fal-ai/kling-video/v3/pro/text-to-video` | ~$0.14/sec | Worse motion fidelity without an image, but 3x cheaper. |

**Default approach in this project:** we use i2v via keyframes (`nano-banana-pro/edit` → `kling/v3/pro/i2v`), not t2v. T2V only when explicitly needed (styles, abstractions).

## Voiceover (TTS)

| Purpose | Model | Price | Why |
|---|---|---|---|
| **Default for Russian** | ElevenLabs `eleven_multilingual_v2` | subscription | The only path to clean deadpan Russian without regional slip. User-owned voice clones work best. |
| English premium | ElevenLabs `eleven_v3` | subscription | Most emotional for English. Unstable on Russian, don't use for production. |
| Cheap alternative | OpenAI `tts-1-hd` | $0.030/1k char | English OK, Russian — dead/American accent. |

**Voice settings (deadpan young Russian):**
```json
{ "model_id": "eleven_multilingual_v2", "voice_settings": { "stability": 0.55, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": true }, "output_format": "mp3_44100_128" }
```

**Failure modes:**
- Default UA on Node 20+ → Cloudflare 403. Send `User-Agent: Mozilla/5.0 (...)`.
- Free/starter cap = 3 concurrent → 429. Run sequentially, not in parallel.
- Default library voices (`clyde-warvet`, `dave-british-mature`, `daniel-deep`) — all too theatrical for a deadpan 25-year-old. Use a custom clone.

## Music generation

| Purpose | Model | Price | Why |
|---|---|---|---|
| Default instrumental beds | `fal-ai/lyria2` | ~$0.10 / ~30s track | Accepts structured text prompts, instrumental-friendly. Use with a strong negative block (`no vocals, no lyrics, no human voice`). |
| Full tracks with vocals | Suno v4 (via their API, not fal) | $0.05–0.10/track | When you need lyrics. Not on fal yet. |

**Trend-music rule:** if a template references a specific trend track (`assets/trend-*.mp3`) — copy it, **don't generate a replacement via Lyria2**. Recognizability of the track is part of what drives a trend video.

## LLM (for skills and analytics)

**Provider routing.** All LLM/vision calls go through `cli/lib/providers/llm.ts` → `callLLM()`. The resolver picks the first provider by priority:

1. **Vercel AI Gateway** (`VERCEL_AI_GATEWAY_KEY`) — **recommended**. One key → hundreds of models (Gemini, Claude, GPT, Llama, embeddings). OpenAI-compatible endpoint `https://ai-gateway.vercel.sh/v1`. No token markup. Get one at: https://vercel.com/ai-gateway
2. **OpenRouter** (`OPENROUTER_API_KEY`) — fallback with the same interface, the proven path.
3. **OpenAI** (`OPENAI_API_KEY`) — last fallback, no Gemini (used only for GPT models).

**Use `callLLM()`, don't hardcode URLs.** Model IDs are the same on Vercel and OpenRouter (`google/gemini-2.5-flash`, `anthropic/claude-opus-4.6`, etc.).

| Purpose | Model | Why |
|---|---|---|
| Vision analysis of images/video (extract-social, extract-design, find-viral-moments, face-bbox) | `google/gemini-2.5-flash` | Cheap vision (~$0.001/frame), accurate enough for smart-crop and moment detection. Use `pro` if a long context is needed. |
| Deep vision (extract-design on complex landings) | `google/gemini-2.5-pro` | Best quality on long prompts + complex screens. ~3× more expensive than flash. |
| Scenarist / VO rewrite / feedback parsing | `anthropic/claude-sonnet-4.6` or `anthropic/claude-opus-4.6` | RU/EN at the same level, excellent nuance for editing. |
| Audio transcription (default) | OpenRouter **`openai/whisper-1`** via `cli/lib/transcribe.ts` | Uses the existing `OPENROUTER_API_KEY` — no extra setup, no local model download. Word-level timestamps via `timestamp_granularities=word` map directly to our caption components. ~$0.006 per audio-minute. ≤25MB per file (re-encode longer audio to 64kbps mono mp3). Use `ralphy project transcribe <id> --audio <path>`. |
| This chat | Claude Opus 4.7 | The one you're reading right now. |

**Avoid:**
- Direct `fetch("https://openrouter.ai/...")` in new scripts. We go through `callLLM()` so users can swap providers via `ralphy setup`.
- `OPENAI_API_KEY` for transcription — we route whisper-1 through OpenRouter so a single LLM key covers vision, scoring, and transcription.

## Fal.ai MCP — the working toolset

These MCP tools are available in this environment (deferred — call `ToolSearch` to load schemas before using):

- `mcp__fal-ai__search_models` — find a model by family. **Do this before every call to a family you already know.**
- `mcp__fal-ai__recommend_model` — for a new task without an explicit model.
- `mcp__fal-ai__get_model_schema` — check input/output params before the call.
- `mcp__fal-ai__get_pricing` — estimate batch cost.
- `mcp__fal-ai__submit_job` / `mcp__fal-ai__check_job` / `mcp__fal-ai__run_model` — actually invoke the model.
- `mcp__fal-ai__upload_file` — upload a local file to the fal CDN to pass as `image_urls` into edit models.
- `mcp__fal-ai__search_docs` — for nuances of a specific model.

## When to update this file

- On the first session in a new chat — check the `Last reviewed` date, run `search_models` against 2–3 key families, refresh if anything moved.
- After every failure mode on a new model — add to the "Avoid" section with the reason.
- When you change a default in skills/scripts — keep this in sync.
- At least once a month — even if nothing visibly broke.
