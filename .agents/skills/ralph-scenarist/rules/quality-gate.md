# Quality gate (scenario)

**Hard rule (inherited from `AGENTS.md`):** quality gates refuse, не warn. Перед handoff в `/ralph-art-director` — обязательный gate.

## Tool

```bash
ralphy project score <id>
```

Под капотом — `cli/lib/quality.ts` → `scoreScenario(scenario)`. Non-LLM check (быстрый, дешёвый, детерминированный).

## Что проверяется

### Hard fails (block handoff)

1. **`hook.primary` есть** — non-empty string, ≤10 слов.
2. **`angle` ∈ {testimonial, unboxing, problem-solution, comparison, demo}** — top-level field обязателен.
3. **Первая сцена ≤ 3s** — hook должен land в 1-3s window.
4. **Total duration ≤ scenario.duration** или 15s default — если scenes сумма больше → fail.
5. **Каждая сцена имеет VO** или explicit `silent: true`. Молча-немая сцена без флага = bug.
6. **Все `text_overlay` внутри green zone** — X 60-960, Y 210-1480 для каждого overlay.
7. **Persona/brand reference policy** — если scene содержит named persona/brand без `image_urls` → fail с pointer на `rules/ref-photo-policy.md` (handoff в art-director всё равно потребует ref).

### Warnings (не блокируют, но отображаются)

- Сцена > 3s без internal cut → "scene-NN slow pacing"
- Total duration > 18s — может быть intentional но flag'аем
- Hook word count > 7 — warning, не fail
- Banlist words в VO ("уникальный", "качественный" без конкретики) → warning

## Failure handling

**Если `passed: false`:**
1. Не handoff. Не пиши пользователю "готово".
2. Чат: какие fails, конкретные scenes.
3. Итерируй: правка → re-run `project score` → handoff.

**Шаблон отчёта:**
> "Scenario НЕ готов. Fails:
> - scene-01 hook 14 слов (limit 10): «<текущий hook>» → урежь
> - scene-03 text_overlay y=1850 (вне green zone) → подними до Y ≤ 1480
> - scene-04 нет VO и нет silent: true → решим
>
> Поправлю по этому списку или скажешь иначе?"

## Two-failure rule

Если после 2 итераций по тем же scenes scenario всё ещё `passed: false` — стоп, пользователю concrete options:

> "Не могу довести scenario до passing двумя проходами. Похоже brief противоречит формату (TikTok 15s + 4 separate persona showcases). Опции:
> a) растянуть до 25s (скажи)
> b) сократить до 1 persona
> c) сменить формат на comparison-angle
> Что выбираем?"

## Manual override

Пользователь может явно bypass:
> "пропусти gate, scenario как есть"

Логируем `stage: "scenario-gate-bypass-consent"`, продолжаем. Это редкий случай (продакшн / spike test).

## When gate runs

- Авто после `new-scenario` — нельзя declare ready без passed.
- Авто после каждой `iterate-scenario` итерации.
- Manual: когда user скажет "проверь сценарий".
