# Ralphy Instrument Redesign v11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v11 Instrument shell, complete light/dark/system theming, Marketplace WIP mode, project dock, media review console, strict dither app icon, and verified desktop preview without regressing existing product flows.

**Architecture:** Keep App and the existing workspace/project controllers as the state owners. Add only a small theme runtime and a narrow ProjectScreen-to-shell context callback; compose the new shell from the current sidebar, header, chat, and project controls rather than replacing the data layer. Use CSS variables and scoped Instrument selectors to migrate presentation, with Media as the pixel-fidelity reference and the other screens retaining their information architecture.

**Tech Stack:** Electron 43, React 19, TypeScript, Vite, Vitest, Motion, Lucide, existing Radix Dialog/Select, CSS variables, local WOFF2 fonts, Bun.

**Spec:** `docs/superpowers/specs/2026-08-19-instrument-redesign-v11.md`

## Global Constraints

- Work only in `ralphy-desktop` on branch `instrument-redesign-v11`.
- Use Bun and add no npm lockfile.
- Do not import sibling TypeScript source or change a cross-repository contract; the existing published Core `media.review` method may be exposed through Desktop's IPC boundary.
- No new UI framework, state library, theme package, or runtime dependency.
- No decorative borders, inset highlights, shadows, glass, blur, or depth gradients in the new visual system.
- Red `#E0362C` is reserved for rejection, alerts, destructive actions, and exceptional states.
- Preserve input validation, IPC sender/root fencing, error handling, accessible names, focus behavior, reduced motion, and unsaved-document protection.
- Terminal renderer controls disappear; Electron terminal backend code remains.
- Marketplace stays honest WIP; Local Models remains reachable and no fake inventory or progress is rendered.
- The final icon uses flat black/white geometry, one `#E0362C` accent, restrained dither, and no mascot/text/3D/glow.
- Every non-trivial behavior change leaves one focused runnable test.

---

### Task 1: Persistent theme and mode state

**Files:**
- Create: `src/theme.ts`
- Modify: `src/state/workbench.ts`
- Modify: `src/App.tsx`
- Modify: `src/screens/SettingsScreen.tsx`
- Test: `tests/workbench-state.test.ts`
- Test: `tests/theme.test.ts`
- Test: `tests/profile-menu.test.tsx`

**Interfaces:**
- Produces: `ThemePreference = "system" | "light" | "dark"`, `WorkbenchMode = "work" | "marketplace"`, and `watchTheme(preference, onResolved): () => void`.
- Produces: real `theme`, `onThemeChange`, `mode`, and `onModeChange` state owned by App.
- Consumes: existing `readWorkbenchPreferences` / `writeWorkbenchPreferences` persistence and Settings overlay.

- [ ] **Step 1: Add failing preference migration tests**

Extend `tests/workbench-state.test.ts` with exact assertions:

```ts
expect(readWorkbenchPreferences(emptyStorage()).theme).toBe("system");
expect(readWorkbenchPreferences(emptyStorage()).mode).toBe("work");
expect(readWorkbenchPreferences(storageWith({ theme: "light", mode: "marketplace" }))).toMatchObject({
  theme: "light",
  mode: "marketplace",
});
expect(readWorkbenchPreferences(storageWith({ theme: "sepia", mode: "store" }))).toMatchObject({
  theme: "system",
  mode: "work",
});
```

- [ ] **Step 2: Add a failing system-theme runtime test**

Create `tests/theme.test.ts` with a fake `MediaQueryList` and verify that
`watchTheme("system", listener)` immediately reports `dark`, reports `light`
after a `change` event, and removes exactly the listener it added. Verify fixed
`light` and `dark` preferences do not install a media-query listener.

- [ ] **Step 3: Run the focused tests and confirm red**

Run:

```bash
bun run test -- tests/workbench-state.test.ts tests/theme.test.ts
```

Expected: failures for missing theme/mode fields and missing `src/theme.ts`.

- [ ] **Step 4: Implement the smallest theme runtime and preference migration**

Use these exact public types and behavior:

