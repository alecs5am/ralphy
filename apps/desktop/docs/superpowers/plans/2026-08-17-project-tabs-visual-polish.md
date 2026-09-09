# Project Tabs Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all six Project tabs with unclipped list states, readable previews, an icon timeline, a virtualized masonry media board, and a cleaner Overview.

**Architecture:** Keep the existing Project controllers, DTOs, cursor paging, scroll memory, and tab components. Use CSS and the current TanStack virtualizer for shared row geometry; use its native `lanes` support plus measured preview aspect ratios for masonry. Reuse existing Lucide icons and preview resolution instead of adding dependencies or contracts.

**Tech Stack:** React 19, TypeScript, CSS container queries, `@tanstack/react-virtual` 3.5, Lucide React, Vitest, Electron, Bun.

**Spec:** `docs/superpowers/specs/2026-08-17-project-tabs-visual-polish-design.md`

## Global Constraints

- No new package, database fixture, schema, IPC method, or CLI contract.
- Typography changes apply only inside Project tab content: 13-14px primary text and 12-13px metadata.
- Preserve cursor paging, scroll memory, mutations, accessible names, keyboard behavior, and focus visibility.
- The maximized 2K Denti AI project is the primary visual target; medium and narrow widths must not overflow horizontally.
- Keep the existing seven-column media maximum and preview scheduler.
- Preserve unrelated working-tree changes and do not touch `.ds-sync/` or `ds-bundle/`.
- Before each planned commit, inspect the staged diff. If it includes preexisting
  user changes that cannot be separated safely, skip that commit and keep the
  verified implementation unstaged.

---

### Task 1: Unclipped Master Lists and Document Reading Surface

**Files:**
- Modify: `src/screens/project/DocumentsPanel.tsx`
- Modify: `src/screens/project/UnitsPanel.tsx`
- Modify: `src/screens/project/CompositionsPanel.tsx`
- Modify: `src/styles/workbench.css`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: existing `useVirtualizer` row estimates and absolute row transforms.
- Produces: virtual rows whose outer slot includes a 4px gap and whose button is inset 6px horizontally; a 960px maximum document canvas.

- [ ] **Step 1: Write failing geometry assertions**

Extend the Chromium result with measured master-row edge insets, adjacent-row
gaps, and document viewer widths:

```ts
expect(results.flatMap(({ masterRowEdgeInset }) =>
  masterRowEdgeInset !== null && masterRowEdgeInset < 6 ? [masterRowEdgeInset] : [])).toEqual([]);
expect(results.flatMap(({ masterRowGap }) =>
  masterRowGap !== null && masterRowGap < 4 ? [masterRowGap] : [])).toEqual([]);
expect(results.filter(({ screen }) => screen === "documents").flatMap(({ documentViewerWidths, documentDetailWidth }) =>
  documentViewerWidths.filter((width) => width > Math.min(960, documentDetailWidth! - 48) + 1))).toEqual([]);
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bun test tests/design-system.test.ts`

Expected: FAIL because list insets/gaps and the 960px canvas token are absent.

- [ ] **Step 3: Make virtual slots and visual rows distinct**

Keep row estimates at their current readable heights, but let each button occupy `calc(100% - 4px)` inside its slot. Add `padding-inline: 6px` to each virtual list container and calculate row width from that containing block. Change composition rows from a hardcoded 60px height to the virtual slot height supplied by inline style:

```tsx
style={{ height: virtual.size, transform: `translateY(${virtual.start}px)` }}
```

Apply hover only through `:hover:not(.is-selected)`. Keep the existing inset focus rings and selection shadow.

- [ ] **Step 4: Build the document reading canvas**

Set `--document-canvas-width: 960px` on `.documents-detail.document-preview`. Center Markdown, JSON, plain text, review, and editor bodies within `min(var(--document-canvas-width), calc(100% - 48px))`; keep their content text left-aligned. Use 14px prose, 13px monospace code, and a 1.65 line height without changing sidebar/titlebar tokens.

- [ ] **Step 5: Run focused tests and commit**

Run: `bun test tests/design-system.test.ts`

Expected: PASS.

```bash
git add src/screens/project/DocumentsPanel.tsx src/screens/project/UnitsPanel.tsx src/screens/project/CompositionsPanel.tsx src/styles/workbench.css tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "fix(desktop): refine project master detail geometry"
```

---

### Task 2: Revision Rail Spacing and Detail Hierarchy

