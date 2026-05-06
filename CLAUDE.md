# UGC Video Generation Pipeline

Autonomous UGC-video generation: Claude Code skills + Remotion + OpenRouter media + ElevenLabs voice/music.

## How to operate

1. **Read `AGENTS.md` first.** It's the routing contract — find the matching row before acting.
2. **Read `MODELS.md` before any model call.** Claude's model knowledge is stale; that file is source of truth.
3. **Read `docs/use-cases.md`** for canonical utterance → flow examples.

## Hard invariants (never break)

- Only **two API keys** in this stack: `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. No FAL/Vercel/OpenAI/Replicate. All media → `cli/lib/providers/media.ts`. All LLM → `callLLM()`.
- **No runtime TS scripts** under `workspace/projects/<id>/scripts/`. Use `ralphy generate ...` exclusively.
- **Reference-required** for named persons/brands/specific entities. Refuse without ref unless user gives explicit "генерь без референса" consent.
- **Quality gates refuse, not warn.** Two failures in a row → stop and report options.
- **No auto-launched processes.** No background Studio/dashboard. Chat is the UI. Use `ralphy doctor` + `ralphy render`.
- Always **`bun` / `bunx`** (no npm/npx). Always **`ralphy <cmd>`** for CRUD (no manual workspace edits).

## Project layout

- `cli/` — ralphy CLI (TypeScript, tsx). Commands `cli/commands/`, libs `cli/lib/`.
- `src/lib/` — durable Remotion components (captions, overlays, layouts). Committed.
- `src/videos/{name}/` — per-video compositions.
- `templates/` — repo-public template pack, committed to git, shipped on every clone. Read by `ralphy template list` / `suggest` / `use`.
- `workspace/` — generated files (gitignored). Safe to wipe. `workspace/templates/` is the local override slot — same id as a repo template shadows it.
- `.agents/skills/` — skill source of truth. `.claude/skills/` symlinks.
- `dashboard/` — retired in v2. Code stays for now, undocumented.
- `profiles/<nick>/` — committed dumps of users' workspaces (additive imports).

## ralphy CLI

`ralphy` is the entrypoint for every CRUD/generation/render. Two ways:
- Globally: `ralphy <command>` (installs via `curl ... install.sh | sh`).
- In-tree dev: `bun run ralph -- <command>` or `bun run ralphy -- <command>`.

Resources: `brand`, `persona`, `ref`, `project`, `template`, `batch`, `asset`, `workspace`, `config`, `profile`. Each: `create | list | show <id> | update <id> | delete <id>`.

Top-level: `setup`, `status`, `doctor`, `generate {image|video|voiceover|music}`, `render <project>`.

Defaults to JSON. `-p` for pretty tables. Full reference: `docs/agent-guide.md`. Spec: `docs/cli-spec.md`.

## Project memory

Every project keeps append-only logs at `workspace/projects/<id>/logs/`:
- `generations.jsonl` — every model call with input/output/cost (auto-written by `ralphy generate`)
- `user-prompts.jsonl` — chronological user prompts (`logUserPrompt`)
- `user-assets.jsonl` — uploaded references (`logUserAsset`)

CLI: `ralphy project log <id>` / `ralphy project timeline <id>` / `ralphy project log-prompt` / `ralphy project log-asset`.

## Conventions

- Project ID: `{context}-{NNN}` (e.g. `spring-2026-001`).
- Scene ID: `scene-{NN}`. Asset slot: `{scene-id}-{type}-{descriptor}`.
- All Remotion packages share one version (`4.0.441`).
- Use `staticFile()` for every asset reference; organize compositions via `<Folder>` in `Root.tsx`.

## Testing

TDD-leaning. New CLI command → smoke via `bunx tsx cli/index.ts <cmd>` + JSON assertion. New UI → Playwright. New Remotion component → render frames 0–10 for crash check.

## Help & feedback

- `/help` — Claude Code help.
- Issues: https://github.com/anthropics/claude-code/issues
