# Models registry

Текущий узкий список моделей. **Только две API-ключи:** `OPENROUTER_API_KEY` для медиа/LLM/транскрайба, `ELEVENLABS_API_KEY` для голоса и музыки. Всё остальное — out.

> **Last reviewed: 2026-05-06.** Если файл старше 30 дней — перепроверь модели через OpenRouter.

## 🚨 Перед каждым вызовом

1. Открой эту таблицу — там текущий top-pick и причина выбора.
2. **Не хардкодь устаревшие версии моделей из памяти.** Версии моделей дрейфуют молча.
3. Если задача новая (нет в таблице) — НЕ выдумывай провайдера. Скажи юзеру что задача out-of-scope или требует расширения списка моделей.

---

## Image generation

| Назначение | Модель | Цена ориентир | Почему |
|---|---|---|---|
| **Default** — keyframes с консистентностью персонажа (multi-ref) | `google/gemini-3-pro-image-preview` (= nano-banana lineage) | ~$0.15/img | Лучший multi-reference: лицо/одежда держатся между сценами. PNG 2K 9:16. |
| **Premium** — высокое качество студийного фото | `openai/gpt-5.4-image-2` | ~$0.20/img | Лучшее качество фотореализма когда нет требования к multi-ref consistency. |

Все вызовы — через `cli/lib/providers/media.ts → generateImage()`, который ходит в OpenRouter. **Не использовать прямые fetch к fal.ai / openai.com.**

**Avoid:**
- Любые модели старше года (`stable-diffusion-xl`, `flux/schnell`, `dall-e-3`) — качество ниже текущих топов за те же деньги.
- `gpt-image-1` / `gpt-image-2` legacy — gpt-5.4-image-2 старше и стабильнее.
- Hardcoded fal.ai endpoints — вышли из стека в Sprint 2.

---

## Image-to-video (i2v)

| Назначение | Модель | Цена ориентир | Почему |
|---|---|---|---|
| **Default** narrative i2v | `kwaivgi/kling-v3.0-pro` | ~$0.14/sec | Лучшее движение в нашем pool, держит композицию keyframe, длительность до 15s. **`generate_audio: false` — обязательно для русской VO.** |
| **Premium** narrative t2v/i2v | `google/veo-3.1` | ~$0.50/sec | Лучшая narrative-генерация. Использовать когда keyframe-pipeline не подходит (style/abstraction) или для talking-head в `talking-head-rant` шаблоне. |
| **Fast/cheap** — резкое движение | `bytedance/seedance-2.0` | ~$0.10/sec | Быстрая физика (бег, падение, спорт). **Audio off** — у seedance-2.0 на русском украинский акцент. |

**Avoid:**
- `seedance-2.0` с `generate_audio: true` на русском → украинский акцент даже с LANGUAGE LOCK.
- `veo-3.1` с `generate_audio: true` → старый голос вместо молодого, текст рубится на ~4с из 8.
- `kling-v3.0-pro` с `generate_audio: true` на русском → docs подтверждают TTS только Chinese+English, остальное auto-translate.
- `kling-video/v1.6` или `v2.x` — устарели.
- `luma-dream-machine` — хуже kling за те же деньги.
- Любые fal.ai эндпоинты — стек ушёл на OpenRouter в Sprint 2.

---

## Voiceover (TTS)

| Назначение | Модель | Цена | Почему |
|---|---|---|---|
| **Default — русский** | ElevenLabs `eleven_multilingual_v2` | subscription | Единственный путь к чистому deadpan-русскому без региональной утечки. User-owned voice clones лучше всего. |
| **English premium** | ElevenLabs `eleven_v3` | subscription | Самый эмоциональный для английского. Нестабилен на русском — не используем в проде. |

**Voice settings (deadpan young Russian):**
```json
{ "model_id": "eleven_multilingual_v2", "voice_settings": { "stability": 0.55, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": true }, "output_format": "mp3_44100_128" }
```

**Failure modes:**
- Default UA на Node 20+ → Cloudflare 403. Шли `User-Agent: Mozilla/5.0 (...)`.
- Free/starter cap = 3 concurrent → 429. Sequentially, не parallel.
- Дефолтные библиотечные voices (`clyde-warvet`, `daniel-deep`, etc.) — слишком театральные. Custom clone обязателен.

**Avoid:**
- OpenAI `tts-1-hd` на русском — мёртвый американский акцент.
- ElevenLabs `eleven_v3` на русском в проде — нестабильно.

---

## Music generation

| Назначение | Модель | Цена | Почему |
|---|---|---|---|
| **Default** — instrumental beds | ElevenLabs Music (`music_v1`) | subscription (binary audio response) | Тот же ключ что для VO. **Validated 2026-05-06**: API endpoint `POST https://api.elevenlabs.io/v1/music` принимает `prompt`, `music_length_ms` (3000–600000), `force_instrumental: true`, `output_format` (e.g. `mp3_44100_128`). Auth header `xi-api-key`. Возвращает бинарный mp3. |

