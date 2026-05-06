# Regeneration & variants

## Single-slot regen

**Когда:** "перегенерь scene-01 фон", "VO для clip-04 не то", "попробуй другую модель для hero shot".

**Шаги:**

1. Прочитай существующий `prompts.json[<slot>]`.
2. Прочитай `generations.jsonl` — фильтр по slot — чтобы НЕ повторить промпт+модель который уже фейлил.
3. Уточни у пользователя:
   - Обновлённый промпт (или "тот же промпт, новый seed/model").
   - Estimated cost (одна строка из MODELS.md).
   - Сохранять старый файл как `.vN.ext` или overwrite.
4. Запусти **`ralphy generate <kind>`** только для этого слота:
   ```
   ralphy generate image --project <id> --slot <slot> --model <m> --prompt <p> [--ref <url>]
   ```
5. `asset-manifest.json` обновится автоматически (новая запись или новая версия).
6. Чат: что поменялось, cost, путь.

**Hard rule:** не пиши runtime TS скрипт под `workspace/projects/<id>/scripts/regen-XX.ts`. Если `ralphy generate` не покрывает кейс — стопаемся, расширяем `cli/commands/generate.ts`, не копируем код в проект.

## A/B variants (compare-variants sub-task)

**Когда:** пользователь хочет 2-3 варианта одного слота для выбора.

**Шаги:**

1. Сгенерируй N ассетов с **отчётливо разными** входами (не одинаковые seed). Ось вариативности — одна за раз: prompt wording / seed / model / voice_id.
2. `ralphy generate <kind>` с флагом `--variant <N>` — пишется как `assets/<kind>/<slot>.v<N>.<ext>`.
3. Каждый вызов логируется с `note: "variant <N> - <axis>: <value>"` (автоматом через ralphy).
4. **Не обновляй `asset-manifest.json` сразу.** Сначала покажи варианты пользователю, дождись выбора, потом promote выбранный → канонический путь манифеста.

## Post-regeneration quality gate

После каждого регенерата — `scoreImage` / `scoreVideo` (см. `quality-gate.md`). Два провала подряд → стоп, отчёт пользователю с тремя опциями (better ref / different model / different shot).

## VO regeneration triggers caption regen

Если перегенерил voiceover любого slot'а — captions нужно перегенерить тоже (whisper привязан к точному audio). После voiceover слота:

```
ralphy generate captions --project <id> --slot <slot>
```

Это часть `generate-assets`, не отдельный sub-task.