```ts
export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export function watchTheme(
  preference: ThemePreference,
  onResolved: (theme: ResolvedTheme) => void,
): () => void;
```

For fixed preferences, call `onResolved` once and return a no-op cleanup. For
system, use `window.matchMedia("(prefers-color-scheme: dark)")`, report the
current value, subscribe to `change`, and remove that listener on cleanup.

Add `theme` and `mode` to `WorkbenchPreferences`, default them to `system` and
`work`, validate them during reads, and persist them with the existing debounced
write in App. App sets `document.documentElement.dataset.theme` to the resolved
theme and `style.colorScheme` to the same value.

- [ ] **Step 5: Connect Appearance Settings to App-owned theme state**

Change `SettingsScreen` to accept:

```ts
theme: ThemePreference;
onThemeChange(theme: ThemePreference): void;
```

Render the exact three choices `System`, `Light`, `Dark`. Remove the disconnected
local `useState("Dark")`. Keep density and motion as existing session-only UI.

- [ ] **Step 6: Run focused tests, typecheck, and commit**

Run:

```bash
bun run test -- tests/workbench-state.test.ts tests/theme.test.ts tests/profile-menu.test.tsx
bun run typecheck
```

Commit:

```bash
git add src/theme.ts src/state/workbench.ts src/App.tsx src/screens/SettingsScreen.tsx tests/workbench-state.test.ts tests/theme.test.ts tests/profile-menu.test.tsx
git commit -m "feat: add Instrument theme preferences"
```

### Task 2: Instrument shell, navigation modes, and terminal removal

**Files:**
- Create: `src/components/ActivityIsland.tsx`
- Create: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Titlebar.tsx`
- Modify: `src/components/ContextSidebar.tsx`
- Modify: `src/components/WorkspacePicker.tsx`
- Modify: `src/components/ProfileMenu.tsx`
- Modify: `src/components/UtilityPanels.tsx`
- Modify: `src/state/workbench.ts`
- Test: `tests/workspace-navigation.test.tsx`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: Task 1 `theme` and `mode` App state.
- Produces: one top row, left Instrument stack, Marketplace WIP route surface,
  honest activity display, and Local Models entry inside Marketplace.
- Preserves: current workbench route when toggling modes.

- [ ] **Step 1: Write failing shell/navigation tests**

Add assertions that the rendered App shell contains accessible `My Work` and
`Marketplace` mode buttons; selecting Marketplace renders `WORK IN PROGRESS`
and a `Local Models` action; returning to My Work preserves the previous
workspace route. Assert My Work sidebar has no `THIS COMPUTER` section and no
visible `Local Models`, `Settings`, `Toggle bottom panel`, or terminal shortcut.

Add a focused `ActivityIsland` test with project and alert props to verify it
renders only supplied state and never sample text such as `WAN`, `MB/S`, or a
clock.

- [ ] **Step 2: Run focused tests and confirm red**

Run:

```bash
bun run test -- tests/workspace-navigation.test.tsx tests/design-system.test.ts
```

Expected: missing mode controls, Marketplace surface, and ActivityIsland.

- [ ] **Step 3: Replace split titlebar chrome with the Instrument top row**

`Titlebar.tsx` renders one drag region with traffic lights, left collapse,
centered `ActivityIsland`, right collapse, and avatar. Keep every interactive
control inside a `-webkit-app-region: no-drag` element and preserve accessible
names. `ActivityIsland` accepts explicit display data rather than reading global
state:

```ts
export interface ActivityIslandState {
  projectName: string | null;
  status: string | null;
  count: number | null;
  busyLabel: string | null;
  progress: number | null;
  alert: string | null;
}
```

Clamp progress to 0..100 for display. Omit absent segments.

- [ ] **Step 4: Recompose the sidebar as the v11 widget stack**

Keep the existing workspace sort and picker callbacks. Add the mode switch,
workspace identity card, navigation widget, optional real-count context widget,
and user pill. Remove the My Work `THIS COMPUTER` nav. The identity card opens
the current WorkspacePicker without duplicating its state.

- [ ] **Step 5: Add Marketplace WIP and relocate Local Models**

`MarketplaceScreen` renders a flat WIP notice and one working Local Models card.
App uses `mode` to render this surface without dispatching a workbench route.
Opening Local Models retains Marketplace mode; closing it returns to the WIP
landing. Switching to My Work restores the untouched current route.

- [ ] **Step 6: Remove terminal exposure from App**

Remove `bottomPanelVisible`, `bottomPanelHeight`, bottom-panel resize/rendering,
the titlebar button, and the `⌘J` handler from App and preferences. Keep
`BottomPanel`, terminal components, bridge methods, and Electron backend files
unchanged. Legacy stored bottom-panel keys are ignored.

- [ ] **Step 7: Run focused checks and commit**

Run:

```bash
bun run test -- tests/workspace-navigation.test.tsx tests/design-system.test.ts tests/workbench-state.test.ts
bun run typecheck
```

Commit:

```bash
git add src/App.tsx src/components/ActivityIsland.tsx src/components/Titlebar.tsx src/components/ContextSidebar.tsx src/components/WorkspacePicker.tsx src/components/ProfileMenu.tsx src/components/UtilityPanels.tsx src/screens/MarketplaceScreen.tsx src/state/workbench.ts tests/workspace-navigation.test.tsx tests/design-system.test.ts tests/workbench-state.test.ts
git commit -m "feat: build Instrument application shell"
```

### Task 3: Project dock, shell context, and working media review console

**Files:**
- Create: `src/components/ReviewConsole.tsx`
- Modify: `electron/media/types.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/ralphy/project-reader.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/ProjectControls.tsx`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/screens/project/MediaPanel.tsx`
- Modify: `src/state/project-screen-controller.ts`
- Test: `tests/project-reader.test.ts`
- Test: `tests/ipc-security.test.ts`
- Test: `tests/project-screen-behavior.test.tsx`
- Test: `tests/project-media-presentation.test.tsx`

