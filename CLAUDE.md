# UGC Video Generation Pipeline

Autonomous UGC-video generation: agent + HyperFrames + OpenRouter media + ElevenLabs voice/music.

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
- `cli/lib/render/hyperframes.ts` — HyperFrames render adapter (the render engine).
- `templates/` — repo-public template pack, committed to git, shipped on every clone. Read by `ralphy template list` / `suggest` / `use`.
- `.ralphy/` — the gitignored data root (#108; replaces the legacy `workspace/`, which is still read as a fallback until #106 migrates). Engine state at top level (`registry.json`, `config.json`), caches under `cache/{assets,library}/`, global `research/` + `references/`, and **workspaces** under `workspaces/<ws>/{workspace.json,shared/,projects/,templates/,batches/}`. A workspace = a studio / universe / client owning `shared/` assets reused across its projects; `ralphy workspace {create|list|show|use}` manages them, `ralphy project move <id> <ws>` relocates a project, and the registry maps `id → workspace` so existing verbs keep taking a bare `<id>`. NOTE: `.ralphy/` is hidden — use `fd -H` / the CLI, not a blind `ls`. Below, `<project>` = `.ralphy/workspaces/<ws>/projects/<id>` (legacy: `workspace/projects/<id>`).
- `.ralphy/cache/assets/` — local cache of files pulled from the `ralphy-assets` companion repo (legacy: `workspace/.ralph/asset-cache/`).
- `<project>/artifacts/` — the **raw working dump**, one `<kind>/` subdir per media kind (`images|videos|voiceover|music|sfx|captions|fonts|refs` — input references are the `refs` kind): every `ralphy generate` output, every `.v2`/`.v3` re-roll, rejects, scratch. Append-only, versioned, never the deliverable. (#105; the legacy `assets/` + sibling `refs/` layout is still read as a fallback until #106 migrates existing projects.)
- `<project>/units/` — **curated deliverables** (#069). Each `units/<slug>/` holds COPIES of selected `artifacts/` files (ordered) + a `unit.json` manifest (format + ordered media + provenance), mirroring the library-v2 Unit entity so publish (#056) is mechanical. COPY-not-move (the source `artifacts/` stay untouched) and **append-only** (a new slug = a new dir; re-`create` on an existing slug = a `<slug>.v2/` dir, never an overwrite; `unit add` appends). Formed explicitly via `ralphy unit`; `ralphy generate` never writes here.
- `docs/playbooks/` — role / domain instruction docs. The agent reads these on demand based on `AGENTS.md` routing.
- `.agents/skills/` — thin slash-command shims (`/researcher`, etc.) that redirect to the playbooks. `.claude/skills/` symlinks.
- **Companion repo** [`ralphy-assets`](https://github.com/alecs5am/ralphy-assets) — heavy required template assets (trend music) and complete example projects.

## ralphy CLI

`ralphy` is the entrypoint for every CRUD/generation/render. Two ways:
- Globally: `ralphy <command>` (installs via `curl ... install.sh | sh`).
- In-tree dev: `bun run ralph -- <command>` or `bun run ralphy -- <command>`.

Resources: `brand`, `persona`, `ref`, `project`, `unit`, `template`, `batch`, `asset`, `workspace`, `config`. Each: `create | list | show <id> | update <id> | delete <id>` (`unit` adds `add`, scoped per-project: `unit <verb> <project> [<slug>]`).

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
- HyperFrames: authored as `workspace/projects/<id>/index.html` with `data-*` timing attributes and a paused GSAP timeline registered on `window.__timelines`. See [`docs/playbooks/hyperframes.md`](docs/playbooks/hyperframes.md).

## Testing

TDD-leaning. New CLI command → smoke via `bunx tsx cli/index.ts <cmd>` + JSON assertion. New UI → Playwright. New HyperFrames composition → `bunx hyperframes lint workspace/projects/<id>` + `bunx hyperframes snapshot` for key-frame PNGs.

## Help & feedback

- `/help` — Claude Code help.
- Issues: https://github.com/anthropics/claude-code/issues
