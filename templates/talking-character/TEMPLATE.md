# Talking Character UGC — Template

Single-character talking-head формат для TikTok / Reels / Shorts. Персона
говорит на камеру в одной локации; captions поверх video; instrumental
бэк-музыка ducked под VO. Длина 10-15 секунд.

Адаптировано из `docs.varg.ai/templates/talking-character` + наш стек (fal.ai
+ ElevenLabs RU + Remotion).

## Когда использовать

- Простой формат с одним персонажем "говорящим в камеру" (testimonial,
  problem-solution, demo).
- Hook + payoff помещаются в 10-15 секунд.
- Не нужно несколько сцен/локаций (для нарративных видео — `soviet-nostalgic`).

## Когда НЕ использовать

- Multi-scene narratives (используй `soviet-nostalgic` или новый template).
- Длинный VO > 30 секунд (wan-25 cap = 10s, придётся делить и stitch'ить).
- Полностью silent видео с overlay-text (не нужен lipsync — используй
  обычный `kling/v3/pro/i2v`).

## Pipeline (6 stages)

```
1. character-image     fal-ai/nano-banana-pro          ~$0.15 / 1 image
2. voiceover           ElevenLabs eleven_multilingual_v2  subscription
3. talking-video       fal-ai/wan-25                    ~$0.10/sec ($1.00 за 10s)
4. captions            Local whisper.cpp (cli/lib/transcribe.ts)  free
5. music               fal-ai/lyria2 (low bed)          ~$0.10 / 30s track
6. compose             Remotion 4.0.441                 free
```

Total cost per video: **~$1.30** (10 секунд) или **~$0.65** (5 секунд).

## Vibe (что определяет "talking-character")

- **Один кадр, одна локация** — никаких cut'ов между сценами.
- **Камера в руке / на штативе** — не cinematic, не commercial.
- **Persona в кадре с самого начала** — лицо в первой секунде = scroll-stop.
- **VO определяет ритм** — captions подстраиваются под VO (word-level через
  whisper.cpp), не наоборот.
- **Музыка тихая** (vol 0.1-0.15) — VO главный, music второстепенный.

## Constants (что НЕ меняется между проектами)

| Параметр | Значение | Причина |
|---|---|---|
| Aspect ratio | 9:16 (1080×1920) | Vertical short-form |
| Lipsync model | `fal-ai/wan-25` | Один вызов вместо kling+wav2lip |
| Talking video duration | 5 или 10 секунд (wan-25 cap) | Endpoint constraint |
| Audio minimum length | 3 секунды | wan-25 требует ≥3s |
| Default caption style | `TikTokCaptions` (word-by-word) | Retention-friendly |
| Music volume | 0.10-0.15 | VO должен быть главным |

## Variation axes (что МЕНЯЕТСЯ под бриф)

- **Persona archetype** — выбрать из `workspace/personas/ARCHETYPES.md`
  (см. `personaArchetypeFit` в `template.json` для лучших матчей).
- **Setting** — выбрать из `workspace/scenes/SETTINGS.md` под архетип.
- **Hook angle** — gatekeep / skeptic / fail / visual-shock
  (`workspace/hooks/HOOK_LIBRARY.md`).
- **Format** — testimonial / problem-solution / demo (один из 5).
- **Caption style** — любой из 12 в `src/lib/components/captions/`. Default
  TikTokCaptions, для чисто-словесного hook'a — HormoziCaptions.
- **Music vibe** — instrumental bed под mood'у (lo-fi для it-remote,
  ambient для wfh-worker, energetic для gen-z).

## Reading order при использовании этого темплейта

1. **TEMPLATE.md** (этот файл) — общий vibe + pipeline.
2. `model-stack.md` — точные модели и settings.
3. `fragments.md` — готовые prompt-фрагменты для каждой stage.
4. `composition.md` — Remotion-структура и какие компоненты импортить.
5. `reference-example.md` — конкретный пример (заполнится после первого
   использования).

## Quality gate

После сценария — обязательно `bun run ralph -- project score <id>` (см.
`docs/virality-rubric.md`):
- Hook в первые 3s ✓
- Total ≤ 15s ✓
- All `text_overlays` в Green Zone ✓
- `angle` ∈ {testimonial, problem-solution, demo} (для talking-character)

Не передавать в art-director без passed.

## Skill orchestration

```
/ralph-scenarist (читает TEMPLATE.md + HOOK_LIBRARY.md + ARCHETYPES.md)
  → scenario.json (hook.primary, angle, persona, single-scene structure)
  → bun run ralph -- project score <id>     ← гейт

/ralph-art-director (читает model-stack.md + fragments.md + SETTINGS.md)
  → prompts.json
  → assets/character.png (nano-banana-pro)
  → assets/voiceover/master.mp3 (ElevenLabs)
  → assets/video/talking.mp4 (wan-25 = lipsync built-in)
  → assets/music/bed.mp3 (lyria2)
  → asset-manifest.json

/ralph-editor (читает composition.md)
  → bun run ralph -- project transcribe <id> --audio assets/voiceover/master.mp3
  → captions.json
  → src/videos/<slug>/index.tsx (single Sequence + captions + music)
  → final.mp4
```
