# Model stack — ai-vegetables

Order of operations + конкретные модели через OpenRouter / ElevenLabs. v2 стек (no FAL_KEY).

## Stage 1 — Keyframes

**Model:** `google/gemini-3-pro-image-preview` через OpenRouter
**Cost:** ~$0.15/img
**Why:** лучший multi-reference для consistency между сценами одного овоща (если нужно). Photorealistic vegetable приходит чисто.

```bash
ralphy generate image \
  --project <id> --slot scene-01-bg \
  --prompt "<vegetable fragment> + <setting fragment> + camera details" \
  --model google/gemini-3-pro-image-preview \
  --size 1080x1920
```

Если нужен consistency между сценами — генери "character ref" первым (просто овощ на нейтральном фоне), потом передавай URL в `--ref` для всех остальных keyframes.

## Stage 2 — i2v (video)

**Model:** `kwaivgi/kling-v3.0-pro` через OpenRouter
**Cost:** ~$0.14/sec
**Duration:** 5 секунд per clip (default; 10s если сцена требует развития)
**Audio:** `generate_audio: false` (всегда — VO добавим отдельно)

```bash
ralphy generate video \
  --project <id> --slot scene-01-vid \
  --image <keyframe-url> \
  --prompt "subtle handheld shake, vegetable performs <action>, slight push-in 5%, no morphing of limbs" \
  --duration 5 \
  --model kwaivgi/kling-v3.0-pro
```

**Avoid:** seedance (audio leak), veo (overkill для absurd content и 3× дороже).

## Stage 3 — Voiceover

**Model:** ElevenLabs `eleven_multilingual_v2`
**Voice:** user-chosen clone (deadpan young Russian); если нет — fallback на library voice but flag user that это даст lower quality.
**Settings:** stability 0.55, similarity 0.8, style 0.25, use_speaker_boost: true.

```bash
ralphy generate voiceover \
  --project <id> --slot scene-01-vo \
  --voice <voiceId> \
  --text "POV: ты огурец и опоздал на маршрутку"
```

VO короткие — 1 фраза на сцену, ≤ 7 слов. Не растягивай.

## Stage 4 — Captions

**Model:** OpenRouter `openai/whisper-1`
**Cost:** ~$0.006/audio-min ≈ $0.001 для 15s видео.

```bash
ralphy generate captions \
  --project <id> \
  --audio workspace/projects/<id>/assets/voiceover/master.mp3 \
  --language ru
```

Output: `captions.json` (Caption[] format).

## Stage 5 — Music

**Model:** ElevenLabs Music `music_v1`
**Cost:** subscription
**Duration:** total video duration + 2s tail для fade-out.

```bash
ralphy generate music \
  --project <id> --slot music-bed \
  --prompt "<music fragment from fragments.md>" \
  --duration 17
```

## Stage 6 — Compose + render

**Composition:** `src/videos/<project-slug>/index.tsx` (per-project) или base `UGCVideo`.
**Render:** `ralphy render <id>` (≤30s wall time для 15s видео).

```bash
ralphy render <id> --loudnorm   # EBU R128 for TikTok
```

## Cost rollup (15s video, 4 scenes)

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 4× gemini-3-pro-image-preview | $0.60 |
| Video clips | 4× kling-v3.0-pro × 5s | $2.80 |
| VO | 4 calls (subscription) | $0 |
| Captions | whisper-1 | $0.001 |
| Music | ElevenLabs Music (subscription) | $0 |
| Render | local | $0 |
| **Total** | | **~$3.40** |

Дешевле чем soviet-nostalgic ($10-12) — нет dual-music, нет era-flip, короче clips.

## Fallback / overrides

- Если consistency между сценами не нужна (single-scene видео) → можно `openai/gpt-5.4-image-2` ($0.20/img) для photorealistic качества. Но обычно gemini-3-pro-image хватает.
- Если нужно сложное движение (acrobatics, multi-character) → veo-3.1 ($0.50/sec). Но для этого формата overkill.

## Quality gate thresholds

- `scoreImage` avg ≥7 — иначе regen (max 2 attempts).
- `scoreVideo` motion ≥5 — иначе scene не проходит (warping limbs).
- Если 2 fails подряд — стоп, пользователю concrete options.
