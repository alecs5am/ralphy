# 553 — Remove the global active-workspace pointer (concurrent-session safe)

> **Status:** issue
> **Filed:** 2026-07-21
> **Folder:** issues

## Context

The "active workspace" is a single global mutable pointer: the `activeWorkspace`
key in `config.json`, written by `ralphy workspace use <slug>`
(`setActiveWorkspace`, `cli/lib/registry.ts:142`) and read by
`getActiveWorkspace()` (`registry.ts:136`, async) and `currentWorkspace()`
(`cli/lib/paths.ts:178`, sync — the path-resolution reader).

Because it is process-global on-disk state, concurrent sessions collide: running
`ralphy workspace use A` in one chat silently repoints every other running chat
that omits `--workspace`. A user working in several chats across different
projects/workspaces at once cannot rely on any workspace-defaulted verb. This is
a real, frequent workflow (multiple chats, different projects).

Decision (2026-07-21): **remove the global pointer entirely.** No shared mutable
active-workspace state. Workspace scope becomes explicit per invocation, or is
resolved from the project id.

## What

Delete the `activeWorkspace` pointer and the `workspace use` verb. Every
workspace-aware verb resolves its workspace by, in order:

1. an explicit `--workspace <slug>` flag (unchanged where it already exists);
2. for verbs that take a project `<id>`: the registry mapping `id → workspace`
   (`registry.json`) — no pointer needed;
3. otherwise the `default` workspace **constant** (`DEFAULT_WORKSPACE`), never a
   mutable pointer.

This keeps single-workspace use convenient (omit the flag → `default`) while
making concurrent multi-workspace chats collision-free (each passes
`--workspace`, or works by project id).

## Why it matters

The pointer is the one piece of cross-session shared state in the CLI. Removing
it makes every session self-describing and eliminates the stomp. It also
simplifies path resolution (no hidden global read inside `paths.ts`).

## Scope / acceptance

Landing must be atomic — a partial removal leaves callers reading a deleted
pointer. All of the following in one change:

**Core removal**
- `cli/lib/registry.ts`: remove `getActiveWorkspace` / `setActiveWorkspace`;
  `registry.ts:56` currently stamps a new project's `workspace` from
  `currentWorkspace()` — make the workspace an explicit argument to the create
  path (from `ralphy new --workspace`, default `default`).
- `cli/lib/paths.ts`: remove `currentWorkspace()`; give every helper that
  defaulted to it a **required** slug parameter — `projectsDir`, `batchesDir`,
  `templatesDir`, `campaignsDir`, `brandsDir`, `personasDir`, `workspaceRefsDir`,
  and the `sharedDir(currentWorkspace())` / `workspaceDir(currentWorkspace())`
  call sites (`paths.ts:223,241,245,249,256,260,264,272,292`). Keep
  `DEFAULT_WORKSPACE` as the constant fallback.
- `cli/lib/migrate.ts:708-722`: stop writing `activeWorkspace`; leave any legacy
  key in existing configs harmless (no read path).

**Command / lib call sites** (convert each to flag → project-id → `default`)
- `cli/commands/workspace.ts`: delete the `use` subcommand; fix `show` default
  (`:347` `slug ?? getActiveWorkspace()` → `slug ?? DEFAULT_WORKSPACE`), the
  `list` `active` flag (`:201`), and the default `show` block (`:153,158`).
- `cli/commands/memory.ts` (`:40,186,337`) and `cli/lib/memory/store.ts`
  (`:73,277,387,423,441,589`): `currentWorkspace()` fallbacks → `--workspace`,
  else global-only. Bare `ralphy` / `ralphy memory recall` show the **global**
  digest by default; a workspace-tier digest requires `--workspace`.
- `cli/lib/eval/workspace-evaluators.ts:199`: resolve the workspace from the
  project id, not the pointer.
- `cli/lib/research.ts:60,70,82` (ref-pull #401): `--workspace` targets that
  workspace's `shared/refs/`, else global `.ralphy/references/`.

**Docs (English-only) + regen**
- Remove/replace `ralphy workspace use` references: `AGENTS.md` (step 0 memory
  digest, invariant #18 "re-recall on workspace switch", the universe-studio
  routing row), `.agents/skills/universe-studio/SKILL.md`, `docs/cli-spec.md`,
  `docs/agent-guide.md`. Re-express "which workspace's memory" as: global by
  default, `--workspace` for a workspace digest.
- Regenerate `docs/cli-surface.generated.md` (`bun run cli:surface:build`).

**Tests**
- Update `tests/unit/workspace-layout.test.ts`, `tests/unit/memory-auto-recall.test.ts`,
  `tests/integration/cli-ref-pull-workspace.test.ts`, `tests/unit/generate-batch.test.ts`,
  `tests/integration/cli-workspace-108.test.ts`, `tests/integration/cli-migrate-106.test.ts`.
- Add a regression test: two path resolutions with different `--workspace` in the
  same process do not read a shared pointer.

**Gates**
- `bun test` green; `bun run lint:agents-md`, `bun run cli:surface:check`,
  `rg --pcre2 '\p{Cyrillic}'` clean.

## Notes

Trade-off the user accepted: omitting `--workspace` on a workspace-tier verb now
means the `default` workspace (a constant), not "wherever I last `use`d". Verbs
that take a project `<id>` are unaffected — they resolve via the registry, which
already stores `id → workspace`. Consider a clear error (not a silent `default`)
when a workspace-tier verb that cannot infer scope is run without `--workspace`,
so multi-workspace users are not surprised. Related: #552 (Postiz), #522
(multi-workspace farm scheduling, done).
