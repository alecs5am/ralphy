# UGC Video Generation Pipeline

Autonomous UGC-video generation: agent + HyperFrames (default) / Remotion (fallback) + OpenRouter media + ElevenLabs voice/music.

@AGENTS.md

## How to operate (the playbook discipline)

Routing and the hard "read the playbook before acting" rule live in `AGENTS.md` (auto-loaded above). **That file is the entry point for every user request.** This file is for repo orientation only.

Four companion files the agent should also keep in mind:
- `MODELS.md` — read before every model call. Claude's training is stale.
- `CLI.md` — `ralphy` command surface cheatsheet. Read before running an unfamiliar verb / flag.
- `docs/use-cases.md` — canonical utterances, useful when the routing match is ambiguous.
- `docs/playbooks/README.md` — index of all playbooks.

## Project layout

- `cli/` — ralphy CLI (TypeScript, tsx). Commands `cli/commands/`, libs `cli/lib/`.
- `cli/lib/render/hyperframes.ts` — HyperFrames render adapter (default engine). Remotion adapter is inline in `cli/commands/render.ts` as the fallback path.
- `src/lib/` — legacy durable Remotion components (captions, overlays, layouts). Used by the Remotion fallback engine.
- `src/videos/{name}/` — legacy per-video Remotion (React/TSX) compositions. New work goes to `workspace/projects/<id>/index.html` (HyperFrames).
- `templates/` — repo-public template pack, committed to git, shipped on every clone. Read by `ralphy template list` / `suggest` / `use`.
- `workspace/` — generated files (gitignored). Safe to wipe. `workspace/templates/` overrides repo templates on id collision.
- `workspace/.ralph/asset-cache/` — local cache of files pulled from the `ralphy-assets` companion repo.
- `docs/playbooks/` — role / domain instruction docs. The agent reads these on demand based on `AGENTS.md` routing.
- `.agents/skills/` — thin slash-command shims (`/ralphy-researcher`, etc.) that redirect to the playbooks. `.claude/skills/` symlinks.
- `dashboard/` — retired in v2. Code stays for now, undocumented.
- **Companion repo** [`ralphy-assets`](https://github.com/alecs5am/ralphy-assets) — heavy required template assets (trend music) and complete example projects.

## ralphy CLI

`ralphy` is the entrypoint for every CRUD/generation/render. Two ways:
- Globally: `ralphy <command>` (installs via `curl ... install.sh | sh`).
- In-tree dev: `bun run ralph -- <command>` or `bun run ralphy -- <command>`.

Resources: `brand`, `persona`, `ref`, `project`, `template`, `batch`, `asset`, `workspace`, `config`. Each: `create | list | show <id> | update <id> | delete <id>`.

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
- HyperFrames (default): authored as `workspace/projects/<id>/index.html` with `data-*` timing attributes and a paused GSAP timeline registered on `window.__timelines`. See [`docs/playbooks/hyperframes.md`](docs/playbooks/hyperframes.md).
- Remotion (legacy fallback): all Remotion packages share one version (`4.0.441`); use `staticFile()` for every asset reference; organize compositions via `<Folder>` in `Root.tsx`.

## Testing

TDD-leaning. New CLI command → smoke via `bunx tsx cli/index.ts <cmd>` + JSON assertion. New UI → Playwright. New HyperFrames composition → `bunx hyperframes lint workspace/projects/<id>` + `bunx hyperframes snapshot` for key-frame PNGs. New Remotion component (fallback) → render frames 0–10 for crash check.

## Help & feedback

- `/help` — Claude Code help.
- Issues: https://github.com/anthropics/claude-code/issues
