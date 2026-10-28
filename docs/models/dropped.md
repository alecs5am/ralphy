# Dropped and out-of-scope models

Models we tried and dropped, and families removed from the stack. Linked from the [`MODELS.md`](../../MODELS.md) index. `ralphy models show <id>` surfaces the rows below that name an active model, and answers a lookup for a dropped id from this file.

## Tried-and-dropped (postmortem cross-reference)

Append-only: once a model is in this table, leave it. The next person trying the same swap reads this table first.

| Model | Context where it failed | Why | Postmortem |
|---|---|---|---|
| `bytedance/seedance-2.0` | photoreal-human i2v anchors | privacy filter `InputImageSensitiveContentDetected.PrivacyInformation` | tokyo, noski, venom |
| `kwaivgi/kling-v3.0-pro` multi-frame | first+last-frame i2v | `400 not in a valid base64 format` — mitigated 2026-05-19 by auto-C2PA-strip in `resolveImageRef()` | flipper, playdate, venom, glitter-cream |
| `kwaivgi/kling-v3.0-pro --audio` | non-English VO | accent slip + voice-age drift | noski, venom |
| `google/veo-3.1` | 15s+ clips | 8s cap; needed Kling 15s with `--audio` instead | kbo |
| `openai/gpt-5.4-image-2` | concurrent batches >1 | 403 "Key limit exceeded" — cap of 1 per OR key | appstore |
| `eleven_multilingual_v2` (Ava, Marcus) | analog-horror PSA monotone | too much human inflection — switched to "Alerter" community voice with stability~0.5 / style 0 | analog-horror |
| `kwaivgi/kling-v3.0-pro` for hyper-motion | 8-cut Japanese product ad | too narrative / slow for explosions; needed seedance physics | flipper |
| `google/gemini-3-pro-image-preview` | product-fidelity with embedded text (kanji buttons, LED digits) | smudges typography; gpt-5.4-image-2 holds it | flipper |
| Generic "1-bit / pixel-art" prompt vocabulary | duotone halftone aesthetic | ambiguous 3-way (1-bit vs 8-bit vs hand-illustrated); needed named-corpus refs | playdate |
| `bytedance/seedance-2.0` t2v + i2v anchor poster | spider-verse skater | image-anchor with baked-in-text confuses; pure t2v with strong subject-block worked | skater |

**Avoid:**
- `kling-video/v1.6` or `v2.x`: outdated.
- `luma-dream-machine`: worse than kling at the same price; out of OR catalog now.
- `fal-ai/*` endpoints: the stack moved to OpenRouter in Sprint 2.

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
- Apify — replaced with a Playwright scraper in `/researcher` (deferred to v2).
- Higgsfield Soul, Fireworks Whisper — require separate keys, not in the stack.
- Vercel AI Gateway, direct OpenAI API — single-provider OpenRouter in v2.
