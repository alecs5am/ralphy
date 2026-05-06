# Reference example — talking-head-rant

**Status: PLACEHOLDER** — заполнится после первого реального end-to-end запуска.

## Что должно быть здесь

- **Source project:** ID первого проекта что shipped через этот template.
- **Concrete monologue:** full VO text + word count + duration.
- **Character setup:** archetype + setting + actual prompts that worked.
- **Hook screenshot:** что использовалось (Reddit / news / chat / tweet) + actual content + path в `assets/uploaded/`.
- **Models used:** veo-3.1 vs kling fallback — какой выбран и почему.
- **Cost actual:** breakdown по stages.
- **Lip-sync notes:** если veo-3.1 — насколько чисто, если kling — насколько captions hide desync.

## How to fill

После first ship:

```bash
ralphy template extract --slug talking-head-rant --from-project <id>
```

Не overwrite'нет существующие docs (TEMPLATE.md / fragments.md / model-stack.md / composition.md). Только этот файл.

Альтернативно вручную из `workspace/projects/<id>/`:
- `BRIEF.md`
- `scenario.json`
- `prompts.json`
- `asset-manifest.json`
- `logs/generations.jsonl`

## Why empty

Sprint 7 scaffolds shape. Filling reference-example.md = $7.65 (veo path) или $2.25 (kling path) + 10 min wall time. Deferred per plan §7.3.
