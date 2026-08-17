# Ralphy Media Interaction Polish And Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved workspace-first navigation, custom controls, utility panels, stable media grid, shared-layout modal viewer, neutral visual system, and supplied macOS icon.

**Architecture:** Keep the existing Electron IPC and Ralphy media domain intact. Extend renderer preferences, add focused headless UI primitives, derive virtual rows from deterministic geometry, and use Motion at shell and overlay boundaries rather than animating every virtualized item.

**Tech Stack:** Electron 43.2, React 19, TypeScript, Vite, Motion for React, Radix Select and Dialog, Boring Avatars, TanStack Virtual, semantic CSS tokens.

## Global Constraints

- Use Bun for dependencies, tests, and builds.
- Keep `.ralphy` indexing, watcher, annotations, Trash, and IPC contracts unchanged.
- Keep the selected project scan lazy; never scan all media at startup.
- Respect `prefers-reduced-motion`.
- Use `corner-shape: squircle` with radius fallback; pills remain round.
- The packaged output remains `release/Ralphy Media.app`.

---

### Task 1: Preference And Workspace-First State

**Files:**
- Modify: `src/state/workbench.ts`
- Modify: `src/App.tsx`
- Test: `tests/workbench-state.test.ts`

**Interfaces:**
- Produces: `WorkspaceView`, expanded `WorkbenchPreferences`, and `mostRecentWorkspaceId(workspaces)`.
- Consumes: existing reducer routes, catalog restoration, and local storage adapter.

- [ ] Add failing tests proving defaults are grid/sidebar-open/panels-closed,
  preferences round-trip, and newest workspace fallback is deterministic.
- [ ] Run `bun test tests/workbench-state.test.ts` and confirm the new tests
  fail because the preference fields and fallback helper do not exist.
- [ ] Extend preference normalization and make restore/library selection open
  the saved workspace or `mostRecentWorkspaceId`.
- [ ] Add `Cmd+B`, panel toggles, and preference writes in `App`.
- [ ] Re-run the focused tests and `bun run typecheck`.

### Task 2: Stable Virtual Grid Geometry

**Files:**
- Modify: `src/lib/media.ts`
- Modify: `src/components/VirtualAssetGrid.tsx`
- Modify: `src/components/AssetTile.tsx`
- Modify: `src/styles/workbench.css`
- Test: `tests/media-query.test.ts`

**Interfaces:**
- Produces: `assetGridGeometry(width, targetTileWidth, gap)` returning columns,
  tile width, tile height, and row height.
- Consumes: grouped media rows and TanStack Virtual.

- [ ] Add failing geometry tests for 800px, 1110px, and narrow widths, including
  the invariant `rowHeight >= tileHeight + gap`.
- [ ] Run the focused test and confirm it fails because
  `assetGridGeometry` is absent.
- [ ] Implement the pure geometry helper and use explicit virtual row heights;
  remove dynamic measurement of absolutely positioned rows.
- [ ] Apply stable `min-height`, containment, and aspect ratio to cards.
- [ ] Re-run the focused test and inspect a real text-heavy project grid.

### Task 3: Headless Selectors And Sidebar Shell

**Files:**
- Create: `src/components/ui/SelectMenu.tsx`
- Create: `src/components/ProfileAvatar.tsx`
- Modify: `src/components/ContextSidebar.tsx`
- Modify: `src/components/ProjectControls.tsx`
- Modify: `src/components/Titlebar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/workbench.css`
- Modify: `package.json`
- Modify: `bun.lock`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Produces: `SelectMenu<Value>`, deterministic profile avatar, sidebar toggle,
  workspace selector, and non-native group/sort controls.
- Consumes: workspace/project sorting and application navigation callbacks.

- [ ] Add a failing source contract asserting the renderer has no `<select>`
  and includes a `Cmd+B` shortcut plus both panel ARIA labels.