**Files:**
- Modify: `src/screens/project/CompositionsPanel.tsx`
- Modify: `src/screens/project/UnitsPanel.tsx`
- Modify: `src/styles/workbench.css`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: current horizontal revision virtualizers and existing preview components.
- Produces: revision slots with explicit 4px gaps and 6px edge insets; unchanged selection/mutation methods.

- [ ] **Step 1: Add failing rail assertions**

Measure the first revision button against the rail edge and the gap between two
revision buttons in the Chromium harness:

```ts
expect(results.flatMap(({ revisionEdgeInset }) =>
  revisionEdgeInset !== null && revisionEdgeInset < 6 ? [revisionEdgeInset] : [])).toEqual([]);
expect(results.flatMap(({ revisionGap }) =>
  revisionGap !== null && revisionGap < 4 ? [revisionGap] : [])).toEqual([]);
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bun test tests/design-system.test.ts`

Expected: FAIL on the new rail geometry.

- [ ] **Step 3: Include gaps in virtual revision slots**

Keep the existing composition estimate of 124px, but render each button at `calc(100% - 4px)` and offset virtual content by the rail's 6px padding. Preserve revision identity, title text, and click handlers. Give the nonvirtual Unit rail matching 6px side padding and 4px item separation.

- [ ] **Step 4: Refine preview hierarchy**

Use one raised detail surface, a calm `--panel-solid` preview well, and low-contrast separators. Increase primary detail text to 14px and metadata to 12px. Do not add cards around technical details or change disclosure behavior.

- [ ] **Step 5: Run focused tests and commit**

Run: `bun test tests/design-system.test.ts`

Expected: PASS.

```bash
git add src/screens/project/CompositionsPanel.tsx src/screens/project/UnitsPanel.tsx src/styles/workbench.css tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "fix(desktop): space project revision rails"
```

---

### Task 3: Semantic Activity Timeline

**Files:**
- Modify: `src/screens/project/ActivityTimeline.tsx`
- Modify: `src/styles/workbench.css`
- Modify: `tests/activity-timeline.test.tsx`

**Interfaces:**
- Produces: `activityAppearance(activity: Pick<ActivityDto, "action" | "entityType">): { tone: "document" | "run" | "composition" | "unit" | "feedback" | "success" | "archive" | "neutral"; Icon: LucideIcon }`.
- Consumes: existing Activity DTO action/entity strings; no payload or API expansion.

- [ ] **Step 1: Replace marker expectations with icon semantics**

```ts
expect(host.container.querySelectorAll(".activity-icon")).not.toHaveLength(0);
expect(host.container.querySelector(".activity-event[data-tone='success'] .activity-icon")).not.toBeNull();
expect(host.container.querySelectorAll(".activity-marker")).toHaveLength(0);
expect(activityAppearance({ action: "document.revised", entityType: "document" }).tone).toBe("document");
expect(activityAppearance({ action: "generation.completed", entityType: "run" }).tone).toBe("success");
expect(activityAppearance({ action: "project.archived", entityType: "project" }).tone).toBe("archive");
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bun test tests/activity-timeline.test.tsx`

Expected: FAIL because `activityAppearance`, icons, and tones do not exist.

- [ ] **Step 3: Add the minimal action-to-icon mapping**

Use existing Lucide exports `FileText`, `Play`, `Film`, `Layers3`, `MessageSquare`, `Check`, `Archive`, and `Activity`. Prefer milestone action suffixes before entity-type fallbacks. Render the chosen icon in `.activity-icon` and set `data-tone` on the event.

- [ ] **Step 4: Draw the timeline in CSS**

Use a pseudo-element on `.activity-virtual-list` for the vertical line. Align day headers, time, icon, action, and entity on one grid. Give tones restrained semantic colors; milestone emphasis changes icon surface and text weight, not the row background. Keep narrow-width wrapping inside the existing container query.

- [ ] **Step 5: Run focused tests and commit**

Run: `bun test tests/activity-timeline.test.tsx tests/design-system.test.ts`

Expected: PASS.

```bash
git add src/screens/project/ActivityTimeline.tsx src/styles/workbench.css tests/activity-timeline.test.tsx
gitleaks protect --staged --redact
git commit -m "feat(desktop): present project activity as timeline"
```

---

### Task 4: Masonry Geometry and Deterministic Fallbacks

**Files:**
- Modify: `src/lib/media.ts`
- Modify: `tests/media-grid.test.ts`

**Interfaces:**
- Produces: `mediaFallbackAspectRatio(kind: "image" | "video" | "audio" | null, stableKey: string): number`.
- Consumes: existing media kind and stable preview key; no metadata contract.

- [ ] **Step 1: Add failing fallback-ratio tests**