**Interfaces:**
- Produces: `reviewProjectMedia(project, artifactId, expectedSelectedRevisionId, verdict)` on `MediaWorkbenchBridge`.
- Produces: `ProjectShellContext` callback from ProjectScreen to App and ReviewConsole.
- Produces: icon-only project dock while retaining ARIA tab semantics.

- [ ] **Step 1: Add failing IPC boundary tests for `media.review`**

Add `MEDIA_CHANNELS.reviewProjectMedia = "project:media:review"` and write tests
first. The main handler must accept only a trusted sender, active root,
`artifact` identifier, non-empty selected revision guard, and one of
`approved | needs-work | rejected`. It must send this exact Core request:

```ts
request("media.review", {
  context: { workspaceId, projectId },
  ref: { type: "artifact", id: artifactId },
  expectedSelectedRevisionId,
  verdict,
})
```

The result must match the requested artifact/project scope before reaching the
renderer. Update the preload allowlist test to include exactly one new method.

- [ ] **Step 2: Add failing controller and ReviewConsole behavior tests**

Test these exact rules:

- clicking the selected media card again clears selection;
- `reviewSelectedMedia("approved")` calls the bridge once for an Artifact with
  its selected revision, replaces the card in the current page with the returned
  card, and keeps it selected;
- non-Artifact or unselected Artifact cards reject locally without an IPC call;
- `A`, `N`, and `R` invoke approved, needs-work, and rejected only when focus is
  not in an input/textarea/contenteditable element;
- Escape clears the console selection;
- previous/next moves within the currently loaded media items without paging or
  wrapping.

- [ ] **Step 3: Run the focused tests and confirm red**

Run:

```bash
bun run test -- tests/project-reader.test.ts tests/ipc-security.test.ts tests/project-screen-behavior.test.tsx tests/project-media-presentation.test.tsx
```

- [ ] **Step 4: Implement and validate the Desktop review bridge**

Add the channel, preload method, strict parser, secured handler, and mock bridge
method. Reuse `projectContext`, `validId`, the current session request, sender
validation, and post-request root fence. Do not accept arbitrary renderer-owned
Core params.

- [ ] **Step 5: Add minimal controller actions and shell context publishing**

