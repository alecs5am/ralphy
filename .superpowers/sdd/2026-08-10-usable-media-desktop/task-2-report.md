# Task 2 report — usable media Desktop grid

## Result

- Restored deterministic responsive grid geometry and the existing per-kind FIFO preview scheduler without adding a dependency.
- Added a 128-entry immutable Project/ref/root-epoch preview cache. Only mounted virtual tiles resolve through `resolveProjectPreview`; stale unmounted results cannot publish.
- Restored 16:10 image, video, and bounded audio tile previews with fallback glyphs, selection, double-click Open, and a separate keyboard-reachable Open control.
- Kept the current Core cursor/filter structure and explicit Load more path; rendering the grid does not drain hidden pages.

## TDD evidence

- RED: `bun run test -- tests/project-media-presentation.test.tsx` exited 1 with the expected missing Open-control assertion while the other 4 tests passed.
- Full RED: `bun run test -- tests/media-grid.test.ts tests/project-media-presentation.test.tsx` exited 1 because `src/lib/media.ts` was absent and the current text-only tile still lacked the Open control.
- GREEN: `bun run test -- tests/media-grid.test.ts tests/project-media-presentation.test.tsx` passed 14 tests across 2 files.
- Typecheck: `bun run typecheck` exited 0.
- Repository build: `bun run build` exited 0.
- Whitespace gate: `git diff --check` exited 0.

## Scope and concerns

- No dependency, CSS/design cleanup, raw path, Finder/Trash/drag, annotation, client filtering, hidden page load, Core/schema, package/install, or live `.ralphy` change was made.
- Task 3 owns the modal viewer. Until it lands, both tile Open routes intentionally call the current `openMedia` inline-preview action through the new distinct `onOpen(card)` callback.
- The worktree already contained substantial unrelated unstaged Desktop changes; they were preserved. The three modified Task 2-listed files already contained the approved Core-backed UI foundation and are staged whole per owner direction; no path outside the Task 2 inventory/report is staged.
