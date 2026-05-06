# Troubleshooting

## Three log files per project

`workspace/projects/<id>/logs/`:

- **`generations.jsonl`** — каждый model call (input, output URL + local path, status, `cost_usd`, `note`).
- **`user-prompts.jsonl`** — chronological user prompts с `stage` label (`brief`, `scenario-feedback`, `regeneration-request`, `no-ref-consent`, `gate-bypass-consent`, ...).
- **`user-assets.jsonl`** — user-uploaded refs с `purpose`.

## CLI access

```bash
ralphy project log <id>                    # last 50 generations
ralphy project log <id> --type user-prompts
ralphy project log <id> --type all --limit 200
ralphy project timeline <id>               # merged chronology
ralphy project log-prompt <id> --text "..." --stage <stage>
ralphy project log-asset <id> --kind <kind> --source <path> --purpose <purpose>
```

## Append-only enforcement

`cli/lib/gen-log.ts` enforce'ит формат. После Sprint 3:

- Все `ralphy generate <kind>` команды call'ят `logGeneration()` или `loggedFetch()` автоматом. **Никаких raw fetch'ей.**
- User brief = `BRIEF.md` + auto `logUserPrompt(id, { text, stage: "brief" })` при project creation.
- User reference photos copy'ятся в `assets/uploaded/` + auto `logUserAsset(id, ...)`.
- Regeneration carries explicit `note` ("clip-03 v2 hand crumples sample").

## Debug flow для failed generation

1. **Read `generations.jsonl`** для failing slot — last entry показывает exact input + error.
2. **Compare inputs** across past successful + failed runs — найди delta.
3. **Если inputs OK** — check provider status (OpenRouter availability, ElevenLabs 429, etc.). Adjust concurrency или wait.
4. **Если prompt — проблема** — handback в `/ralph-art-director` (`regenerate-slot`) с clear note.

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Generation 401 | Key revoked or wrong | Re-paste key через `ralphy setup` |
| Generation 429 | ElevenLabs concurrent cap | Retry sequentially, не parallel per project |
| Generation 5xx | Provider transient | Retry с exponential backoff (ralphy generate имеет built-in retry) |
| Captions empty | whisper-1 не понял language | Pass `--language ru` explicit |
| Captions clip mid-word | Не word-level timestamps | Confirm `transcribe.ts` шлёт `timestamp_granularities[]=word` |
| Render fails "Cannot find composition" | `src/Root.tsx` не registered | Hand back в editor |
| Render fails "version mismatch" | Remotion packages drift | `bun install` — все на 4.0.441 |
| Asset 404 в render | symlink broken | `ls public/project-<id>` — re-create symlink |
| `ralphy setup` silently hangs | terminal без TTY | Use `--link <path>` non-TUI mode |

## Cost-tracking issues

Если `generations.jsonl.cost_usd` всегда 0 для openrouter calls:
- Проверь `cli/lib/providers/llm.ts` — должен извлекать price из response headers (`x-openrouter-cost`) или calc'ать по `usage` × known prices.
- `MODELS.md` имеет ориентиры для fallback estimate.

## Workspace hygiene

`tree -L 2 -I 'node_modules|.git|dist' workspace` для quick view. Или:

```bash
ralphy workspace stats
```

Возвращает counts: projects, templates, references, batches, total disk size.

## Если ralphy CLI сам сломан

```bash
bun install
bun run lint   # eslint + tsc
```

Если `tsc` фейлится в `cli/` — есть TypeScript ошибка в коде ralphy. Это блокер, не workaround'им — fix в исходниках.

```bash
# In-tree dev (no binary):
bun run ralph -- <command>
```

— this works даже если global `ralphy` binary outdated. Use this как fallback.

## Когда handback needed

- Failed generation с unclear prompt → `/ralph-art-director`.
- Sценарий не landing'ит → `/ralph-scenarist`.
- Render error в Remotion → `/ralph-editor` + `/remotion-best-practices`.
- Provider down → wait, не handback.
- User wants new feature → не моя зона, скажу так.
