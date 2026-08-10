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
- During the initial task, the approved Core-backed UI/domain foundation remained unstaged while the Task 2-listed files were committed whole per owner direction. Review round 1 records that complete foundation separately before the Task 2 fix.

## Review fix round 1

- Foundation commit `804f838` records the complete approved 4C3A/B/C, Task 5, and ghost-filter Desktop source/test inventory that Task 2 already consumed: App/controls/header, safe media components, Project/Workspace controllers, composition helper/panel, React host, and obsolete legacy deletions. Before that commit, typecheck, cached diff-check, and staged gitleaks all exited 0 with no unstaged source/test path.
- RED: `bun run test -- tests/media-grid.test.ts` ran 14 tests with 6 failures and 8 passes. It reproduced the colon-tuple cache alias, one stale-image replacement commit, image/video/audio load failures retaining the broken element, and bounded audio starting its second resolver at metadata instead of decode/stream readiness.
- Replaced the ambiguous cache key with a JSON tuple, bound preview state/rendering and React tile keys to the full identity, invalidated only the exact failed cache entry, and added optional safe `AudioWaveform` readiness/error callbacks. Project/root/resolver/Open inputs are now required.
- Expanded the committed React host only enough for real measurements, event bubbling, native Enter/Space activation, and Tab focus. Tests now use the real virtualizer and cover production 4/2/1 FIFO/idempotent/error/queued-unmount release, bounded and streaming audio serialization, the byte ceiling, 128-entry eviction, media failure recovery, and dispatched keyboard behavior.
- GREEN: the focused two-file gate passed 20 tests; `bun run typecheck` exited 0; the full Desktop suite passed 344 tests with 1 intentional live-Core skip across 40 files.
