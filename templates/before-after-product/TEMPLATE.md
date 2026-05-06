# Before / After Product — vibe reference

**Жанр:** классический UGC ad — 5s pain point → 10s product solution / transformation.
**Длительность:** 15-18s.
**Формат:** TikTok 9:16, 30fps.

> **Reference-required gate.** Если scenario упоминает named brand / product — должен быть референс (фото / лого / упаковка) в `workspace/projects/<id>/assets/uploaded/`. Без рефа `/ralph-art-director` refuse'нет (см. AGENTS.md hard rule #3).

## Why this works

Самый старый и самый proven UGC ad pattern:

1. **5 секунд боли** — relatable / specific / эмоциональный — viewer узнаёт себя.
2. **Product/решение появляется на 5-секундной отметке** — момент relief.
3. **10 секунд показа решения** — достаточно чтобы убедить, не overstays.
4. **Tonal arc** в VO + музыке — frustrated → satisfied. Aural reward для зрителя.

## Vibe anchors

- **Pain point — конкретный, не abstract.** "Туалетная бумага рвётся когда тянешь" > "проблемы с гигиеной".
- **Reveal — момент, не длительный шот.** 0.5-1s product appears clearly, потом demo.
- **Не over-promise.** "Стало лучше" > "Революция в индустрии".
- **Real environment** — не studio. Кухня / ванная / спальня / офис в зависимости от продукта.
- **Reference-anchored visuals** — product look exactly как в user's reference, не AI-improvised.

## Variation axes

| Ось | Варианты |
|---|---|
| Product category | cosmetics, food, software, service, fitness, household, fashion |
| Pain point specificity | vague-universal ("вечно устаю") vs niche-specific ("у пасты пятна на зубах") |
| Reveal style | gradual (продукт появляется в кадре) vs dramatic (smash-cut) |
| Voice emotion arc | frustrated→relieved / skeptical→amazed / exhausted→energized |

## Narrative arc

```
0-2s   → Pain hook: visual of problem in action. VO: relatable line.
2-5s   → Pain reinforcement: 1-2 micro-failures or frustrations.
5-6s   → Reveal: product appears (product shot ИЛИ user holding it).
6-12s  → Demo: 2-3 micro-proofs that it works (transformation, before/after split, satisfied user reaction).
12-15s → CTA / outro: product name shown, tagline, или happy user shot.
```

## Required user inputs

1. **Product** — название + category.
2. **Pain point** — что он решает.
3. **Reference** — фото продукта / упаковки / лого. **REQUIRED.** Без него refuse.
4. **(Optional) Tone** — frustrated→relieved (default) / skeptical→amazed / exhausted→energized.

## Reference-required gate (хард)

Если brief упоминает specific brand / product без `assets/uploaded/<product-ref>.<ext>`:

> "Brief упоминает '<product>' — нужен референс (фото / лого / упаковка). Скинь сюда либо смени на безличный case ('эта губка', 'какое-то средство'). Без референса делать не буду — выйдет AI-slop с неправильным лого / упаковкой."

## When NOT to use

- Service product без visual ("консультация юриста") — нечего показывать в reveal.
- Pure-software (e.g. SaaS) без UI screenshots — reveal слабый.
- Brand awareness (не conversion) — этот формат заточен под конверсию.
- Длительность > 25s.
- Multiple SKU — один product per video.

## Cost ballpark

- 3-4 keyframes × $0.15 = $0.45-0.60
- 3-4 video clips × kling × 5s = $2.10-2.80
- VO (subscription) = $0
- 2× music (2 ElevenLabs Music calls, subscription) = $0
- Captions (whisper-1) = $0.001
- Render = $0
- **Total: ~$2.50-3.50 per video**

(Cheap formate — короткие clips + subscription audio.)

## Read also

- `fragments.md` — pain-point fragments + product placement recipes + tone-shift patterns.
- `model-stack.md` — concrete commands.
- `composition.md` — dual-music split + caption-style split.
- `reference-example.md` — placeholder.
