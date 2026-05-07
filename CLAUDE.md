# UGC Video Generation Pipeline

Autonomous UGC-video generation: agent + Remotion + OpenRouter media + ElevenLabs voice/music.

@AGENTS.md

## How to operate (the playbook discipline)

Routing and the hard "read the playbook before acting" rule live in `AGENTS.md` (auto-loaded above). **That file is the entry point for every user request.** This file is for repo orientation only.

Three companion files the agent should also keep in mind:
- `MODELS.md` — read before every model call. Claude's training is stale.
- `docs/use-cases.md` — canonical utterances, useful when the routing match is ambiguous.
- `docs/playbooks/README.md` — index of all playbooks.

## Project layout

- `cli/` — ralphy CLI (TypeScript, tsx). Commands `cli/commands/`, libs `cli/lib/`.
- `src/lib/` — durable Remotion components (captions, overlays, layouts). Committed.
- `src/videos/{name}/` — per-video compositions.
- `templates/` — repo-public template pack, committed to git, shipped on every clone. Read by `ralphy template list` / `suggest` / `use`.
- `workspace/` — generated files (gitignored). Safe to wipe. `workspace/templates/` overrides repo templates on id collision.
- `workspace/.ralph/asset-cache/` — local cache of files pulled from the `ralphy-assets` companion repo.
- `docs/playbooks/` — role / domain instruction docs. The agent reads these on demand based on `AGENTS.md` routing.
- `.agents/skills/` — thin slash-command shims (`/ralph-researcher`, etc.) that redirect to the playbooks. `.claude/skills/` symlinks.
- `dashboard/` — retired in v2. Code stays for now, undocumented.
- `profiles/<nick>/` — committed dumps of users' workspaces (additive imports).
- **Companion repo** [`ralphy-assets`](https://github.com/alecs5am/ralphy-assets) — heavy required template assets (trend music) and complete example projects.

## ralphy CLI

`ralphy` is the entrypoint for every CRUD/generation/render. Two ways:
- Globally: `ralphy <command>` (installs via `curl ... install.sh | sh`).
- In-tree dev: `bun run ralph -- <command>` or `bun run ralphy -- <command>`.

Resources: `brand`, `persona`, `ref`, `project`, `template`, `batch`, `asset`, `workspace`, `config`, `profile`. Each: `create | list | show <id> | update <id> | delete <id>`.

Top-level: `setup`, `status`, `doctor`, `generate {image|video|voiceover|music}`, `render <project>`, `assets {list|pull|install|clean|cache-info}`, `example {list|pull}`.

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
