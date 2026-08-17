# Ralphy Media Design System Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transfer the supplied Ralphy Media handoff exactly, including native smooth corners, macOS vibrancy, scalable application chrome, compact controls, and a generated mascot icon.

**Architecture:** Keep the existing React/media architecture and replace only the visual shell. Central tokens drive semantic CSS, split chrome components own sidebar/main window controls, and the existing data-driven screens retain their behavior. Electron 43 supplies Chromium 150 for native `corner-shape`.

**Tech Stack:** Electron 43.2.0, Chromium 150, React 19, TypeScript, Vite, semantic CSS tokens, lucide-react, built-in image generation.

## Global Constraints

- `handoff/mockups/03-new-ui.dc.html` screen 01 is the visual source of truth.
- Do not change media scanning, IPC contracts, filesystem behavior, or review persistence.
- Use native `corner-shape: squircle` with a border-radius fallback.
- Do not add Tailwind or a corner polyfill during this transfer.
- Keep asset virtualization and preview concurrency limits intact.
- Package output remains `release/Ralphy Media.app`.

---

### Task 1: Runtime And Token Foundation

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `src/styles/tokens.css`
- Modify: `electron/main.ts`
- Modify: `scripts/smoke-electron.mjs`

**Interfaces:**
- Consumes: existing BrowserWindow and renderer boot contract.
- Produces: Electron 43 runtime, native vibrancy, semantic visual tokens, and a smoke assertion for smooth-corner support.

- [ ] **Step 1: Upgrade Electron**

Set the dev dependency to `"electron": "43.2.0"` and run:

```bash
bun install
```

- [ ] **Step 2: Copy the approved tokens**

Replace `src/styles/tokens.css` with the supplied handoff token sheet and wrap
the `corner-shape` block in `@supports (corner-shape: squircle)`.

- [ ] **Step 3: Enable macOS vibrancy**

Add these BrowserWindow options:

```ts
vibrancy: "sidebar",
visualEffectState: "active",
backgroundColor: "#00000000",
```

- [ ] **Step 4: Make smoke verify the required runtime**

The renderer readiness expression must include:

```js
CSS.supports("corner-shape", "squircle")
```

- [ ] **Step 5: Verify**

Run:

```bash
bun run typecheck
bun run smoke
```

Expected: Electron launches, reports readiness, and exits zero.

### Task 2: Full-Height Application Chrome

