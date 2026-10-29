# Models registry

A short, opinionated list of the models we actually use. **Two API keys only:** `OPENROUTER_API_KEY` for media / LLM / transcription, `ELEVENLABS_API_KEY` for voice and music (plus the registered `fal` connector's `FAL_KEY` for the two fal reference-to-video models). Everything else is out of scope.

This file is the **index**: one row per model with its role and price. Per-model detail (capabilities, limits, quirks, lessons) lives in [`docs/models/`](docs/models/image.md), one file per kind, and `ralphy models show <id>` prints it one model at a time.

> **Last reviewed: 2026-05-08** (video prices, 4K availability and the Sora retirement rechecked against the OpenRouter catalog on 2026-10-30, #568). If this file is older than 30 days, recheck OpenRouter — model versions change without notice. The catalog is the source of truth for video parameters; pull it with `ralphy models list` (24h cached).

## How to use this file

1. **Before any model call**, pick the model from the tables below, then run `ralphy models show <id>`. It prints that model's detail section plus every shared rule that names it (routing rules, `--audio` policy, concurrency caps, tried-and-dropped rows). Shorthand works (`kling`, `nano banana pro`, `eleven_v3`). Do not read the `docs/models/` files whole.
2. **For video**, `ralphy models show <id>` also returns the live `supported_durations`, `supported_resolutions`, `supported_aspect_ratios`, `supported_frame_images` from OR (`--no-catalog` skips the network). Don't hand-pick parameters that aren't in those arrays; the submit will fail validation (`ralphy generate video` runs the check pre-flight; bypass with `--no-validate`).
3. **Before spending**, `ralphy models preflight --kind <k> --model <id> …` checks the known per-model caps offline, and every video gen accepts `--dry-run`. It prints the resolved request body and cost estimate without spending credits.
4. **If the task is new** (not in this file) — DO NOT invent a provider. Tell the user the task is out of scope or needs a model-list extension.

`ralphy models list --registry` prints this index as JSON; `ralphy models list` prints the live OpenRouter video catalog.

## Image

Detail: [`docs/models/image.md`](docs/models/image.md).

| Model | Role | Price |
|---|---|---|
| `google/gemini-3-pro-image-preview` | **Default** — multi-ref / character consistency (nano-banana-pro lineage); photoreal scientific / medical imaging | ~$0.15 / image |
| `openai/gpt-5.4-image-2` | Premium typography / label accuracy; body-horror anchor frames | ~$0.20 / image |
| `openai/gpt-5-image-mini` | Budget OpenAI — cheap iteration during prompt exploration | ~$0.08 / image |
| `google/gemini-2.5-flash-image` | Cheapest viable — smoke tests only | ~$0.02 / image |

## Video

Detail: [`docs/models/video.md`](docs/models/video.md). Prices are per second of billed clip; `✓` = verified against OR billing.

| Model | Role | Price |
|---|---|---|
| `kwaivgi/kling-v3.0-pro` | **Default narrative i2v** — character consistency, keyframe hold, photoreal humans, lip-sync, photoreal + body-horror | $0.112/s silent, $0.168/s audio ✓ (OR catalog + billing, 2026-10) |
| `kwaivgi/kling-v3.0-std` | Cheap batch where keyframe drift is acceptable (cheaper than pro on OR since 2026-10) | $0.084/s silent, $0.126/s audio (OR catalog 2026-10-30) |
| `kwaivgi/kling-video-o1` | Kling tier with 5 / 10 s clips only | $0.112/s (OR catalog 2026-10-30) |
| `google/veo-3.1` | Talking-head / face / EN on-camera dialogue with `--audio` (8 s cap) | $0.20/s silent, $0.40/s audio (OR catalog 2026-10-30) |
| `google/veo-3.1-fast` | 4K mastered hero piece (4K also on `veo-3.1` and `seedance-2.0` as of 2026-10-30) | $0.10/s silent, $0.12/s audio; 4K $0.25 / $0.30 (OR catalog 2026-10-30) |
| `google/veo-3.1-lite` | Cheapest acceptable batch for non-photoreal-human work | $0.05/s silent, $0.08/s audio (OR catalog 2026-10-30) |
| `openai/sora-2-pro` | **Retired** — OpenAI shut the Sora 2 API down on 2026-09-24; absent from the OR catalog (2026-10-30). Do not call | — |
| `minimax/hailuo-2.3` | 1080p, 16:9 only, first-frame anchor only | $0.0817/s (OR catalog 2026-10-30) |
| `alibaba/wan-2.6` | 5 / 10 s, first-frame anchor only | ~$0.10/s |
| `alibaba/wan-2.7` | 3:4 / 4:3 portrait magazine aspects (only model with them) | ~$0.10/s |
| `bytedance/seedance-2.0` | Hyper-motion physics, 21:9 cinema, first + last frame anchoring, multi-ref R2V; non-photoreal subjects only | $0.14/s ✓ |
| `bytedance/seedance-2.0-fast` | Cheapest viable in the pick table | $0.14/s ✓ |
| `bytedance/seedance-1-5-pro` | Older seedance tier (4-12 s) | ~$0.10/s |
| `bytedance/seedance-2.0/reference-to-video` | fal connector — reference-VIDEO restyle, accepts real-human-face reference video | $0.3034/s @720p (×0.6 with video refs) |
| `fal-ai/kling-video/o3/pro/reference-to-video` | fal connector — Kling O3 omni, character consistency via elements; no video input | $0.112/s audio-off, $0.14/s audio-on |

## Voiceover

Detail: [`docs/models/voiceover.md`](docs/models/voiceover.md).

| Model | Role | Price |
|---|---|---|
| `elevenlabs/eleven_multilingual_v2` | **Default — Russian**; clean deadpan RU with user-owned voice clones | subscription |
| `elevenlabs/eleven_v3` | English premium — most emotional EN; unstable on RU | subscription |

## Music

Detail: [`docs/models/music.md`](docs/models/music.md).

| Model | Role | Price |
|---|---|---|
| `elevenlabs/music_v1` | **Default** — instrumental beds (ElevenLabs Music) | subscription |

## Transcription

Detail: [`docs/models/transcription.md`](docs/models/transcription.md).

| Model | Role | Price |
|---|---|---|
| `elevenlabs/scribe_v1` | **Default** — word-level captions for compositions | ~$0.004 / audio-minute |
| `openai/whisper-1` | Fallback through OpenRouter when ElevenLabs is down | ~$0.006 / min |

## LLM

Detail: [`docs/models/llm.md`](docs/models/llm.md). All calls go through `callLLM()` on OpenRouter.

| Model | Role | Price |
|---|---|---|
| `google/gemini-2.5-flash` | Vision analysis of images / videos (cheap) | ~$0.001 / frame |
| `google/gemini-2.5-pro` | Deep vision, long prompts, complex screenshots | ~3× flash |
| `google/gemini-3.1-pro-preview` | Video analysis via `callLLM` (vision-trim, ref analysis) | — |
| `anthropic/claude-sonnet-4.6` | Scenarist / VO rewrite / feedback parsing | — |
| `anthropic/claude-opus-4.6` | Scenarist / VO rewrite / feedback parsing (premium) | — |

## Dropped and out of scope

[`docs/models/dropped.md`](docs/models/dropped.md) holds the append-only tried-and-dropped table and the families removed during the OpenRouter consolidation. `ralphy models show <dropped-id>` answers from it.

## When to update this file

- On the first session in a new chat: check `Last reviewed`, refresh if stale.
- After every failure mode on a new model: add it to that model's section in `docs/models/<kind>.md` (failure modes / lessons) with the reason. A model that fails out also gets a tried-and-dropped row.
- When you change a default in a skill or script: sync the index row here.
- When you add a verb to `ralphy generate` or a flag: sync the price / param notes in the detail file.
- New model: add the index row here AND a `` ## `<id>` `` section in `docs/models/<kind>.md`. `tests/unit/models-registry.test.ts` fails when the two disagree, and a new detail file must also be embedded in `cli/lib/models/registry.ts`.
- At least once a month, even if nothing broke.
