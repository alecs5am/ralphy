# Workspaces grouping layer + rename root `workspace/` → `.ralphy/`

> **Status:** todo
> **Filed:** 2026-06-10
> **Folder:** issues

## Context

Designed with the user 2026-06-10, same session as #105/#107. At ~80 flat projects under `workspace/projects/`, related work (the `choose-*` universe, `analog-horror-*` series, `fogtown-*` cast) has no filesystem grouping. The user's concrete driver: he builds a universe in one project (`fogtown-cast`) and ports its characters into separate reel projects (`choose-silenthill-001`, a future silent-hill-2 series) — today by hand. A **workspace** should be the home for those shared elements.

Decided shape (clarifying Qs):
- A workspace = a **studio / universe / client that owns shared assets** (`shared/` — cast, characters, brands, personas, refs, music, styles) reused across its projects — not a bare grouping folder.
- Keep a `projects/` intermediate dir inside each workspace (agent-navigation priority: projects stay separated from `shared/`/`templates/`/config).
- Rename the gitignored root `workspace/` → **`.ralphy/`**; engine state sits at its top level and workspaces nest under `workspaces/`.

This is the foundational layout issue. `artifacts/` (#105) nests inside it; the one-pass migration (#106) targets the combined end state; the studio viewer (#107) browses it and gains a workspace selector.

## What

Introduce a workspace layer between the root and projects, and overhaul `cli/lib/paths.ts` (the single source of layout truth — 17 funcs, everything flows through `workspace()` + `.ralph/`) to drive it.

Target tree:

```
.ralphy/                              # gitignored root (was workspace/)
  registry.json                       # global: id → {workspace, path}; active-workspace pointer
  config.json
  cache/{assets,library}/             # was .ralph/{asset-cache,library-cache}
  research/  references/              # global research output (cross-workspace)
  workspaces/
    <ws-slug>/
      workspace.json                  # { name, slug, created, description }
      shared/                         # assets reused across THIS workspace's projects
        cast/ characters/ brands/ personas/ refs/ music/ styles/
      projects/
        <project-id>/
          artifacts/                  # #105 layout
            refs/ images/ videos/ voiceover/ music/ sfx/ captions/ fonts/
          render/ units/ compositions/ prompts/ logs/
          index.html asset-manifest.json STORYBOARD.md POSTMORTEM.md
      templates/  batches/
```

Mechanics:
- **Globally-unique project ids**; `registry.json` maps `id → workspace`. `ralphy render <id>` / `generate` / etc. resolve the full path via the registry — no workspace arg needed for existing verbs.
- **Active workspace**: `ralphy workspace use <slug>` sets the default for new projects; `--workspace <slug>` per-command override.
- **Asset/ref resolution order**: project `artifacts/` → workspace `shared/` → optional global. A `--ref shared/cast/nurse.png` form resolves against the active project's workspace `shared/`.
- New verbs: `ralphy workspace {create|list|show|use}`, `ralphy project move <id> <ws>`.

## Why it matters

The shared-asset reuse the user does by hand (porting cast masters between projects) becomes a first-class path: promote masters into `shared/cast/`, reels reference them. Grouping also makes ~80 projects navigable and gives the studio viewer (#107) a natural top-level filter. Because the entire layout funnels through `paths.ts`, the blast radius is one core file + the migration verb, not a scattered rewrite.

## Scope / acceptance

- `cli/lib/paths.ts`: root becomes `.ralphy/`; add `workspacesDir()`, `workspaceDir(slug)`, `sharedDir(slug)`, `currentWorkspace()`; `projectDir(id)` resolves through the registry (id → workspace → path); `projectsDir()` becomes workspace-scoped; cache dirs move to `.ralphy/cache/{assets,library}`. `setRoot` semantics preserved.
- `cli/lib/registry.ts`: registry entries carry `workspace`; add active-workspace pointer; brand/persona/global-ref lookups updated (they move into `workspaces/<ws>/shared/`).
- New `ralphy workspace` command group (`create|list|show|use`) + `ralphy project move <id> <ws>`; JSON default, `-p` pretty. Smoke tests per verb.
- Existing verbs (`generate`, `render`, `project show`, `unit`, …) keep working with a bare `<id>` via registry resolution — covered by existing integration tests still passing.
- Asset resolver implements project → workspace `shared/` → global order; a `shared/...` ref form is documented and tested.
- Docs: `CLAUDE.md` project-layout section, `AGENTS.md` (paths in invariant #14, the `workspace/projects/<id>/` references throughout), `docs/agent-guide.md`, `docs/cli-spec.md`, `CLI.md`.
- Gates: `bun test` green; `rg '\p{Cyrillic}' --pcre2` clean on touched files.

## Notes

- **Sequencing**: this + #105 are the two foundational layout changes; **#106 migrates to the combined end state** (`.ralphy/workspaces/default/projects/<id>/artifacts/...`) and must land after both. #107 (studio viewer) reads this layout and should expose a workspace selector above the project selector.
- `.ralphy/` is hidden → `ls`/`fd`/`eza` skip it by default (need `-H`). Acceptable because navigation goes through `ralphy` verbs + the studio viewer (#107), not raw `ls`. Call this out in docs so agents use `fd -H` / the CLI, not a blind `ls`.
- Migration of the current global `.ralph/{brands,personas,refs}` → they land in `workspaces/default/shared/` (no other workspace exists at migration time; the user splits later). Decide in #106 whether a *global* `shared/` tier is also kept for cross-workspace assets, or everything is workspace-scoped with manual promotion.
- `research/` + `references/` stay global at `.ralphy/` root (external research, not project deliverables) — revisit if research becomes workspace-specific.
- Naming: root `.ralphy/` (hidden, engine-managed) per user; the engine-state dir `.ralph/` is absorbed into the `.ralphy/` root (registry/config at top level, caches under `cache/`) — no more nested `.ralph`.
- Cross-links: **#105** (artifacts/ nests here), **#106** (unified migration target), **#107** (viewer + workspace selector), **#012** (old-version archive — `artifacts/<kind>/old/`), **#069** (units unaffected), **#009** (desktop panel will read the same layout).
