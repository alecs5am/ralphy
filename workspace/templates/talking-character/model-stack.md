# Model stack — talking-character template

Конкретные модели, версии, settings и failure modes для каждого pipeline-stage.
Источник: `MODELS.md` + опыт первых проектов на этом темплейте.

## Stage 1: Character image

**Model:** `fal-ai/nano-banana-pro` (text-to-image, без `image_urls`).

**Зачем нано-банана а не flux:** для talking-character нужно одно лицо
(не серия), но это лицо потом подаётся в `wan-25` как face-reference. Если
лицо плывёт между прогонами — lipsync разваливается. nano-banana даёт
самое стабильное single-shot лицо.

**Settings:**
```json
{
  "image_size": "portrait_16_9",
  "num_images": 1,
  "output_format": "png"
}
```

**Prompt structure:**
```
[archetype-specific appearance from ARCHETYPES.md] +
[scene-setting from SETTINGS.md] +
"close-up portrait, looking directly at camera, natural expression,
shallow depth of field, vertical 9:16, 4k photo"
```

**Failure modes:**
- Слишком "красивое" / pro-photographer лицо — выглядит как stock. Добавляй
  "imperfect skin", "tired eyes", "casual no-makeup look" для UGC vibe.
- Лицо в профиль / 3/4 — `wan-25` плохо лип-синкает не-фронтальное лицо.
  Всегда проси "facing camera, eye contact".

## Stage 2: Voiceover

**Model:** ElevenLabs `eleven_multilingual_v2` (см. MODELS.md → Voiceover).

**Settings (deadpan young Russian):**
```json
{
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.55,
    "similarity_boost": 0.8,
    "style": 0.25,
    "use_speaker_boost": true
  },
  "output_format": "mp3_44100_128"
}
```

**Voice ID:** из `persona.voice.voiceId` (user's voice clone preferred). Default
library voices слишком театральные.

**Constraints:**
- Total VO ≤ 10 секунд (cap у wan-25). Если хук+payoff не помещаются —
  rework сценарий, не делить на части.
- Audio ≥ 3 секунды (минимум wan-25). Если VO короче — добавить начало или
  отправлять padding-тишину.

## Stage 3: Talking video (lipsync built-in)

**Model:** `fal-ai/wan-25` (image + audio → talking-head video).

**Settings:**
```json
{
  "image_url": "<fal-uploaded character.png>",
  "audio_url": "<fal-uploaded voiceover.mp3>",
  "prompt": "<motion description, see fragments.md>",
  "duration": 10,                  // 5 или 10 (только эти)
  "resolution": "720p"             // 480p / 720p / 1080p
}
```

**Prompt fragment template** (из `fragments.md`):
```
front-facing camera selfie POV, handheld phone in front of face with subtle
natural wobble, subject in sharp focus with softly blurred background shallow
depth of field, [scene-specific lighting from SETTINGS.md], conversational
audio with [setting-specific ambient noise]
```

**Failure modes:**
- Audio < 3s → endpoint падает. Минимум 3 секунды pure VO.
- Profile face / повёрнутое лицо → губы не синхронизируются. Только
  фронтальные кадры.
- Resolution `1080p` стоит дороже но визуально лучше — для production
  default `720p`, для финального release `1080p`.

## Stage 4: Captions

**Tool:** Local whisper.cpp через `cli/lib/transcribe.ts`. **No API key.**

**Command:**
```bash
bun run ralph -- project transcribe <id> \
  --audio workspace/projects/<id>/assets/voiceover/master.mp3 \
  --language ru
```

**Output:** `workspace/projects/<id>/captions.json` — `Caption[]` в формате
`@remotion/captions`. Word-level timestamps включены (`tokenLevelTimestamps:true`,
`splitOnWord:true` — built into transcribe.ts).

**Component choice (composition.md решит):**
- Default: `TikTokCaptions` — крупный word-by-word поп.
- Для bombshell-стиля: `HormoziCaptions` — yellow accent на ключевые слова.
- Для спокойного: `MinimalCaptions` — без эффектов.

## Stage 5: Music

**Model:** `fal-ai/lyria2` (instrumental bed).

**Prompt structure:**
```
"[mood-adjective] instrumental, [genre], steady tempo,
no vocals, no lyrics, no human voice, ambient background loop, [duration]s"
```

**Defaults:**
- Volume в композиции: **0.10-0.15** (ducked под VO)
- Fade-in: 0.5s
- Fade-out: 1.0s

**Mood mapping (по архетипу):**
- `it-remote` / `wfh-worker` → lo-fi, ambient, soft synths
- `startup-founder` / `marketer-perf` → minimal electronic, deep house
- `gen-z-energy` → trap drums, energetic
- `mom-blogger` → soft acoustic, warm pad

**Trend-music exception:** если хук attaches к конкретному trending track —
**копируй файл, не генерируй**. Узнаваемость = алгоритмический buff.

## Stage 6: Composition (Remotion)

**Composition:** `src/videos/<slug>/index.tsx`. См. `composition.md` для
структуры.

**Key library imports:**
- `<TikTokCaptions />` или `<HormoziCaptions />` из `src/lib/components/captions/`
- `<OffthreadVideo />` из `remotion` для talking-head
- `<Audio />` для music + duck через `volume={interpolate(...)}`

## Cost summary

| Stage | Cost |
|---|---|
| character-image | $0.15 |
| voiceover | subscription (≈$0.05 для 10s VO) |
| wan-25 (10s, 720p) | $1.00 |
| captions | $0 (local) |
| music (30s) | $0.10 |
| compose/render | $0 (local) |
| **Total** | **~$1.30** per video |
