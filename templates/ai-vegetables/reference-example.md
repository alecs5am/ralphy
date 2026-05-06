# Reference example — ai-vegetables

**Status: PLACEHOLDER** — заполнится после первого реального end-to-end запуска по этому шаблону.

## Что должно быть здесь после первого run'а

- **Source project:** `workspace/projects/<id>/` — first project that successfully shipped using this template.
- **Concrete scenario:**
  - hook line (RU)
  - 3-4 scenes с durations + VO + visual description
  - actual prompts.json blocks (per scene image + video prompts)
- **Music prompt** that worked.
- **Final mp4 path** + duration + cost.
- **What I noticed:**
  - which prompts gave clean output first try
  - which prompts needed regen and why
  - kling motion quirks обнаруженные (e.g. "carrot leaves morphed if push-in > 8%")

## Как заполнить

После первого видео:

```bash
ralphy template extract --slug ai-vegetables --from-project <id>
```

Не overwrite'нет существующий `template.json` / `TEMPLATE.md` / `fragments.md` / `model-stack.md` / `composition.md`. Только дополнит `reference-example.md`.

Альтернативно — заполни вручную из:
- `workspace/projects/<id>/scenario.json`
- `workspace/projects/<id>/prompts.json`
- `workspace/projects/<id>/asset-manifest.json`
- `workspace/projects/<id>/logs/generations.jsonl` (cost rollup)
- `workspace/projects/<id>/logs/user-prompts.jsonl` (что user правил)

## Why this is empty for now

Sprint 7 scaffolds the template structure. Filling reference-example.md требует $3-4 на real run + 8 минут wall time. Это deferred до отдельной сессии (см. plan §7.3).
