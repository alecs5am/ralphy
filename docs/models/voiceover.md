# Voiceover (TTS) models: detail

Per-model detail for the voiceover rows in the [`MODELS.md`](../../MODELS.md) index. Do not read this file whole: `ralphy models show <id>` prints one model's section plus every shared note below that names it.

## Shared notes

### Failure modes (all ElevenLabs voices)

- Default UA on Node 20+ → Cloudflare 403. Send `User-Agent: Mozilla/5.0 (...)`.
- Free/starter cap is 3 concurrent → 429. Run sequentially, not in parallel.
- Default library voices (`clyde-warvet`, `daniel-deep`, etc.): too theatrical for RU. A custom clone is mandatory for RU production.

### Avoid

- OpenAI `tts-1-hd` on Russian — flat American accent.
- ElevenLabs `eleven_v3` on Russian in production — unstable.

## `elevenlabs/eleven_multilingual_v2`

ElevenLabs model id `eleven_multilingual_v2`. The only path to clean deadpan Russian without regional accent slip. User-owned voice clones work best.

**Voice settings (deadpan young Russian):**
```json
{ "model_id": "eleven_multilingual_v2", "voice_settings": { "stability": 0.55, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": true }, "output_format": "mp3_44100_128" }
```

## `elevenlabs/eleven_v3`

ElevenLabs model id `eleven_v3`. Most emotional for English. Validated 2026-05-08 against the brainrot test (Adam preset, dramatic narrator, 45-55s). **Unstable on Russian; don't use in production for RU.**

**Voice settings (English brainrot dramatic narrator):**
```json
{ "model_id": "eleven_v3", "voice_settings": { "stability": 0.30, "similarity_boost": 0.75, "style": 0.40, "use_speaker_boost": true } }
```
Voice picks: Adam (`pNInz6obpgDQGcFmaJgB`) for dramatic narrator, Brian (`nPczCjzI2devNBz1zQrb`) for Reddit-monotone, Daniel (`onwK4e9ZLuTAKqWW03F9`) for British-sarcastic.

- VO drift: dramatic narration on `eleven_v3` consistently runs **~15-25% longer than scripted word-count would suggest** (Strasbourg 45s scenario rendered at 54.6s). Time-budget compositions to actual VO duration via `ralphy project transcribe`, not scenario text length.