Extend `ProjectScreenApi` with `reviewProjectMedia`. Add controller methods:

```ts
clearMediaSelection(): void;
selectAdjacentMedia(direction: -1 | 1): void;
reviewSelectedMedia(verdict: "approved" | "needs-work" | "rejected"): Promise<void>;
```

`ProjectScreen` reports a serializable display snapshot plus stable action
callbacks to App through `onShellContextChange`. Clear that context on unmount
or when leaving Media. Avoid storing the controller itself in App state.

- [ ] **Step 6: Replace gooey tabs with the project dock and render ReviewConsole**

Keep the current `ProjectControls` tab list and keyboard movement helper, but
render Lucide icon buttons for Overview, Documents, Media, Units, and Activity
inside a floating `role="tablist"` dock. App stacks ReviewConsole above
AgentChatPanel only when Media selection exists. The console renders preview,
name, metadata, verdict actions, previous/next, status/error feedback, and the
specified keyboard bindings.

- [ ] **Step 7: Run focused checks and commit**

Run:

```bash
bun run test -- tests/project-reader.test.ts tests/ipc-security.test.ts tests/project-screen-behavior.test.tsx tests/project-media-presentation.test.tsx tests/project-screen.test.tsx
bun run typecheck
```

Commit:

```bash
git add electron/media/types.ts electron/preload.ts electron/ralphy/project-reader.ts src/lib/ipc.ts src/App.tsx src/components/ReviewConsole.tsx src/components/ProjectControls.tsx src/screens/ProjectScreen.tsx src/screens/project/MediaPanel.tsx src/state/project-screen-controller.ts tests/project-reader.test.ts tests/ipc-security.test.ts tests/project-screen-behavior.test.tsx tests/project-media-presentation.test.tsx
git commit -m "feat: add Instrument media review console"
```

### Task 4: v11 tokens, shell styling, and high-fidelity Media presentation

**Files:**
- Create: `public/assets/fonts/Doto-Variable.woff2`
- Create: `public/assets/fonts/OFL-Doto.txt`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/app.css`
- Modify: `src/styles/workbench.css`
- Modify: `src/styles/settings.css`
- Modify: `src/styles/local-models.css`
- Modify: `src/components/VirtualAssetGrid.tsx`
- Modify: `src/screens/project/MediaPanel.tsx`
- Test: `tests/design-system.test.ts`
- Test: `tests/media-grid.test.ts`
- Test: `tests/project-media-presentation.test.tsx`

**Interfaces:**
- Consumes: Task 1 root `data-theme` and Tasks 2-3 shell markup.
- Produces: exact v11 token layer and 1440x900 Media geometry in both themes.
- Preserves: virtualizer, preview scheduler, paging, density stops, context menu,
  viewer, and hover-video behavior.

- [ ] **Step 1: Add failing design-token and Media-markup tests**

Assert the token source contains both theme selectors, exact desk/widget/red
values, `--shadow-pop: none`, local Doto face, and no remote font import. Assert
Media cards expose a status-dot class, external caption, selected `IN CONSOLE`
label, and no in-frame lifecycle strip. Keep tests semantic; do not snapshot the
entire CSS file.

- [ ] **Step 2: Run focused tests and confirm red**

Run:

```bash
bun run test -- tests/design-system.test.ts tests/media-grid.test.ts tests/project-media-presentation.test.tsx
```

- [ ] **Step 3: Bundle Doto and replace the root token system**

Download the official Doto variable WOFF2 and OFL text once, store them under
`public/assets/fonts`, and declare it locally. Replace legacy accent/glass/shadow
tokens with the exact spec values. Define light values on
`:root, :root[data-theme="light"]` and dark overrides on
`:root[data-theme="dark"]`. Preserve compatibility aliases such as `--canvas`,
`--panel-solid`, `--raised`, `--fg`, and `--danger` so existing screens migrate
without parallel theme logic.

- [ ] **Step 4: Implement shell geometry and flat component states**

Style the 8px desk grid, 48px top row, 240px sidebar stack, flexible main desk,
292px right rail, R24 widgets, 36px island, round mode switch, identity card,
nav rows, user pill, project dock, chat widget, and review console. Remove legacy
blur, borders, and shadows from those surfaces. Keep visible ink focus outlines.

- [ ] **Step 5: Match the Media handoff**

At 1440x900, target four natural-ratio lanes with 10px gaps, R14 `#060606`
frames, external 11.5px captions, 6px status dots, compact filter pills, Doto
item count, 3px density track, selected ink ring, and `IN CONSOLE` badge. Map
current Core states to approved/needs-work/rejected/unreviewed without inventing
values. Video previews play muted on hover and reset on leave.

