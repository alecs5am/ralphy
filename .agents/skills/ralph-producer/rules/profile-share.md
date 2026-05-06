# Profile share

## Export

```bash
ralphy profile export <nickname>
# опционально: --include-renders для heavy mp4s
```

→ `profiles/<nickname>/` с auto-generated `PROFILE.md`.

## Import

```bash
ralphy profile list                 # что доступно
ralphy profile show <nickname>      # PROFILE.md
ralphy profile import <nickname>    # additive (default)
ralphy profile import <nickname> --overwrite
```

## Что travels

- `templates/` — все custom templates
- `references/` — site/social references
- `projects/` — источники templates (без `render/`, `renders/`, `assets/videos/`, `*.mp4|.mov|.webm`, `node_modules/`, `batches/`)
- `.ralph/registry.json`
- Plus auto-`PROFILE.md` regenerated на each export

## Import = additive

- Existing local files preserved unless `--overwrite`.
- `.ralph/registry.json` deep-merged.
- `*.jsonl` logs appended unique (duplicate lines dropped).
- Safe to run repeatedly.

## When to export

- После new template созданного и smoke-tested.
- После reusable reference project landing well.
- Design extract worth sharing.

**Don't commit** profile на каждом small tweak — это history bloat в git.

## When to import

- Onboarding нового человека на shared work.
- Pulling collaborator's templates на свою machine.
- Resume from someone else's profile dump.

## Sample PROFILE.md generation

`profile export` пишет следующее:
- Author nickname
- Timestamp
- Templates inventory (slug + brief description)
- References inventory
- Projects inventory (с opt-out renders)
- Total disk size
- ralph CLI version

## Conflict resolution

Если local и remote profile имеют один template-id с разным content:
- Default: skip (preserve local).
- `--overwrite`: replace local с remote.
- Manual diff: `diff -r workspace/templates/<id>/ profiles/<nickname>/templates/<id>/`.

## Privacy

- `.env` НЕ travels. Никогда.
- API keys НЕ в profile.
- `assets/uploaded/` (пользовательские референсы) **в profile travels** — be careful если sensitive content. Опционально `--exclude-uploaded` (TODO if needed).
