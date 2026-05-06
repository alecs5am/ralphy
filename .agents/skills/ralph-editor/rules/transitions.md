# Transitions

## Default — `TransitionSeries`

Используй `@remotion/transitions` `TransitionSeries` с `<Sequence>` per scene. Дефолт для UGC:

- `fade` для smooth scene change (180ms / 6 frames @ 30fps)
- `slide` (direction: left | right) для наративных переходов
- `wipe` для retro/vhs vibe (только если шаблон того требует)
- `clockWipe` / `flip` — реже, для acceleration

См. `/remotion-best-practices` rules/transitions.md для полного API.

## Duration

- **30fps default** в этом проекте. 6 frames = 200ms — оптимум.
- Не используй >12 frames (400ms) — slow-feeling для UGC. <3 frames (100ms) — jarring.

## Hard rules

- **Аудио fade'ы в transitions:** 30ms fade-in/out для VO в boundaries сегментов чтобы не было click-pop.
- **Композиция transition'а на стыке сцен с разной background-яркостью:** `fade` через черный (`fadeWithBackground` color="#000") безопаснее чем direct fade.
- **Для talking-head шаблона** transitions между clips НЕ нужны — talking-head should look continuous. Используй `<Series>` без TransitionSeries.

## Hook-screenshot overlay

Если первые 3-4s содержат hook-screenshot (Reddit post, news headline) поверх videostream — компонент `HookScreenshot` из `src/lib/components/overlays/`. Fade-out последние 30 frames.

## Source

Все API детали — `/remotion-best-practices` rules. Не выдумывай TransitionSeries паттерны из памяти.
