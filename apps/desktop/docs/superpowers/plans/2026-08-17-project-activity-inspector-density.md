# Project Activity Inspector and Dense Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contain and compact project master lists, center Media audio cards, and turn Activity into a filterable log table with a right-side detail inspector.

**Architecture:** Keep the Ralphy activity wire contract unchanged. Add one desktop adapter method that loads `run.show` plus a bounded `run.attempts` page, expose it through the existing Electron IPC bridge, and let the Activity renderer cache visible run details locally. Reuse the existing virtualizers, bundled Ralphy mascot, bundled LobeHub icons, and CSS tokens.

**Tech Stack:** Electron, React 19, TypeScript, TanStack Virtual, Lucide React, existing CSS token system, Vitest, Bun.

**Spec:** `docs/superpowers/specs/2026-08-17-project-activity-inspector-density-design.md`

## Global Constraints

- Work only in `ralphy-desktop`; do not change the Ralphy CLI protocol or import sibling source.
- Use Bun and existing dependencies; add no icon or table package.
- Preserve unrelated dirty-worktree changes and do not touch `.ds-sync/` or `ds-bundle/`.
- Every production behavior starts with a failing test and a verified red-green cycle.
- Keep activity enrichment bounded to the first `run.attempts` page and exclude prompts/provider payloads.
- Run `bun run build` before completion.

---

### Task 1: Contained dense master rows and revision rails

**Files:**
- Modify: `tests/design-system.test.ts`
- Modify: `tests/documents-panel.test.tsx`
- Modify: `tests/units-panel.test.tsx`
- Modify: `tests/composition-view.test.tsx`
- Modify: `src/screens/project/DocumentsPanel.tsx`
- Modify: `src/screens/project/CompositionsPanel.tsx`
- Modify: `src/screens/project/UnitsPanel.tsx`
- Modify: `src/styles/workbench.css`

**Interfaces:**
- Consumes: existing TanStack virtual item `start` and `size` values.
- Produces: protected virtual canvases with 4 px edge space, 6 px inter-row gaps, and compact 50–54 px rows.

- [ ] **Step 1: Write failing geometry and density tests**

Extend the Chromium geometry result with top/bottom row insets and revision top/left insets. Assert every Documents, Compositions, and Units master list has at least 4 px top containment, at least 6 px row separation, and a row estimate no larger than 56 px. Assert Composition and Unit revision rings have at least 4 px edge containment and 6 px separation.

- [ ] **Step 2: Run the focused tests and verify the current rows fail**

Run: `bun run test -- tests/design-system.test.ts tests/documents-panel.test.tsx tests/units-panel.test.tsx tests/composition-view.test.tsx`

Expected: FAIL because the first master rows start at 0, current gaps are 4 px, and rows/revisions are taller than the new limits.

- [ ] **Step 3: Implement protected compact virtual geometry**

Use constants local to each panel:

```ts
const LIST_EDGE = 4;
const ROW_GAP = 6;
const ROW_SIZE = 54;
```

Set virtual canvas height to `virtualizer.getTotalSize() + LIST_EDGE * 2`, translate each row by `start + LIST_EDGE`, and set row height to `size - ROW_GAP`. Use 52 px for Composition rows when their content fits. Apply the same leading/trailing space to the horizontal Composition rail and compact the Unit flex rail with CSS padding/gap.

- [ ] **Step 4: Tighten badges and padding without reducing readable text below tokens**

Reduce file/status badges to 24 px, row vertical padding to 6–7 px, and keep primary/secondary text at `--text-base`/`--text-sm`. Keep hover limited to `:hover:not(.is-selected)` and preserve 2 px focus visibility.

- [ ] **Step 5: Run the focused tests and verify green**

Run: `bun run test -- tests/design-system.test.ts tests/documents-panel.test.tsx tests/units-panel.test.tsx tests/composition-view.test.tsx`

Expected: PASS.

### Task 2: Center compact Media audio previews

**Files:**
- Modify: `tests/media-grid.test.ts`
- Modify: `tests/design-system.test.ts`
- Modify: `src/components/media/AudioWaveform.tsx`
- Modify: `src/styles/workbench.css`

**Interfaces:**
- Consumes: `AudioWaveform compact` used by `MediaCardPreview`.
- Produces: `.audio-waveform-player.is-compact` with a centered inner group while the non-compact viewer remains unchanged.

