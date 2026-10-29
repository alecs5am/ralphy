# Store-root render and project creation gaps

> **Status:** todo
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
