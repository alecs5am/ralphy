# AI Vegetables POV — vibe reference

**Жанр:** surrealistic POV-видео с AI-овощами в человеческих ситуациях.
**Длительность:** 12-18s (default 15).
**Формат:** TikTok 9:16, 30fps, 1080×1920.

> Этот template — **vibe-anchor**, не fill-in-the-blank. `/ralph-scenarist` пишет сценарий заново для каждого проекта используя этот файл + `reference-example.md` как vibe-источники.

## Why this format works

Виральный пик жанра в 2025-2026: антропоморфные овощи делают то что делают люди. Срабатывает потому что:

1. **Visual shock в первые 2 секунды** — мозг не ожидает увидеть огурец, бегущий к маршрутке.
2. **Универсально-понятный setup** — каждый ездил в метро / стоял в очереди / опаздывал.
3. **POV trigger** — "POV: ты огурец и опоздал на работу" — зритель проецирует себя на овощ.
4. **Short-form sweet spot** — формат не растягивается; ровно 15s закрывает гешт ало.

## Vibe anchors

- **Photorealistic vegetable, не cartoon.** Сетки текстур огурца, реалистичные блики, AI-сгенерённые но достоверные. **Не Pixar-стилизация.**
- **Slight anthropomorphic proportions** — у огурца "руки" и "ноги" появляются органично из тела (как у Mr. Bean мысленно — не cartoon приставки).
- **Real-world setting** — настоящие локации (метро, кухня, офис), не fantasy world.
- **Deadpan tone** — VO без иронии в голосе. Ситуация смешная сама по себе.

## Variation axes (что меняем между видео)

| Ось | Варианты |
|---|---|
| Овощ | cucumber, tomato, carrot, potato, eggplant, pepper, onion, broccoli |
| Setting | subway/метро, kitchen, office, gym, dating, traffic jam, queue, hospital |
| Human action | running for transport, working, dating, working out, doctor visit, queue |
| Emotional tone | deadpan, frustrated, ecstatic, melancholic, panicked |

## Narrative arc (как форма, не prescription)

```
0-2s   → Hook: visual shock cold open. Овощ В неожиданной ситуации.
2-7s   → Setup: что происходит, какое чувство овощ испытывает (POV).
7-13s  → Escalation: ситуация развивается / усложняется.
13-15s → Punchline / CTA / outro: смешной финал или "POV: ты <овощ>"
```

## Required user inputs (минимум для запуска)

1. **Овощ** — какой именно. (Если не сказали — используй `random` из cucumber/tomato/carrot.)
2. **Brief** — ситуация в 1-2 строки. ("огурец опоздал на маршрутку")
3. **Tone** — deadpan / dramatic / panicky. (default: deadpan)

Всё остальное — derives из этих трёх через `/ralph-scenarist`.

## When NOT to use

- Brand promo с required logo placement (овощ не несёт бренд естественно).
- Серьёзный narrative format > 20s (overstays welcome).
- Educational / how-to (формат под комедию).
- Сценарий требует диалог двух персонажей (одного овоща хватает).

## Cost ballpark per video

- 3-4 keyframes × $0.15 = $0.45-0.60
- 3-4 video clips × kling-v3.0-pro × 5s = $0.14 × 5 × 4 = ~$2.80
- 3-4 VO calls (subscription, не per-call) = $0
- Music 1× ElevenLabs Music = $0
- Render local = $0
- **Total: ~$3-4 per video** (cheaper than soviet-nostalgic из-за коротких clips и нет dual-music)

## Read also

- `fragments.md` — reusable prompt seeds для овощей и settings.
- `model-stack.md` — order of operations.
- `composition.md` — Remotion skeleton.
- `reference-example.md` — placeholder, заполнится после первого реального запуска.