**Files:**
- Modify: `src/components/Titlebar.tsx`
- Modify: `src/components/ContextSidebar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/screens/LibraryScreen.tsx`
- Modify: `src/screens/WorkspaceScreen.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: existing navigation callbacks, catalog, route, workspaces, projects, pins.
- Produces: `SidebarChrome`, `MainHeader`, full-height sidebar/inspector, contextual nav, and library footer.

- [ ] **Step 1: Split application chrome**

Export `SidebarChrome` and `MainHeader` from `Titlebar.tsx`. Keep history,
breadcrumbs, library chooser, and inspector callbacks unchanged.

- [ ] **Step 2: Expand contextual sidebar**

Pass `catalog.rootPath` and `onChooseLibrary` into `ContextSidebar`. Add the
workspace switcher, All workspaces/Units/Shared library nav, truncated list
footer, and library path footer described by the spec.

- [ ] **Step 3: Remove duplicate workspace shortcuts**

Delete `.workspace-shortcuts` markup from `WorkspaceScreen`; those counts now
live in the contextual sidebar.

- [ ] **Step 4: Move header ownership into main content**

Render `MainHeader` as the first main-column row while keeping project/viewer
switching mounted exactly as before.

- [ ] **Step 5: Implement the one-row workbench grid**

Use `--sidebar-w`, `--inspector-w`, and `--titlebar-h`. Preserve the 1100x720
minimum and hidden project-screen behavior.

- [ ] **Step 6: Verify navigation**

Run:

```bash
bun test tests/workbench-state.test.ts
bun run typecheck
```

Expected: navigation and preference tests pass.

### Task 3: Controls, Surfaces, And Responsive Density

**Files:**
- Modify: `src/components/ProjectControls.tsx`
- Modify: `src/components/AssetTile.tsx`
- Modify: `src/components/Inspector.tsx`
- Modify: `src/components/ReviewControls.tsx`
- Modify: `src/styles/app.css`
- Modify: `tests/media-query.test.ts`

**Interfaces:**
- Consumes: `MediaQueryOptions`, grid size, annotation vocabulary, current filter callbacks.
- Produces: one segmented mode control, one wrapping chip toolbar, status dots, readable type scale, and smooth selection/focus rings.

- [ ] **Step 1: Preserve filter behavior with a reset check**

Add a test proving the default query clears mode-specific filters without
changing `includeIntermediate`.

- [ ] **Step 2: Collapse project controls**

Render one segmented mode group and one toolbar containing search, Filters,
active type/review chips, Group, Sort, Intermediates, reset, item count, and
grid size.

- [ ] **Step 3: Apply handoff surface rules**

Remove non-structural borders, old pink/hard-coded greys, uppercase transforms,
9px/10px text, and weight 500. Use background steps, 6/8/12px radii, rings,
semantic status dots, and tokenized motion.

- [ ] **Step 4: Make the inspector full-height**

Use a column layout, primary accent Copy for Agent button, neutral review
buttons with dots, and bottom-pinned file actions.

- [ ] **Step 5: Verify**

Run:

```bash
bun run test
bun run typecheck
rg -n "#e778a3|font-size: (9|10)px|text-transform: uppercase|font-weight: 500" src/styles
```

Expected: tests pass and ripgrep returns no matches.

### Task 4: Mascot App Icon

**Files:**
- Create: `assets/app-icon-1024.png`
- Modify: `scripts/build-mac-icon.sh`
- Delete: `assets/app-icon.svg`

**Interfaces:**
- Consumes: Ralphy mascot SVG reference and Codex material/composition reference.
- Produces: alpha PNG master and derived macOS `.icns`.

- [ ] **Step 1: Generate the icon source**

Use built-in image generation with the approved mascot/material prompt on a
uniform chroma-key background.

- [ ] **Step 2: Remove chroma key and validate alpha**

Run the installed `remove_chroma_key.py` helper with soft matte and despill.
Confirm RGBA mode, transparent corners, centered subject, and clean edges.

- [ ] **Step 3: Update the icon pipeline**

Use `assets/app-icon-1024.png` as the master input. Continue deriving every
iconset size with `sips` and assemble with `iconutil`.

- [ ] **Step 4: Inspect**

Render the `.icns` master and inspect at 1024px and 64px.

### Task 5: Full Verification And Package

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes: completed design transfer and icon.
- Produces: tested, signed, packaged application open on the real library.

- [ ] **Step 1: Run complete verification**

```bash
bun run typecheck
bun run test
bun test
bun run build
bun run smoke
bun run benchmark /Users/maximovchinnikov/github/ralphy/ralphy/.ralphy
git diff --check
gitleaks detect --source . --redact
```

- [ ] **Step 2: Package and verify signature**

```bash
bun run package:mac
codesign --verify --deep --strict "release/Ralphy Media.app"
```

- [ ] **Step 3: Visual acceptance**

Inspect the packaged app at 1360x860 and 1100x720. Verify sidebar/inspector
dimensions, native vibrancy, smooth corners, chip wrapping, grid overflow,
Markdown rendering, in-place viewer, and real-media previews.

- [ ] **Step 4: Commit**

```bash
git add -A
gitleaks protect --staged --redact
git commit -m "feat: apply Ralphy Media design system"
```

- [ ] **Step 5: Leave the app open**

Open `release/Ralphy Media.app` on the real Denti project Assets screen.
