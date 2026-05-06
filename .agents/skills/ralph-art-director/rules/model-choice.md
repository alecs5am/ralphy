# Model choice

**Single source of truth: `MODELS.md`.** Не хардкодь model-id из памяти.

## Decision tree

```
need: image
  → multi-ref (consistency between scenes) → google/gemini-3-pro-image-preview
  → premium фотореализм без жёсткой consistency → openai/gpt-5.4-image-2

need: video (i2v)
  → narrative default → kwaivgi/kling-v3.0-pro
  → premium narrative или talking-head → google/veo-3.1
  → быстрая физика, спорт, бег → bytedance/seedance-2.0

need: voiceover
  → русский → elevenlabs eleven_multilingual_v2
  → английский premium → elevenlabs eleven_v3

need: music
  → instrumental bed → ElevenLabs Music (model_id: music_v1, force_instrumental: true)

need: transcribe
  → openai/whisper-1 через cli/lib/transcribe.ts (OpenRouter)
```

## Cost preview

Перед батчем — **всегда** оценка вслух:

> "N keyframes × gemini-3-pro-image-preview ≈ $X.XX, M × kling-v3.0-pro × Ts ≈ $Y.YY, K VO calls ≈ $Z.ZZ, music 1× ≈ $W. Total ≈ $T. Run?"

Цены тяни из `MODELS.md` ориентиров. Реальные суммы — из `generations.jsonl.cost_usd` предыдущих запусков (Claude pricing knowledge stale).

## Inheritance from template

Если проект scaffold'ился из шаблона — **сначала читай `workspace/templates/<slug>/model-stack.md`**. Шаблон фиксирует proven combo + failure modes. Не отклоняйся без причины.

## Switching models mid-project

Когда меняешь модель посреди проекта (например kling → veo для сложного шота) — пиши причину в `note` следующего `logGeneration`:

> `note: "moved kling-v3 → veo-3.1 because v3 dropped hands on intricate gesture"`

## Out-of-scope (не вызывай)

- `fal-ai/*` — ушли в Sprint 2 (только OpenRouter + 11labs).
- `openai/dall-e-3`, `openai/gpt-image-1` — устаревшие.
- Replicate / Apify / Higgsfield / Fireworks — нет ключей в стеке.
- Хардкод URL `openrouter.ai` или `api.openai.com` — иди через `cli/lib/providers/`.