- [ ] Run `bun test tests/design-system.test.ts` and confirm the contract fails.
- [ ] Install exact current Motion, Radix Select/Dialog, and Boring Avatars
  packages with Bun.
- [ ] Implement the shared select primitive and replace every native select.
- [ ] Rebuild the sidebar around an always-active workspace selector and
  deterministic profile footer.
- [ ] Add open/closed header chrome matching the references.
- [ ] Re-run design tests and typecheck.

### Task 4: Workspace Views And Utility Panels

**Files:**
- Create: `src/components/UtilityPanels.tsx`
- Modify: `src/screens/WorkspaceScreen.tsx`
- Modify: `src/components/Inspector.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/workbench.css`
- Test: `tests/workbench-state.test.ts`

**Interfaces:**
- Produces: grid/list workspace presentation, right context panel, and bottom
  terminal shell.
- Consumes: persisted `WorkspaceView`, selected workspace/project/asset, and
  existing inspector annotation callbacks.

- [ ] Add a failing preference test showing workspace view defaults to grid and
  persists list.
- [ ] Implement grid/list controls and Motion layout transitions.
- [ ] Implement context-aware right panel and animated bottom terminal shell.
- [ ] Connect the two header buttons and preserve accurate `aria-pressed`.
- [ ] Re-run focused state tests and typecheck.

### Task 5: Shared-Layout Asset Modal

**Files:**
- Modify: `src/screens/AssetViewer.tsx`
- Modify: `src/components/AssetTile.tsx`
- Modify: `src/components/VirtualAssetGrid.tsx`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `src/styles/app.css`
- Modify: `src/styles/workbench.css`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Produces: Radix dialog lightbox with Motion `layoutId`, backdrop,
  previous/next navigation, and in-place grid preservation.
- Consumes: existing preview loading, Markdown renderer, feedback formatter,
  Finder/external actions, and viewer state.

- [ ] Add a failing source contract for `layoutId`, Radix Dialog, and a mounted
  project grid while the viewer is open.
- [ ] Implement shared `layoutId` on the tile and dialog surface.
- [ ] Keep `ProjectScreen` mounted beneath `AnimatePresence`; remove the old
  alternate main-view branch.
- [ ] Preserve Escape, previous/next, mouse back, Copy for Agent, and all media
  renderers.
- [ ] Verify reduced motion and re-run focused tests and typecheck.

### Task 6: Neutral Visual Pass And Supplied Icon

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/app.css`
- Modify: `src/styles/workbench.css`
- Replace: `assets/app-icon-1024.png`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Produces: neutral computed surfaces, larger smooth radii, consistent controls,
  and exact supplied icon artwork with transparent outer corners.
- Consumes: current icon build script and Chromium 150 smooth-corner support.

- [ ] Add failing token assertions for `#181818`, `#2d2d2d`, larger radii, no
  main-header bottom rule, and smooth dialog/menu/card corners.
- [ ] Update tokens and complete the workspace/project/modal/panel visual pass.
- [ ] Replace the icon master from the supplied file and remove only its
  border-connected white background.
- [ ] Build `.icns` and inspect 1024px, 128px, 32px, and Dock rendering.
- [ ] Re-run design tests and typecheck.

### Task 7: Full Package Verification

**Files:**
- Modify only if verification exposes a root-cause defect.

**Interfaces:**
- Produces: verified packaged app open on the real library.
- Consumes: all completed renderer and icon work.

- [ ] Run `bun test`, `bun run typecheck`, `bun run smoke`, and the real-library
  benchmark.
- [ ] Run `git diff --check` and `gitleaks protect --staged --redact`.
- [ ] Run `bun run package:mac` and strict deep codesign verification.
- [ ] Exercise sidebar, workspace selector, grid/list, right/bottom panels,
  selectors, card modal, Markdown, Copy for Agent, mouse back, and live watcher
  in the packaged app.
- [ ] Capture desktop screenshots at default and minimum window sizes, inspect
  overlap and smooth corners, then leave one non-debug app instance open.
