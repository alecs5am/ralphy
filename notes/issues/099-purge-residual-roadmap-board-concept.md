# Purge the residual roadmap-board concept (keep only notes/issues/)

> **Status:** issue (cleanup; non-blocking — links already fixed)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** low (stale prose + one orphan script; nothing breaks)
> **Category:** docs / tooling / process

## What

The roadmap board is retired: `roadmap/` (7a0aaa7) and `notes/roadmap/` (this batch) are both deleted; we keep only the `notes/issues/` inbox. The 21 dead `../roadmap/` doc links were de-linked so `lint:docs-links` passes, but residual references to the roadmap *as a live process* remain and should be purged:

- **`docs/developing-ralphy.md`** — the "Where things live" section (lines ~14, 26, 27) still describes `roadmap/` as "the source of truth for in-flight work" with the `todo/doing/done/cancelled` lifecycle + `validate-roadmap.ts`. Rewrite to: notes/issues/ is the only tracker; no roadmap board.
- **`notes/README.md`** — documents the roadmap board lifecycle + the `notes/ → roadmap/` promotion flow. Trim to just the `ideas/ issues/ decisions/` inbox (issues/ being the live one).
- **`scripts/validate-roadmap.ts`** — orphan now (scans the deleted `roadmap/`). Delete it. Also drop the `roadmap` scan path from `scripts/lint-docs-links.ts` (it skips the missing dir gracefully today, but the reference is dead).
- **`AGENTS.md`** — the dev-mode trigger references "a roadmap task (`01.02.03`)" and a SPEC marker; reword to point at issues only.
- **`.agents/skills/dev-tasks/SKILL.md`** — the skill manages the `roadmap/` board lifecycle; rescope it to the `notes/` inbox (or fold into `dev-issues`).
- **`.github/ISSUE_TEMPLATE/feature.yml`** — links to `github.com/.../tree/main/roadmap` (now 404) + a "roadmap categories" prompt; repoint to issues or drop.

## Related

- #084 (templates/ retirement), #086-#097 (library refactor). The roadmap deletion was a user decision ("keep only existing issues", 2026-06-04).
