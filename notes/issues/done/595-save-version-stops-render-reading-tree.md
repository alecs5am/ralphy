# `hyperframes save-version` made render stop reading the Project tree

> **Status:** done — 2026-10-30 (save-version on a tree Project records the tree as the revision render builds; the checkout alias stays only for Compositions authored outside their tree)
> **Filed:** 2026-10-30
> **Folder:** issues
> **Severity:** high
> **Category:** bug / render / domain store

## Context

Found while landing #594. AGENTS.md invariant 14 tells agents to run `ralphy hyperframes save-version <project>` before a non-trivial `index.html` edit. On a store root that verb was an alias for `composition revise`: it created a checkout revision authored outside the Project tree. The #591 render rule builds such a revision as it is and stops reading the tree, so every later `index.html` edit silently did not render. Reproduced on a tmp root: render (tree revision), save-version, edit `index.html`, render again: the renderer saw the old file.

AGENTS.md also still said the snapshot lands at `compositions/v<N>.html`, which the store migration retired.

## Resolution

- `cli/commands/hyperframes.ts` `save-version`: for a Project whose video Composition is recorded from its tree (or has none yet), records the tree through `renderCompositionForProject`, the same append-only sealed revision `render` builds (an unchanged tree returns the existing revision). A Composition authored outside its tree (Desktop, `composition revise`, migration) keeps the deprecated `composition revise` behaviour; a root with no store still refuses.
- `tests/integration/store-root-render-591.test.ts`: the slug test expects the unchanged-tree revision; a new test edits after the snapshot and asserts the next render sees the edit.
- AGENTS.md invariant 14, `docs/domain-store.md`, the `project-tree-composition.ts` header and two mode playbooks describe the snapshot as a Composition revision of the tree; `catalog use` (#594) keeps `compositions/v<N>.html` only on a legacy tree-only root.
- Not handled: a store Project that already ran the old `save-version` keeps a checkout revision as its latest, and render still builds that one. None exists: the owner's store had no Compositions when checked (2026-10-30, read-only).