```ts
expect(mediaFallbackAspectRatio("audio", "a")).toBe(1.6);
expect(mediaFallbackAspectRatio(null, "document-a")).toBeGreaterThanOrEqual(0.72);
expect(mediaFallbackAspectRatio(null, "document-a")).toBeLessThanOrEqual(1.15);
expect(mediaFallbackAspectRatio(null, "document-a")).toBe(mediaFallbackAspectRatio(null, "document-a"));
expect(mediaFallbackAspectRatio(null, "document-a")).not.toBe(mediaFallbackAspectRatio(null, "document-b"));
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bun test tests/media-grid.test.ts`

Expected: FAIL because the fallback helper is absent.

- [ ] **Step 3: Implement stable bounded ratios**

Use a short unsigned integer hash loop local to `src/lib/media.ts`. Return stable kind defaults for audio (1.6), image (1.0), and video (16/9); return one of a small bounded portrait/square set for nonvisual files based on the hash. No package and no random values.

- [ ] **Step 4: Run the focused test and commit**

Run: `bun test tests/media-grid.test.ts`

Expected: PASS.

```bash
git add src/lib/media.ts tests/media-grid.test.ts
gitleaks protect --staged --redact
git commit -m "test(desktop): define stable media masonry ratios"
```

---

### Task 5: Virtualized Pinterest Media Board

**Files:**
- Modify: `src/components/VirtualAssetGrid.tsx`
- Modify: `src/styles/workbench.css`
- Modify: `tests/media-grid.test.ts`
- Modify: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: `mediaFallbackAspectRatio`, `assetGridGeometry`, `previewScheduler`, and TanStack virtualizer `lanes` plus `measureElement`.
- Produces: `MediaCardPreview` optional callback `onAspectRatio?(ratio: number): void` and cached intrinsic ratio per existing preview key.

- [ ] **Step 1: Add failing rendered-geometry assertions**

Extend the Chromium result for Media with rendered item rectangles, preview
aspect ratios, and overlap detection:

```ts
expect(results.filter(({ screen }) => screen === "media").flatMap(({ mediaOverlaps }) => mediaOverlaps)).toEqual([]);
expect(results.filter(({ screen }) => screen === "media").flatMap(({ mediaPreviewRatios }) => mediaPreviewRatios)
  .every((ratio) => ratio >= 0.5 && ratio <= 2.4)).toBe(true);
expect(results.find(({ screen, width }) => screen === "media" && width === 2560)?.mediaColumnCount).toBeLessThanOrEqual(7);
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `bun test tests/media-grid.test.ts tests/design-system.test.ts`

Expected: FAIL because the fixed row grid is still present.

- [ ] **Step 3: Cache intrinsic preview ratios**

Extend the local preview cache entry with `aspectRatio: number | null`. On image load use `naturalWidth / naturalHeight`; on video metadata use `videoWidth / videoHeight`. Accept only finite positive ratios and clamp them to `0.5...2.4`. Invoke `onAspectRatio` when the cached or newly learned value exists, while preserving scheduler release and error behavior.

- [ ] **Step 4: Replace row virtualization with native lanes**

```ts
const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => scrollRef.current,
  getItemKey: (index) => previewKey(project, rootEpoch, items[index]!.ref),
  estimateSize: (index) => geometry.tileWidth / ratios[index] + 54 + geometry.gap,
  lanes: geometry.columns,
  gap: geometry.gap,
  overscan: geometry.columns * 2,
});
```

Render each measured article absolutely using its `lane`, `start`, and calculated column width. Attach `data-index={virtual.index}` and `ref={virtualizer.measureElement}` to the positioned wrapper. Update a ratio map by stable preview key and call `virtualizer.measure()` after accepted ratio or column changes.

- [ ] **Step 5: Update masonry CSS**

Remove fixed tile and preview heights. Set preview `aspect-ratio: var(--asset-aspect)`, keep `object-fit: cover`, rounded preview corners, compact copy, inset selection ring, and visible keyboard focus. Preserve toolbar, slider, context menu, modal, and `AutoCursorTail`.

- [ ] **Step 6: Run focused tests and commit**

Run: `bun test tests/media-grid.test.ts tests/design-system.test.ts`

Expected: PASS.

```bash
git add src/components/VirtualAssetGrid.tsx src/styles/workbench.css tests/media-grid.test.ts tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "feat(desktop): virtualize project media masonry"
```

---

### Task 6: Overview Composition

**Files:**
- Modify: `src/screens/project/OverviewPanel.tsx`
- Modify: `src/styles/workbench.css`
- Modify: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: existing `ProjectOverviewDto` sections and navigation callbacks only.
- Produces: wide main/supporting layout with a metrics band and the same exact navigation targets.

- [ ] **Step 1: Add failing composition geometry assertions**

Use the Chromium harness to measure the Overview narrative/supporting columns:

```ts
expect(results.filter(({ screen }) => screen === "overview").map(({ width, overviewNarrativeColumns }) => ({ width, overviewNarrativeColumns })))
  .toEqual([{ width: 2560, overviewNarrativeColumns: 2 }, { width: 1360, overviewNarrativeColumns: 2 }, { width: 1100, overviewNarrativeColumns: 1 }]);