**Endpoint contract (для `cli/lib/providers/media.ts → generateMusic()`):**
```
POST https://api.elevenlabs.io/v1/music
Headers: xi-api-key: $ELEVENLABS_API_KEY, Content-Type: application/json
Body: { "prompt": "...", "music_length_ms": 30000, "force_instrumental": true, "output_format": "mp3_44100_128", "model_id": "music_v1" }
Response: 200 → binary mp3 (application/octet-stream)
         422 → JSON validation error
```

**Trend-music rule:** если шаблон отсылает к конкретному trend-треку (`assets/trend-*.mp3`) — копируй файл, **не генерируй замену**. Узнаваемость трека — половина того что делает trend-видео trend'ом.

**Fallback (если ElevenLabs Music даст плохое качество в проде):** временно вернуть `fal-ai/lyria2` через FAL_KEY как exception. Документировать здесь и в `cli/lib/capabilities.ts`. На 2026-05-06 — fallback не активирован, ElevenLabs Music — единственный путь.

**Avoid:**
- Suno (нет в OpenRouter).
- `lyria2` напрямую через FAL_KEY если ElevenLabs Music работает — не плодим опциональные ключи.

---

## Audio transcription

| Назначение | Модель | Цена | Почему |
|---|---|---|---|
| Default | OpenRouter `openai/whisper-1` через `cli/lib/transcribe.ts` | ~$0.006 per audio-minute | Один ключ покрывает всё. Word-level timestamps через `timestamp_granularities[]=word` мапятся на наши caption-компоненты. ≤25MB per file (re-encode длинное аудио в 64kbps mono mp3). Используй `ralphy project transcribe <id> --audio <path>`. |

**Avoid:**
- Локальный whisper.cpp — большой бинарь, никакой выгоды поверх облачного при наших объёмах.
- OpenAI direct API — мы маршрутизируем через OpenRouter чтобы один ключ покрывал vision + scoring + transcription.

---

## LLM (для скиллов и аналитики)

**Provider routing.** Все LLM/vision вызовы идут через `cli/lib/providers/llm.ts → callLLM()`. **Единственный провайдер — OpenRouter.**

| Назначение | Модель | Почему |
|---|---|---|
| Vision-анализ изображений/видео (extract-design, find-viral-moments, face-bbox, scoreImage, scoreVideo) | `google/gemini-2.5-flash` | Дешёвый vision (~$0.001/frame), точно достаточно для smart-crop и moment detection. Используй `pro` если нужен длинный контекст. |
| Глубокий vision (extract-design на сложных лендингах) | `google/gemini-2.5-pro` | Лучшее качество на длинных промптах + сложных скринах. ~3× дороже flash. |
| Scenarist / VO rewrite / feedback parsing | `anthropic/claude-sonnet-4.6` или `anthropic/claude-opus-4.6` | RU/EN на одном уровне, отлично нюансирует при правках. |
| Этот чат | Claude Opus 4.7 | Тот что ты сейчас читаешь. |

**Avoid:**
- Прямые `fetch("https://openrouter.ai/...")` в новых скриптах. Идём через `callLLM()` чтобы юзеры могли переключать провайдеров через `ralphy setup`.
- Хардкод `anthropic.com` или `openai.com` URL — всё через OpenRouter.

---

## Out-of-scope / dropped

Эти модели/семейства убраны в рамках OpenRouter consolidation (Sprint 1.3 / 2). Не возвращай их без явного апгрейда плана:

- `fal-ai/nano-banana-pro/edit` — заменено на `google/gemini-3-pro-image-preview` через OR.
- `fal-ai/flux-pro/v1.1-ultra`, `fal-ai/flux/dev/inpainting`, `fal-ai/flux-pro/v1.1-ultra/redux` — out.
- `fal-ai/luma-dream-machine/image-to-video` — out (хуже kling).
- `fal-ai/wan-25` — lipsync stage целиком dropped в v2 (no FAL_KEY pipeline).
- `fal-ai/sync-lipsync`, `fal-ai/veed/lipsync` — out.
- `fal-ai/lyria2` — out (fallback зарезервирован в Music секции).
- `fal-ai/seedream` — out.
- Replicate `wav2lip` — out (нет токена, нет stage).
- `openai/gpt-image-1`, `dall-e-3`, `stable-diffusion-xl`, `flux/schnell` — устаревшие.
- Apify — заменено на Playwright scraper в `/ralph-researcher` (отложено до v2).
- Higgsfield Soul, Fireworks Whisper — требуют отдельных ключей, нет в стеке.
- Vercel AI Gateway, прямой OpenAI API — single-provider OpenRouter в v2.

---

## Когда обновлять этот файл

- На первой сессии в новом чате — проверь `Last reviewed`, освежи если устарело.
- После каждого failure mode на новой модели — добавь в "Avoid" с причиной.
- Когда меняешь default в скиллах/скриптах — синхронизируй здесь.
- Минимум раз в месяц — даже если ничего не сломалось.