- [ ] **Step 1: Write failing behavior and Chromium layout tests**

Render a compact audio card and assert it contains one `.audio-compact-content` group. In Chromium assert the compact player uses `justify-content: center`, the content group is vertically centered within the preview, and the normal player does not use the compact group.

- [ ] **Step 2: Run the focused tests and verify red**

Run: `bun run test -- tests/media-grid.test.ts tests/design-system.test.ts`

Expected: FAIL because compact controls are currently direct children pinned to the top.

- [ ] **Step 3: Add the minimum compact wrapper and styles**

Wrap only compact heading/waveform output in:

```tsx
<div className="audio-compact-content">…</div>
```

Center the compact player and group, hide the duplicated compact filename while retaining status/duration, and keep play plus waveform keyboard controls intact.

- [ ] **Step 4: Run focused tests and verify green**

Run: `bun run test -- tests/media-grid.test.ts tests/design-system.test.ts`

Expected: PASS.

### Task 3: Add safe run activity enrichment to the desktop bridge

**Files:**
- Modify: `electron/media/types.ts`
- Modify: `electron/ralphy/project-reader.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/state/project-screen-controller.ts`
- Modify: `tests/project-reader.test.ts`
- Modify: `tests/ipc-security.test.ts`
- Modify: `tests/project-screen-behavior.test.tsx`

**Interfaces:**
- Produces type:

```ts
export type ActivityRunDetail = {
  run: import("../ralphy/types").RunDto;
  attempts: import("../ralphy/types").RunAttemptDto[];
  nextCursor: string | null;
};
```

- Produces bridge method: `loadProjectActivityRun(project: ProjectReference, runId: string): Promise<ActivityRunDetail>`.
- Produces controller method: `loadActivityRun(runId: string): Promise<ActivityRunDetail>`.

- [ ] **Step 1: Write failing project-reader tests**

Assert the adapter validates the project/run ID, requests `run.show` with project context, requests `run.attempts` with `limit: PROJECT_PAGE_LIMIT`, returns only the validated run/attempt DTOs, and rejects malformed IDs or malformed attempt pages.

- [ ] **Step 2: Run the project-reader test and verify red**

Run: `bun run test -- tests/project-reader.test.ts`

Expected: FAIL because `loadProjectActivityRun` does not exist.

- [ ] **Step 3: Implement the bounded reader method**

Add a reader method beside other project-detail loaders. Reuse existing `projectContext`, `validId`, `request`, `RunDto`, and `RunAttemptDto` validation patterns. Never return generation inputs, credentials, provider requests, or provider responses.

- [ ] **Step 4: Write failing IPC and controller exposure tests**

Assert the new channel is in `MEDIA_CHANNELS`, preload invokes only that channel, main registers it, the renderer bridge exposes it, and controller forwards a validated run ID using its current project reference.

- [ ] **Step 5: Run the IPC/controller tests and verify red**

Run: `bun run test -- tests/ipc-security.test.ts tests/project-screen-behavior.test.tsx`

Expected: FAIL because the IPC/controller method is not wired.

- [ ] **Step 6: Wire the existing bridge layers**

Add `loadProjectActivityRun` to `MediaWorkbenchBridge`, `MEDIA_CHANNELS`, preload, main handler, browser fallback bridge, `ProjectScreenApi`, and `ProjectScreenController`. Keep it as a return-value method; do not add snapshot state.

- [ ] **Step 7: Run bridge tests and typecheck**

Run: `bun run test -- tests/project-reader.test.ts tests/ipc-security.test.ts tests/project-screen-behavior.test.tsx && bun run typecheck`

Expected: PASS.

### Task 4: Replace the Activity timeline with logs table and inspector

**Files:**
- Create: `src/screens/project/activity-presentation.ts`
- Create: `src/screens/project/ActivityInspector.tsx`
- Modify: `src/screens/project/ActivityTimeline.tsx`
- Modify: `src/styles/workbench.css`
- Modify: `tests/activity-timeline.test.tsx`
- Modify: `tests/design-system.test.ts`

