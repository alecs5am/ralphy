# Pacing

## 15s formula (TikTok/Reels default)

```
0-3s   → hook (must land or scroll)
3-13s  → demo / content body
13-15s → CTA / button-press / outro
```

15s — наш default. Кратчайшая длина которая успевает сказать что-то осмысленное на TikTok без cuts. Можно 12-18s; ≥20s требует обоснования.

## Per-scene budget

- **Каждая сцена ≤ 3s** без internal cut. 3+ секунды одного шота на UGC = pacing dead.
- **Hook сцена ≤ 3s**, идеально 2s.
- **CTA сцена ≤ 2s** — пользователь либо тапнет, либо нет.

Если хочется 5s сцены — режь на 2 шота с micro-cut (jump cut, push-in, реверс) внутри одной narrative beat.

## Word budget per scene

**2.5 слова/сек** для RU deadpan VO. Считай слова в каждой VO-строке:

- Hook (2-3s) ≤ 5-7 слов
- Body scene (3s) ≤ 7-8 слов
- CTA (2s) ≤ 5 слов

Длинная VO в коротком shot'е = TTS compress'ит, звучит "торопливо" и "зажато".

## Total duration

`scenario.duration` или `scenario.durationSec` — top-level. Default 15. Range 10-25.

`durationFrames` рассчитывается editor'ом: `durationSec * fps` где `fps = 30` (наш default).

## Pacing patterns by angle

| Angle | Pattern | Notes |
|---|---|---|
| testimonial | hook → 2-3 reaction shots → CTA | сильнее с micro-zoom-in на лицо в reactions |
| unboxing | tease → reveal → reaction → use | первая 1s именно "tease" — упаковка обязательна |
| problem-solution | pain (5s) → product (10s) | максимум 5s на pain — иначе скролл |
| comparison | A (3s) → B (3s) → A vs B (5s) → CTA | парная композиция, симметричные shots |
| demo | quick teaser → 3-4 demo beats → result | каждый beat 2-3s |

## Cut cadence

Чем быстрее cuts — тем выше completion rate. Среднее на TikTok 1 cut в 2.0s (≈7 cuts на 15s). Меньше cuts — feel'ит slow для младшей аудитории; больше — disorienting.

Для talking-head шаблона эта правило не работает — talking-head должен continuous, transitions = death of immersion.

## Pacing gate

`scoreScenario` warning (не fail) если:
- сцена > 3s без internal cut → warning
- total duration > 18s → warning (не fail если есть obvious narrative reason)

Hard fails (не warning):
- total duration > scenario.duration
- hook scene > 3s
- нет VO в content scene (silent: true должен быть explicit)

## Special: podcast clips / repurpose

`workspace/projects/lyadov-podcast-001/` — реальный кейс. 16:9 source → 9:16 cuts по viral moments. Длительность каждого clip 15-60s (`find-viral-moments` enforce). Это **исключение** из 15s rule — explicit podcast-mode флаг в scenario.
