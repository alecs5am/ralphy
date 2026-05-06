# Quality gate

**Hard rule (inherited from `AGENTS.md`):** quality gates refuse, не warn. Два провала подряд → стоп + concrete options. Не рендерим mp4 поверх failed gate.

## Three checks

Все живут в `cli/lib/quality.ts`. Возвращают `{ passed: boolean, failures: string[], warnings: string[] }`.

### `scoreScenario(scenario)` — non-LLM checklist

Триггер: после `prepare-prompts`. Запуск через `ralphy project score <id>`.

Что проверяется:
- хук в первые 3 секунды (есть `hook` поле или scene-01 имеет text_overlay с hook formula)
- ≤15 секунд total duration
- каждая сцена имеет VO (или явно `silent: true`)
- нет green-zone violations для text_overlay (см. `docs/green-zone.md`)
- нет именованной персоны без `image_urls` ref (ref-photo gate)

### `scoreImage({ path, slot })` — LLM-vision

Триггер: после `ralphy generate image` (автоматом если флаг `--gate` или дефолтно после Sprint 4).

Использует `google/gemini-2.5-flash` через `callLLM()`. Промпт:
> "Rate this image on three axes 1-10: clarity (sharpness, no artifacts), composition (subject framed, no awkward crops), on-prompt fidelity (matches given prompt). Return JSON: { clarity, composition, fidelity, comment }."

Pass: average ≥7. Fail: average <7.

### `scoreVideo({ path, slot })` — LLM-vision на 3 frames

Триггер: после `ralphy generate video`.

Те же 3 оси + motion-stability (нет морфинга лица, рук) + audio-sync (если есть аудио). Кадры извлекаются через ffmpeg на `0%`, `50%`, `100%` durations, vision-call по каждому, агрегируется avg.

## Failure handling

**Один fail:** автоматический регенерат с легко изменённым входом (новый seed; если seed уже менялся — model swap; если model swap уже был — slight prompt rewrite).

**Два fails подряд:** **STOP.** Не делаем тихий третий проход.

Шаблон отчёта пользователю:

> "Не могу выдать качественную картинку для slot `<id>` (попыток: 2, последний avg score: <n>/10).
> Опции:
> a) скинь reference получше — сейчас в `assets/uploaded/` нет матчащего фото для этой сцены;
> b) сменим модель (текущая `<m>`, можно попробовать `<premium>`);
> c) сменим shot — например с close-up на medium, или другой angle.
> Что делаем?"

## Pre-render check

Перед `ralphy render <id>` — финальный sweep: для каждого слота в `asset-manifest.json` проверь `score >= 7` (или `score: null` означает gate ещё не прогонялся → запусти).

Если хоть один слот < 7 — refuse render с тем же шаблоном (но указать конкретный slot).

## Suppressing the gate

Пользователь может явно запросить bypass:
> "пропусти quality gate, рендерь что есть"

Логируем как `stage: "gate-bypass-consent"`, продолжаем. Это редкий случай — обычно проще регенерировать.
