# Store-root render and project creation gaps

> **Status:** done — 2026-10-30 (root causes: the render, compose and hyperframes store paths passed the positional slug to Composition queries instead of the resolved Project id; CLI-created Projects never got a video Composition; `new` opened the ambient store on a tree-only root. Render now records the Project tree as an append-only video Composition revision; `new` refuses a tree-only root with E_MIGRATION_INCOMPLETE)
> **Filed:** 2026-10-30
> **Folder:** issues
> **Severity:** high
> **Category:** bug / domain store / render

## Context

Found while fixing #589 (`notes/issues/done/589-render-on-fresh-root-hides-next-project.md`). On a root with `ralphy.db`:

1. Projects created with `ralphy new` or `ralphy project create` have no video Composition, and store-root `ralphy render` requires one, so a CLI-created store Project cannot be rendered.
2. `ralphy render <slug>` fails with a misleading `E_INTERNAL Project not found: <slug>` for an existing Project: `videoCompositionForProject(query, projectId)` gets the positional slug instead of the resolved `domainContext.projectId` (`cli/commands/render.ts:286`, `cli/commands/compose.ts:74`, `cli/commands/hyperframes.ts:361,471`).
3. `ralphy new <B>` on a tree-only root (project trees, no store) creates the store and hides the existing trees.

## What

- Render resolves the Project through the resolved scope (id or slug) everywhere.
- Store-root render works for a CLI-created Project with `index.html`: create or bind its video Composition from the project's HyperFrames tree on first render (or at creation), recorded as a revision.
- `new` on a tree-only root refuses with a clear migration error (as `setup` does) instead of creating an empty store.

## Scope / acceptance

- Integration tests (HOME isolated): store root, `new` → write index.html → `render <slug>` succeeds; `render <id>` succeeds; tree-only root + `new` gives the migration error and leaves existing trees visible.
- Existing render, compose and hyperframes tests pass.

## Resolution

- `cli/commands/render.ts`, `compose.ts`, `hyperframes.ts` (`render`,
  `save-version`): store queries take `domainContext.projectId`, the id scope
  resolution resolved from the positional id or slug; dry-run output reports
  that id.
- `cli/lib/project-tree-composition.ts` (`renderCompositionForProject`, used by
  `render` and `hyperframes render`): a Project with no video Composition (or
  whose latest revision was recorded from its tree) gets its tree's HyperFrames
  sources recorded as a sealed `hyperframes` revision with engine config
  `{"source": "project-tree"}`; a changed tree records a child revision, an
  unchanged tree builds the same revision. Recorded at render, not at creation:
  the sources do not exist at creation (`index.html` is written afterwards,
  `project create` makes no tree), and only a render-time snapshot follows later
  edits. Compositions authored any other way are built as they are. A Project
  with neither a Composition nor an `index.html` is refused with
  `E_INPUT_INVALID` instead of `E_INTERNAL`.
- `cli/commands/new.ts`: without a resolved store scope, a root that holds
  Project trees or registry Projects (`holdsProjectsWithoutStore`, #589) is
  refused with `E_MIGRATION_INCOMPLETE` plus a stderr note naming `ralphy
  migrate audit`; nothing is created.
- Not changed: `compose` and `hyperframes save-version` still need an existing
  video Composition (they do not record one from the tree).

## Tests

`tests/integration/store-root-render-591.test.ts` (HOME isolated, HyperFrames
`bunx` stub on PATH): `new` → index.html → `render <slug>` and `render <id>`
succeed, an edit records a child revision; `project create` → tree → `render`,
then `compose`, `hyperframes render`, `hyperframes save-version` by slug; a
Project without Composition or index.html gets `E_INPUT_INVALID`; a tree-only
root refuses `new` with `E_MIGRATION_INCOMPLETE`, creates no store, and the
existing tree still renders (dry run).
