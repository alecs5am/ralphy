# Profile share

## Export

```bash
ralphy profile export <nickname>
# optional: --include-renders for heavy mp4s
```

→ `profiles/<nickname>/` with auto-generated `PROFILE.md`.

## Import

```bash
ralphy profile list                 # what's available
ralphy profile show <nickname>      # PROFILE.md
ralphy profile import <nickname>    # additive (default)
ralphy profile import <nickname> --overwrite
```

## What travels

- `templates/` — all custom templates
- `references/` — site/social references
- `projects/` — template sources (without `render/`, `renders/`, `assets/videos/`, `*.mp4|.mov|.webm`, `node_modules/`, `batches/`)
- `.ralph/registry.json`
- Plus auto-`PROFILE.md` regenerated on each export

## Import = additive

- Existing local files preserved unless `--overwrite`.
- `.ralph/registry.json` deep-merged.
- `*.jsonl` logs appended unique (duplicate lines dropped).
- Safe to run repeatedly.

## When to export

- After a new template is created and smoke-tested.
- After a reusable reference project lands well.
- Design extract worth sharing.

**Don't commit** profile on every small tweak — that's history bloat in git.

## When to import

- Onboarding a new person to shared work.
- Pulling a collaborator's templates onto your own machine.
- Resume from someone else's profile dump.

## Sample PROFILE.md generation

`profile export` writes the following:
- Author nickname
- Timestamp
- Templates inventory (slug + brief description)
- References inventory
- Projects inventory (with opt-out renders)
- Total disk size
- ralph CLI version

## Conflict resolution

If local and remote profile share a template-id with different content:
- Default: skip (preserve local).
- `--overwrite`: replace local with remote.
- Manual diff: `diff -r workspace/templates/<id>/ profiles/<nickname>/templates/<id>/`.

## Privacy

- `.env` does NOT travel. Ever.
- API keys are NOT in the profile.
- `assets/uploaded/` (user references) **does travel in the profile** — be careful with sensitive content. Optionally `--exclude-uploaded` (TODO if needed).