expect(results.flatMap(({ overviewColumnRatio }) =>
  overviewColumnRatio !== null && (overviewColumnRatio < 1.8 || overviewColumnRatio > 2.3) ? [overviewColumnRatio] : [])).toEqual([]);
```

- [ ] **Step 2: Run focused test and confirm failure**

Run: `bun test tests/design-system.test.ts`

Expected: FAIL because the narrative/supporting columns do not exist.

- [ ] **Step 3: Regroup existing sections without new data**

Keep the metrics band first. Place Current state, Production stream, and Recent activity in `.overview-primary-column`. Place Media library, Deliverables, and Distribution in `.overview-support-column`. Preserve empty-state conditions and every existing navigation callback.

- [ ] **Step 4: Reduce repeated boxes**

At 1100px and above, use `minmax(0, 1.55fr) minmax(320px, .75fr)`. Use one raised state surface, a quiet metrics strip, section separators, compact row hover surfaces, and a single-column fallback below that breakpoint. Do not invent media thumbnails because the Overview DTO exposes counts only.

- [ ] **Step 5: Run focused test and commit**

Run: `bun test tests/design-system.test.ts`

Expected: PASS.

```bash
git add src/screens/project/OverviewPanel.tsx src/styles/workbench.css tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "feat(desktop): refine project overview composition"
```

---

### Task 7: Visual QA and Full Verification

**Files:**
- Modify only if QA exposes a defect: `src/styles/workbench.css`
- Modify only if QA exposes a rendering defect: `src/screens/project/DocumentsPanel.tsx`, `src/screens/project/CompositionsPanel.tsx`, `src/screens/project/UnitsPanel.tsx`, `src/screens/project/ActivityTimeline.tsx`, `src/screens/project/OverviewPanel.tsx`, or `src/components/VirtualAssetGrid.tsx`.
- Test only if QA exposes an uncovered regression: the corresponding focused test.

**Interfaces:**
- Consumes: Tasks 1-6 and existing Denti AI data.
- Produces: verified 2K, medium, and narrow layouts with Electron left running on Denti AI.

- [ ] **Step 1: Run static verification**

```bash
bun run typecheck
bun test tests/media-grid.test.ts tests/activity-timeline.test.tsx tests/design-system.test.ts
```

Expected: all commands pass.

- [ ] **Step 2: Restart the development Electron app**

```bash
RALPHY_BIN='/Applications/Ralphy Media.app/Contents/Resources/bin/ralphy' bun run start
```

Expected: Electron opens the current home `.ralphy` library.

- [ ] **Step 3: Inspect Denti AI at 2K**

Open workspace `Denti Ai`, project `Denti Perio Pitch 001`, and inspect all six tabs. Check list edge insets, hover/selected/focus separation, document canvas alignment, revision rail edges, timeline icon alignment, masonry settling, and visible text sizes.

- [ ] **Step 4: Exercise interactions**

Keyboard-focus representative rows and media cards; select adjacent items; open a document; scroll each independent pane; change media density; open media preview and context menu; trigger cursor append. Confirm no horizontal page scroll and no state changes radius or dimensions.

- [ ] **Step 5: Inspect medium and narrow layouts**

Resize through a medium width and below the 720px project-container breakpoint. Confirm stacked master/detail layouts, one-column Overview, wrapped Activity metadata, reduced masonry columns, and reachable controls. Restore maximized 2K.

- [ ] **Step 6: Apply only evidence-backed corrections**

For each observed defect, add the smallest regression assertion when practical, patch the responsible selector/component, and rerun its focused test. Do not add speculative polish.

- [ ] **Step 7: Run full verification**

```bash
bun run typecheck
bun test
bun run build
git diff --check
```

Expected: typecheck, all tests, build, and diff check pass.

- [ ] **Step 8: Record the final workspace state**

Run `git status --short` and confirm only the known shared changes plus this
implementation are present. Leave Electron running on Denti AI in the
maximized 2K window. Do not create an empty QA commit.