**Interfaces:**
- Produces `activitySource(event): "ralphy" | "generation" | "production"`.
- Produces `activitySearchText(event, detail?): string`.
- Consumes `controller.loadActivityRun(runId)` and caches `ActivityRunDetail` by run ID in component state.
- Produces accessible `.activity-log`, `.activity-table`, and `.activity-inspector` surfaces.

- [ ] **Step 1: Write failing pure classification tests**

Use literal events and assert run/generation → `generation`, document/composition/unit/iteration/feedback/build/publication → `production`, project/workspace/system/migration/unknown → `ralphy`. Assert search includes resolved provider/model but never hidden payload fields.

- [ ] **Step 2: Run Activity tests and verify red**

Run: `bun run test -- tests/activity-timeline.test.tsx`

Expected: FAIL because classification helpers and table UI do not exist.

- [ ] **Step 3: Implement pure presentation helpers**

Keep classification, humanization, cost summing, duration formatting, unique provider/model extraction, and search text in `activity-presentation.ts`. Use no React state or IPC in this file.

- [ ] **Step 4: Write failing interaction tests**

Assert the renderer exposes table headers, source filter, search, rows with `aria-selected`, keyboard Arrow Up/Down selection, Enter/click inspector opening, Escape/close behavior, Ralphy mascot for system events, bundled `AiBrandIcon` for resolved models, retry after enrichment error, and unchanged cursor/scroll behavior.

- [ ] **Step 5: Run interaction tests and verify red**

Run: `bun run test -- tests/activity-timeline.test.tsx`

Expected: FAIL because rows are non-interactive timeline items and no inspector/filter exists.

- [ ] **Step 6: Implement the virtual logs table**

Retain TanStack Virtual and `AutoCursorTail`. Replace day headings with a sticky table header and one row per event. Add search/source/model state, selected sequence state, visible-run enrichment with an in-flight `Set`, and a detail cache keyed by run ID. Source filtering works before enrichment; model filtering uses resolved cached details.

- [ ] **Step 7: Implement the inspector**

Render the selected base event immediately. For run events show loading/error/retry, then state, duration, model/provider, known summed cost, identifiers, timestamps, and the bounded attempts table. Close on Escape and restore focus to the selected row.

- [ ] **Step 8: Add responsive and focus-safe Activity CSS**

Use a wide two-column grid with a 360–420 px inspector. Below 900 px make it an absolute right drawer; below 640 px fill the content width. Keep table horizontal overflow contained, rows at least 44 px, selected/hover states distinct, and all focus rings visible.

- [ ] **Step 9: Run Activity and Chromium geometry tests**

Run: `bun run test -- tests/activity-timeline.test.tsx tests/design-system.test.ts`

Expected: PASS with no horizontal overflow at 2560, 1360, or 1100 px.

### Task 5: Full verification and DentiAI visual QA

**Files:**
- Verify only; modify affected files only if a failing test or observed regression identifies a concrete root cause.

**Interfaces:**
- Consumes all preceding deliverables.
- Produces a running final Electron app on the DentiAI project.

- [ ] **Step 1: Run focused changed-area tests**

Run: `bun run test -- tests/design-system.test.ts tests/documents-panel.test.tsx tests/units-panel.test.tsx tests/composition-view.test.tsx tests/media-grid.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts tests/project-screen-behavior.test.tsx tests/activity-timeline.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run: `bun run typecheck && bun run test && bun run build && git diff --check`

Expected: exit 0; all tests pass; only the existing Vite chunk-size advisory may remain.

- [ ] **Step 3: Restart the current Electron dev app**

Run: `RALPHY_BIN='/Applications/Ralphy Media.app/Contents/Resources/bin/ralphy' bun run start`

Expected: the app opens the existing `~/.ralphy` library.

- [ ] **Step 4: Visually inspect DentiAI on the real 2K display first**

Check Documents, Compositions master/revision lists, Units master/revision lists, centered audio cards, Activity filters/table/inspector, model/Ralphy icons, loading/error states, keyboard selection, and focus containment.

- [ ] **Step 5: Inspect system half-width and automated 1100 px geometry**

Confirm Activity inspector becomes a drawer and master/detail tabs retain usable density without clipped focus surfaces.

- [ ] **Step 6: Leave the final app running on DentiAI Activity with one event selected**

Expected: the user can immediately inspect the redesigned interaction.
