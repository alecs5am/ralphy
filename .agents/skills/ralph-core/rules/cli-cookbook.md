# CLI cookbook

**Authoritative sources:**
- `docs/agent-guide.md` — canonical command list с examples.
- `docs/cli-spec.md` — full flag-level spec.

When in doubt — **читай specs, не improvise'й flag**.

## Invocation

- Globally installed: `ralphy <command>` (works from anywhere; finds project via `~/.config/ralphy/config.json`).
- In-tree dev (no binary): `bun run ralph -- <command>` или `bun run ralphy -- <command>`.

## Resources & operations

- **Resources:** `brand`, `persona`, `ref`, `project`, `template`, `batch`, `asset`, `workspace`, `config`, `profile`.
- **Operations per resource:** `create | list | show <id> | update <id> | delete <id>`.
- **Top-level:** `setup`, `status`, `doctor`, `generate {image|video|voiceover|music|captions}`, `render <project>`.

## Output

- JSON default (parse-friendly).
- `-p` / `--pretty` для tables.
- `--format json|table|csv` где supported.

## Common entries

### Project
```bash
ralphy project list
ralphy project show <id>
ralphy project create --id <ctx>-<NNN> --name "..."
ralphy project timeline <id>
ralphy project log <id>                           # last 50 generations
ralphy project log <id> --type user-prompts
ralphy project log <id> --type all --limit 200
ralphy project log-prompt <id> --text "..." --stage feedback
ralphy project log-asset <id> --kind photo --source <path> --purpose character-ref
ralphy project transcribe <id> --audio <path> --language ru
ralphy project score <id>                         # quality gate
ralphy project delete <id>
```

### Template
```bash
ralphy template list
ralphy template show <slug>
ralphy template show <slug> --path                # path to template dir
ralphy template use <slug> --project <id> --name "..." --brief "..."
ralphy template register <slug>
ralphy template suggest "<utterance>"             # top-3 ranked
ralphy template extract --slug <slug> --from-project <id>
```

### Generate (Sprint 3 — ralphy generate {kind})
```bash
ralphy generate image    --project <id> --slot <slot> --model <m> --prompt <p> [--ref <url>...]
ralphy generate video    --project <id> --slot <slot> --model <m> --image <ref> --prompt <p> --duration <s>
ralphy generate voiceover --project <id> --persona <p> --text <t>
ralphy generate music    --project <id> --prompt <p> --duration <s>
ralphy generate captions --project <id> --slot <slot> [--audio <path>] [--language ru]
```

### Render (Sprint 6.3)
```bash
ralphy render <project>                           # default — final.mp4
ralphy render <project> --loudnorm                # post-process EBU R128
```

### Reference
```bash
ralphy ref create --url <URL> --type design|social
ralphy ref scrape-trends --hashtags "ai,productivity" --limit 15
ralphy brand create --name "..." --url <URL>
```

### Persona
```bash
ralphy persona list
ralphy persona create --name "..." --archetype "<archetype>"
ralphy persona show <name> -p
```

### Profile
```bash
ralphy profile list
ralphy profile show <nickname>
ralphy profile import <nickname>                  # additive
ralphy profile import <nickname> --overwrite
ralphy profile export <nickname>
ralphy profile export <nickname> --include-renders
```

### Setup / status
```bash
ralphy setup
ralphy setup --status                             # JSON (no TUI)
ralphy setup --link <path>                        # link binary к project
ralphy setup --unlink
ralphy status -p
ralphy doctor
```

### Workspace inspection
```bash
ralphy workspace stats
tree -L 2 -I 'node_modules|.git|dist' workspace
```

### Batch (Sprint 6 / producer)
```bash
ralphy batch create --template <id> --ideas <list-or-file>
ralphy batch scaffold <batch-id>
ralphy batch status <batch-id>
ralphy batch status <batch-id> --update <project-id> --status completed --render-path <path>
```

## Inspection use cases

- "What projects exist" → `ralphy project list`
- "Show timeline for X" → `ralphy project timeline <id>`
- "How much have we spent" → `ralphy project log <id> --type generations` + sum `cost_usd`
- "Что в batch" → `ralphy batch status <batch-id>`
- "Доступные шаблоны" → `ralphy template list -p`

## Workspace hygiene

```bash
ralphy workspace stats         # entity counts + disk
```

## Не делать

- ❌ Edit `workspace/projects/<id>/scenario.json` напрямую — use `ralphy project update <id>` или handoff в scenarist.
- ❌ Edit `workspace/templates/<slug>/template.json` напрямую — use `ralphy template update`.
- ❌ Delete `workspace/projects/<id>/` через `rm -rf` — use `ralphy project delete <id>` (cleans up registry).
- ❌ Run `bunx remotion render` напрямую — use `ralphy render <id>`.
