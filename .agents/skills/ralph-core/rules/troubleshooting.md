# Troubleshooting

## Three log files per project

`workspace/projects/<id>/logs/`:

- **`generations.jsonl`** — every model call (input, output URL + local path, status, `cost_usd`, `note`).
- **`user-prompts.jsonl`** — chronological user prompts with a `stage` label (`brief`, `scenario-feedback`, `regeneration-request`, `no-ref-consent`, `gate-bypass-consent`, ...).
- **`user-assets.jsonl`** — user-uploaded refs with a `purpose`.

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

`cli/lib/gen-log.ts` enforces the format. After Sprint 3:

- All `ralphy generate <kind>` commands call `logGeneration()` or `loggedFetch()` automatically. **No raw fetches.**
- User brief = `BRIEF.md` + auto `logUserPrompt(id, { text, stage: "brief" })` at project creation.
- User reference photos are copied into `assets/uploaded/` + auto `logUserAsset(id, ...)`.
- Regeneration carries an explicit `note` ("clip-03 v2 hand crumples sample").

## Debug flow for a failed generation

1. **Read `generations.jsonl`** for the failing slot — last entry shows exact input + error.
2. **Compare inputs** across past successful + failed runs — find the delta.
3. **If inputs are OK** — check provider status (OpenRouter availability, ElevenLabs 429, etc.). Adjust concurrency or wait.
4. **If the prompt is the problem** — hand back to `/ralph-art-director` (`regenerate-slot`) with a clear note.

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| Generation 401 | Key revoked or wrong | Re-paste key via `ralphy setup` |
| Generation 429 | ElevenLabs concurrent cap | Retry sequentially, not in parallel per project |
| Generation 5xx | Provider transient | Retry with exponential backoff (`ralphy generate` has built-in retry) |
| Captions empty | whisper-1 didn't detect language | Pass `--language ru` explicitly |
| Captions clip mid-word | No word-level timestamps | Confirm `transcribe.ts` sends `timestamp_granularities[]=word` |
| Render fails "Cannot find composition" | `src/Root.tsx` not registered | Hand back to editor |
| Render fails "version mismatch" | Remotion packages drift | `bun install` — all on 4.0.441 |
| Asset 404 in render | symlink broken | `ls public/project-<id>` — re-create symlink |
| `ralphy setup` silently hangs | terminal without TTY | Use `--link <path>` non-TUI mode |

## Cost-tracking issues

If `generations.jsonl.cost_usd` is always 0 for openrouter calls:
- Check `cli/lib/providers/llm.ts` — it should extract price from response headers (`x-openrouter-cost`) or compute it from `usage` × known prices.
- `MODELS.md` has reference values for a fallback estimate.

## Workspace hygiene

`tree -L 2 -I 'node_modules|.git|dist' workspace` for a quick view. Or:

```bash
ralphy workspace stats
```

Returns counts: projects, templates, references, batches, total disk size.

## If the ralphy CLI itself is broken

```bash
bun install
bun run lint   # eslint + tsc
```

If `tsc` fails in `cli/` — there's a TypeScript error in the ralphy code. That's a blocker, don't work around it — fix in the source.

```bash
# In-tree dev (no binary):
bun run ralph -- <command>
```

— this works even if the global `ralphy` binary is outdated. Use this as a fallback.

## When handback is needed

- Failed generation with an unclear prompt → `/ralph-art-director`.
- Scenario doesn't land → `/ralph-scenarist`.
- Render error in Remotion → `/ralph-editor` + `/remotion-best-practices`.
- Provider down → wait, no handback.
- User wants a new feature → not my zone, I'll say so.