- [ ] **Step 6: Add constrained-width rules**

Keep 1100x720 usable: right rail may collapse, sidebar stays 240px when open,
filter controls wrap, dock remains reachable, and the main desk never receives
an artificial fixed width. Keep the existing virtualizer geometry responsive.

- [ ] **Step 7: Run focused checks and commit**

Run:

```bash
bun run test -- tests/design-system.test.ts tests/media-grid.test.ts tests/project-media-presentation.test.tsx
bun run typecheck
```

Commit:

```bash
git add public/assets/fonts/Doto-Variable.woff2 public/assets/fonts/OFL-Doto.txt src/styles/tokens.css src/styles/app.css src/styles/workbench.css src/styles/settings.css src/styles/local-models.css src/components/VirtualAssetGrid.tsx src/screens/project/MediaPanel.tsx tests/design-system.test.ts tests/media-grid.test.ts tests/project-media-presentation.test.tsx
git commit -m "feat: apply Instrument visual system"
```

### Task 5: Migrate every remaining screen and secondary surface

**Files:**
- Modify: `src/styles/workbench.css`
- Modify: `src/styles/settings.css`
- Modify: `src/styles/local-models.css`
- Modify: `src/styles/app.css`
- Modify: `src/screens/WorkspaceProjectsScreen.tsx`
- Modify: `src/screens/MemoryScreen.tsx`
- Modify: `src/screens/CalendarScreen.tsx`
- Modify: `src/screens/LocalModelsScreen.tsx`
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/components/WelcomeScreen.tsx`
- Modify: `src/screens/MigrationRecoveryScreen.tsx`
- Test: `tests/design-system.test.ts`
- Test: `tests/workspace-navigation.test.tsx`
- Test: `tests/memory-screen.test.tsx`
- Test: `tests/calendar-screen.test.tsx`
- Test: `tests/local-models-screen.test.tsx`

**Interfaces:**
- Consumes: Task 4 token compatibility layer.
- Produces: consistent Instrument presentation across all non-Media screens and
  overlays while leaving their controllers and Core contracts unchanged.

- [ ] **Step 1: Add failing presentation-contract tests**

Add narrow assertions for the intentional structural changes only: Settings has
the real three-way theme selector, Workspace Projects uses Instrument card
classes, placeholders render inside the desk surface, and Local Models can be
opened from Marketplace. Existing behavior tests remain the regression suite.

- [ ] **Step 2: Run representative tests and confirm red**

Run:

```bash
bun run test -- tests/workspace-navigation.test.tsx tests/memory-screen.test.tsx tests/calendar-screen.test.tsx tests/local-models-screen.test.tsx tests/design-system.test.ts
```

- [ ] **Step 3: Retune workspace and project sections**

Apply Instrument tokens and flat hierarchy to Workspace Projects, placeholders,
Overview, Documents, Units, and Activity. Preserve DOM and behavior unless a
small class hook is necessary. Remove hardcoded legacy purple, old status
pastels, decorative line boxes, and shadows in the touched selectors.

- [ ] **Step 4: Retune complex workspace screens**

Memory and Calendar retain their current layouts, dialogs, drawers, lifecycle
states, date/time controls, and mutations. Convert their surfaces, pills,
status indicators, focus rings, and modal geometry to the v11 system. Keep red
only for their existing failure/destructive semantics.

- [ ] **Step 5: Retune secondary surfaces and empty states**

Migrate Settings, Local Models, welcome, migration recovery, agent menus,
context menus, media viewer, dialogs, and toasts. Ensure menus/popovers have
surface contrast without shadows or borders. Keep connection/security errors
and destructive confirmations explicit.

- [ ] **Step 6: Run the full renderer regression set and commit**

Run:

```bash
bun run test -- tests/design-system.test.ts tests/workspace-navigation.test.tsx tests/memory-screen.test.tsx tests/calendar-screen.test.tsx tests/local-models-screen.test.tsx tests/project-screen.test.tsx tests/documents-panel.test.tsx tests/units-panel.test.tsx
bun run typecheck
```

Commit:

```bash
git add src/styles/workbench.css src/styles/settings.css src/styles/local-models.css src/styles/app.css src/screens/WorkspaceProjectsScreen.tsx src/screens/MemoryScreen.tsx src/screens/CalendarScreen.tsx src/screens/LocalModelsScreen.tsx src/screens/SettingsScreen.tsx src/components/WelcomeScreen.tsx src/screens/MigrationRecoveryScreen.tsx tests
git commit -m "feat: finish Instrument screen migration"
```

### Task 6: Strict dither icon, build, visual comparison, and handoff

**Files:**
- Modify: `assets/app-icon-1024.png`
- Modify: `build/icon.icns` only if the existing icon script tracks it
- Create: `docs/visual-review/instrument-v11/README.md`
- Create: `docs/visual-review/instrument-v11/*.png`
- Modify: tests or source files only for defects found during verification

**Interfaces:**
- Consumes: completed Instrument UI and the repository's existing
  `scripts/build-mac-icon.sh`, package, smoke, and screenshot tooling.
- Produces: selected app icon, built application, screenshot evidence, and an
  open preview for the user.

- [ ] **Step 1: Generate and select strict icon concepts**

Use built-in image generation for at least three focused flat-mark explorations:

1. mechanical `R` module;
2. compact instrument/dial glyph;
3. abstract dither aperture.

Every prompt requires black/white geometry, one `#E0362C` indicator, restrained
dither, centered square composition, no text, no mascot, no gradients, no 3D,
no glow, and no watermark. Inspect all results, select the clearest mark, and
copy only the selected final to `assets/app-icon-1024.png`.

- [ ] **Step 2: Verify icon sizes and rebuild macOS assets**

Run:

```bash
bun run icon:mac
```

Inspect 16, 32, 128, and 1024px renderings. If the small sizes lose the red
indicator or silhouette, simplify the selected icon and regenerate once.

- [ ] **Step 3: Run full automated verification**

Run:

```bash
bun run typecheck
bun run test
bun run build
bun run smoke
```

Record exact commands and outcomes in
`docs/visual-review/instrument-v11/README.md`. Do not describe a failing check as
passing.

- [ ] **Step 4: Capture and compare live application screenshots**

Launch the Electron app against live local data. Capture 1440x900 screenshots
for Media light, Media dark, Marketplace WIP, Workspace Projects, Memory,
Calendar, Settings, and Local Models, plus one 1100x720 constrained layout.
Store them in `docs/visual-review/instrument-v11/`. Compare Media light/dark to
handoff 3a/3b for shell geometry, colors, typography, density, caption placement,
console/chat proportions, and absence of forbidden depth effects.

- [ ] **Step 5: Dispatch the final adversarial reviews**

Create one review package from the branch merge base. Dispatch independent
agents for:

- visual fidelity and responsive layout;
- keyboard/accessibility and interaction behavior;
- code, IPC security, state consistency, and regression risk.

Combine all Critical and Important findings into one fix dispatch, apply one fix
wave, then run one scoped re-review. Record any residual ruling in the SDD ledger.

- [ ] **Step 6: Repeat verification after fixes and leave preview open**

Re-run affected focused tests, `bun run typecheck`, `bun run test`, and
`bun run build`. Re-capture screens changed by fixes. Start the final built app
and leave it open for the user.

- [ ] **Step 7: Commit final assets and evidence**

Run `gitleaks protect --staged --redact`, then commit:

```bash
git add assets/app-icon-1024.png build/icon.icns docs/visual-review/instrument-v11
git commit -m "chore: verify Instrument redesign preview"
```
