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
- Templates — two tiers, read by `ralphy template list` / `suggest` / `use`: the **public content library** (static `library.json` on Bunny CDN) and the active workspace's `.ralphy/workspaces/<ws>/templates/` (user-local, gitignored). The old repo-public `templates/` folder is retired.
- `.ralphy/` — the gitignored data root (#108; replaced the legacy `workspace/` tree, fully migrated by #106 — a leftover legacy root fails fast with `E_LEGACY_LAYOUT` on every verb except `ralphy migrate` / `ralphy doctor`; `ralphy migrate [--dry-run]` is the only path back). Engine state at top level (`registry.json`, `config.json`), caches under `cache/{assets,library,svg}/`, global `research/` + `references/`, and **workspaces** under `workspaces/<ws>/{workspace.json,shared/,projects/,templates/,batches/}`. A workspace = a studio / universe / client owning `shared/` assets reused across its projects; `ralphy workspace {create|list|show|use}` manages them, `ralphy project move <id> <ws>` relocates a project, and the registry maps `id → workspace` so existing verbs keep taking a bare `<id>`. A workspace can also carry its own **custom evaluator rubric** (`<workspace>/{STYLE_LOCK.md,evaluators.json,metrics-benchmarks.json}`) scored via `ralphy workspace eval <project>` and wired into the contract's stage gates — see [`docs/workspace-evaluators.md`](docs/workspace-evaluators.md) (#468-#476). Ref resolution: project `artifacts/refs/` → workspace `shared/refs/` → global `.ralphy/references/` (`--ref shared/<path>` targets the workspace tier explicitly). `ralphy ref pull` stores the slug dir into the active workspace's `shared/refs/<slug>/` (global when the active workspace is `default`); read verbs resolve workspace-local first then fall back to global, `--global` opts out (#401). NOTE: `.ralphy/` is hidden — use `fd -H` / the CLI / the `studio/` viewer (#107), not a blind `ls`. Below, `<project>` = `.ralphy/workspaces/<ws>/projects/<id>`.
- `.ralphy/cache/assets/` — local cache of files pulled from the `ralphy-assets` companion repo.
- `<project>/artifacts/` — the **raw working dump**, one `<kind>/` subdir per media kind (`images|videos|voiceover|music|sfx|captions|fonts|refs` — input references are the `refs` kind, #105): every `ralphy generate` output, every `.v2`/`.v3` re-roll, rejects, scratch. Append-only, versioned, never the deliverable.
- `studio/` — Ralphy Studio (#107), the local artifact browser + scene board (`cd studio && bun run dev`): hash-routed workspace + project selection (`#<ws>/<project>`, refresh-safe), a **Board** view (#478 — scene anchors in order, each scene's image variants side by side, click the chosen one) and a **Files** view (live artifact grid over `<project>/artifacts/<kind>/`), plus a collapsible workflow-pipeline strip and a preview modal. Read-only over MEDIA; the SOLE write is the board choice (POST `/board/choose` → project-local `board.json`, never touches media). The visual alternative to `fd -H` into `.ralphy/`.
- `<project>/units/` — **curated deliverables** (#069). Each `units/<slug>/` holds COPIES of selected `artifacts/` files (ordered) + a `unit.json` manifest (format + ordered media + provenance), mirroring the library-v2 Unit entity so publish (#056) is mechanical. COPY-not-move (the source `artifacts/` stay untouched) and **append-only** (a new slug = a new dir; re-`create` on an existing slug = a `<slug>.v2/` dir, never an overwrite; `unit add` appends). Formed explicitly via `ralphy unit`; `ralphy generate` never writes here.
- `docs/playbooks/` — role / domain instruction docs. The agent reads these on demand based on `AGENTS.md` routing.
- `.agents/skills/` — thin slash-command shims (`/researcher`, etc.) that redirect to the playbooks. `.claude/skills/` symlinks.
- **Companion repo** [`ralphy-assets`](https://github.com/alecs5am/ralphy-assets) — heavy required template assets (trend music) and complete example projects.

## ralphy CLI

`ralphy` is the entrypoint for every CRUD/generation/render. Two ways:
- Globally: `ralphy <command>` (installs via `curl ... install.sh | sh`).
- In-tree dev: `bun run ralph -- <command>` or `bun run ralphy -- <command>`.

Resources: `brand`, `persona`, `ref`, `project`, `unit`, `template`, `batch`, `asset`, `workspace`, `config`. Each: `create | list | show <id> | update <id> | delete <id>` (`unit` adds `add`, scoped per-project: `unit <verb> <project> [<slug>]`).

Top-level: `setup`, `status`, `doctor`, `generate {image|video|voiceover|music}`, `render <project>`, `assets {list|pull|install|clean|cache-info}`, `example {list|pull}`, `migrate [--dry-run] [--project <id>]` (legacy `workspace/` tree → `.ralphy/` layout).

Defaults to JSON. `-p` for pretty tables. Full reference: `docs/agent-guide.md`. Spec: `docs/cli-spec.md`.

## Project memory

Every project keeps append-only logs at `<project>/logs/` (`.ralphy/workspaces/<ws>/projects/<id>/logs/`):
- `generations.jsonl` — every model call with input/output/cost (auto-written by `ralphy generate`)
- `user-prompts.jsonl` — chronological user prompts (`logUserPrompt`)
- `user-assets.jsonl` — uploaded references (`logUserAsset`)

CLI: `ralphy project log <id>` / `ralphy project timeline <id>` / `ralphy project log-prompt` / `ralphy project log-asset`.

## Conventions

- Project ID: `{context}-{NNN}` (e.g. `spring-2026-001`).
- Scene ID: `scene-{NN}`. Asset slot: `{scene-id}-{type}-{descriptor}`.
- HyperFrames: authored as `<project>/index.html` with `data-*` timing attributes and a paused GSAP timeline registered on `window.__timelines`. See [`docs/playbooks/hyperframes.md`](docs/playbooks/hyperframes.md).

## Testing

TDD-leaning. New CLI command → smoke via `bun run cli/index.ts <cmd>` (NOT `bunx tsx` — it breaks on `bun:sqlite`) + JSON assertion. New UI → Playwright. New HyperFrames composition → `bunx hyperframes lint .ralphy/workspaces/<ws>/projects/<id>` + `bunx hyperframes snapshot` for key-frame PNGs.

## Help & feedback

- `/help` — Claude Code help.
- Issues: https://github.com/anthropics/claude-code/issues
