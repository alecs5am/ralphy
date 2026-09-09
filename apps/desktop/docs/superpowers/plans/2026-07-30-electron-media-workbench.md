# Electron Media Workbench Implementation Plan

> **Implementation note:** preserve the native prototype branch for reference,
> but do not import Swift code or retain its visual layer.

## Task 1: Core Contracts, Scanner Worker, And IPC

**Files:**
- Create `electron/media/types.ts`
- Create `electron/media/catalog.ts`
- Create `electron/media/project-scanner.ts`
- Create `electron/media/annotations.ts`
- Create `electron/media/watcher.ts`
- Create `electron/media/worker.ts`
- Rewrite `electron/main.ts`
- Rewrite `electron/preload.ts`
- Rewrite `src/lib/ipc.ts`
- Modify `scripts/build-electron.mjs`
- Create focused tests under `tests/`

Steps:

1. Add Vitest and failing fixture tests for shallow startup, one-project scan,
   Ralphy entity classification, containment, annotations, and watcher routing.
2. Implement serializable shared contracts without sibling source imports.
3. Build bounded shallow catalog reads and cancellable project-only traversal.
4. Add generation-cost indexing for the selected project.
5. Expose validated preload IPC for library selection, catalog/project loads,
   annotations, Trash, Finder, clipboard, bounded text reads, and live events.
6. Run focused tests, full test suite, and build.

## Task 2: Workbench Shell And Contextual Navigation

**Files:**
- Rewrite `src/App.tsx`
- Create `src/state/workbench.ts`
- Create `src/components/Titlebar.tsx`
- Create `src/components/ContextSidebar.tsx`
- Create `src/screens/LibraryScreen.tsx`
- Create `src/screens/WorkspaceScreen.tsx`
- Rewrite `src/styles/tokens.css`
- Rewrite `src/styles/app.css`

Steps:

1. Add reducer tests for Library -> Workspace -> Project navigation, app-local
   restoration, recency sorting, pinning, and stale result rejection.
2. Build the 44/280/main shell with one transitioning sidebar.
3. Implement non-redundant library/workspace operational summaries.
4. Match Codex density and Ralphy semantic accents at 1440 and 1100 widths.
5. Verify no project scan occurs before project selection.

## Task 3: Project Surface And Virtualized Grid

**Files:**
- Create `src/screens/ProjectScreen.tsx`
- Create `src/components/ProjectHeader.tsx`
- Create `src/components/ProjectControls.tsx`
- Create `src/components/VirtualAssetGrid.tsx`
- Create `src/components/AssetTile.tsx`
- Create `src/lib/media.ts`

Steps:

1. Add query/mode/selection/scroll-state tests.
2. Implement Overview, Finals, Assets, Refs, Units, and Files.
3. Render only visible grid rows with `@tanstack/react-virtual`.
4. Use lazy media URLs, bounded metadata work, fixed aspect ratios, and stable
   row geometry.
5. Keep all active controls readable and remove duplicate state summaries.

## Task 4: Review, Inspector, Viewer, And Agent Feedback

**Files:**
- Create `src/components/Inspector.tsx`
- Create `src/screens/AssetViewer.tsx`
- Create `src/components/MarkdownView.tsx`
- Create `src/components/ReviewControls.tsx`
- Create `src/lib/agent-feedback.ts`

Steps:

1. Add review mutation, feedback formatting, viewer history, Markdown, and
   keyboard/mouse navigation tests.
2. Implement durable statuses, favorite, rating, tags, notes, and atomic save.
3. Add image/video/audio/text/Markdown/PDF viewer in the main region.
4. Restore the exact project presentation on Back.
5. Wire Copy for Agent, Finder, external open, and recoverable Trash.

## Task 5: Live Sync, Performance, Packaging, And Final Review

**Files:**
- Create `scripts/benchmark-media.ts`
- Create Electron smoke/e2e tests
- Add packaging configuration and self-contained icon resources
- Update README files

Steps:

1. Route FSEvents to shallow catalog or selected-project refresh only.
2. Add scan and renderer benchmarks with production budgets.
3. Bound caches, media elements, observers, workers, and object URLs.
4. Package a macOS `.app` and run it against the real library.
5. Exercise live sync, every mode, Markdown, review, Copy for Agent, and Trash
   with a temporary fixture.
6. Capture 1440x900 and 1100x720 screenshots and resolve visual findings.
7. Run TypeScript, Vitest, Electron smoke, build, benchmark, and gitleaks.
8. Request independent code/visual review, resolve findings, and leave the
   packaged app open.

