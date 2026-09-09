# Terminal, Settings, And Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent multi-pane PTY terminal, app-level settings, and recognizable Ralphy visual identity to the Electron media workbench.

**Architecture:** Electron main owns bounded `node-pty` sessions and exposes a validated terminal IPC contract. The renderer owns an xterm controller map plus a pure recursive split tree, while the existing workbench remains mounted under a settings overlay and when the bottom panel is hidden.

**Tech Stack:** Electron 43, React 19, TypeScript, Bun, `node-pty`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, Motion, Vitest.

## Global Constraints

- Terminals are global to the application and never switch cwd after spawn.
- Every new PTY starts in the canonical active `.ralphy` library root.
- `Cmd+J` changes visibility only; PTYs, jobs, and terminal buffers remain alive.
- Renderer input may never select an arbitrary cwd.
- Provider secrets are not persisted or logged.
- Keep the existing neutral `#181818` and `#2d2d2d` surface system.
- Preserve all current uncommitted media-workbench changes.

---

### Task 1: Pure Terminal Layout Model

**Files:**
- Create: `src/terminal/layout.ts`
- Create: `tests/terminal-layout.test.ts`

**Interfaces:**
- Produces: `TerminalLayoutNode`, `createTerminalLayout`, `addTerminalTab`, `activateTerminalTab`, `moveTerminalTab`, `splitTerminalTab`, `closeTerminalTab`, and `setSplitRatio`.

- [ ] **Step 1: Write failing layout tests**

Cover first-tab creation, same-pane reorder, edge split, moving between leaves,
empty-leaf collapse, active-tab fallback, middle-close semantics, and clamped
split ratios:

```ts
const initial = addTerminalTab(createTerminalLayout(), "one");
const split = splitTerminalTab(initial, "root", "two", "right");
expect(split).toMatchObject({
  kind: "split",
  axis: "row",
  first: { kind: "leaf", tabs: ["one"] },
  second: { kind: "leaf", tabs: ["two"] },
});
expect(setSplitRatio(split, split.id, 0.99)).toMatchObject({ ratio: 0.8 });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test tests/terminal-layout.test.ts`

Expected: failure because `src/terminal/layout.ts` does not exist.

- [ ] **Step 3: Implement immutable layout transforms**

Use stable leaf/split ids, normalize after every move/close, and avoid React or
DOM dependencies. A split ratio is always clamped to `0.2...0.8`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun test tests/terminal-layout.test.ts`

Expected: all terminal-layout tests pass.

### Task 2: PTY Manager And Trust Boundary

**Files:**
- Create: `electron/terminal/manager.ts`
- Create: `tests/terminal-manager.test.ts`
- Modify: `electron/media/catalog.ts`
- Modify: `electron/media/types.ts`

**Interfaces:**
- Consumes: canonical active root supplied by `MediaSessionState.captureActive()`.
- Produces: `TerminalManager.create(rootPath, dimensions)`,
  `write(sessionId, data)`, `resize(sessionId, dimensions)`,
  `kill(sessionId)`, `killAll()`, and `resolveWorkspacePath`-independent root
  validation.

- [ ] **Step 1: Write failing manager tests with an injected PTY factory**

Assert that create uses the canonical `.ralphy` root, `$SHELL`, login-shell
arguments, truecolor environment, and bounded dimensions. Assert the 16-session
limit, 64 KiB input limit, output/exit events, idempotent kill, and `killAll`.

```ts
const manager = new TerminalManager({
  spawn: fakeSpawn,
  emit: (event) => events.push(event),
  shell: "/bin/zsh",
});
const session = await manager.create(fixture.rootPath, { cols: 100, rows: 30 });
expect(fakeSpawn.calls[0]).toMatchObject({
  file: "/bin/zsh",
  args: ["-l"],
  options: { cwd: fixture.rootPath, name: "xterm-256color" },
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun test tests/terminal-manager.test.ts`

Expected: failure because the manager module is missing.

- [ ] **Step 3: Implement the manager**

Keep `node-pty` behind a factory interface so unit tests do not load a native
binding. Generate opaque ids with `randomUUID`, chunk output events to 64 KiB,
and remove exited PTYs from the live map only after publishing exit status.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `bun test tests/terminal-manager.test.ts tests/catalog.test.ts`

Expected: manager and catalog trust-boundary tests pass.

### Task 3: Terminal IPC And Native Packaging

**Files:**
- Modify: `electron/media/types.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `electron/main.ts`
- Modify: `scripts/build-electron.mjs`
- Modify: `scripts/package-mac.mjs`
- Modify: `scripts/smoke-electron.mjs`
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: `TerminalManager` from Task 2.
- Produces bridge methods:

```ts
createTerminal(size: TerminalDimensions): Promise<TerminalSession>;
writeTerminal(id: string, data: string): void;
resizeTerminal(id: string, size: TerminalDimensions): void;
killTerminal(id: string): Promise<void>;
onTerminalEvent(callback: (event: TerminalEvent) => void): () => void;
```

- [ ] **Step 1: Add failing IPC/package contract assertions**

Assert preload exposure, main handlers, sender validation, app-quit cleanup,
`node-pty` externalization, native-module copy, and packaged smoke presence.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `bun test tests/design-system.test.ts`

Expected: terminal IPC and native packaging assertions fail.

- [ ] **Step 3: Install and wire terminal dependencies**

Use Bun to add stable xterm packages and `node-pty`. Keep `node-pty` external
to esbuild, rebuild it for Electron when required, and copy only the runtime
package/native binary into `Resources/app/node_modules`.

- [ ] **Step 4: Register validated terminal IPC**

Create sessions only from `mediaState.captureActive().rootPath`. Validate the
sender against the current window. Send output/exit only to a live renderer.
Call `killAll` from `before-quit` and final window teardown.

- [ ] **Step 5: Run typecheck and focused contracts**

Run: `bun run typecheck`

Run: `bun test tests/design-system.test.ts tests/terminal-manager.test.ts`

Expected: both commands pass.

### Task 4: Persistent Xterm Workspace And Splits

**Files:**
- Create: `src/terminal/controller.ts`
- Create: `src/components/terminal/TerminalWorkspace.tsx`
- Create: `src/components/terminal/TerminalPane.tsx`
- Create: `src/styles/terminal.css`
- Modify: `src/components/UtilityPanels.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: terminal bridge from Task 3 and layout transforms from Task 1.
- Produces: `<BottomPanel visible height rootPath onClose />` that remains
  mounted and creates its first session on first visible open.

- [ ] **Step 1: Add failing renderer contract tests**

Assert xterm construction, fit-on-visible `ResizeObserver`, global event
routing, always-mounted bottom panel, `Cmd+J` visibility-only behavior,
middle-click kill, tab drag payload, four edge drop zones, split toolbar
buttons, and pointer-captured split gutters.

- [ ] **Step 2: Run the renderer contract and verify RED**

Run: `bun test tests/design-system.test.ts`

Expected: missing terminal workspace behaviors fail.

- [ ] **Step 3: Implement xterm controllers**

One controller owns one `Terminal`, fit addon, web-links addon, and DOM element.
Moving a tab moves the existing xterm element into a new viewport instead of
disposing its buffer. Dispose only after explicit tab close or exit cleanup.

- [ ] **Step 4: Implement tabs, drag splits, and gutters**

Use HTML drag data `application/x-ralphy-terminal-tab`. Calculate edge
placement from pointer position, show a drop overlay, normalize the layout
after moves, and use pointer capture for ratio changes.

- [ ] **Step 5: Keep the panel mounted while hidden**

Replace conditional `AnimatePresence` mounting with a persistent panel whose
hidden height is zero and whose active xterms refit when shown. On first
`Cmd+J`, create a PTY automatically.

- [ ] **Step 6: Run renderer tests and typecheck**

Run: `bun test tests/terminal-layout.test.ts tests/design-system.test.ts`

Run: `bun run typecheck`

Expected: all pass.

### Task 5: Profile Menu And Settings View

**Files:**
- Create: `src/components/ProfileMenu.tsx`
- Create: `src/screens/SettingsScreen.tsx`
- Create: `src/styles/settings.css`
- Modify: `src/components/ContextSidebar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Modify: `tests/design-system.test.ts`

**Interfaces:**
- Produces: profile popover callback `onOpenSettings`, app-level settings
  overlay, `Cmd+,` navigation, and `onBack`.

- [ ] **Step 1: Add failing settings navigation assertions**

Assert a custom portal popover, Settings command, `Cmd+,`, Back to app,
settings categories, provider rows, password inputs with autocomplete disabled,
and absence of provider values in preference serialization.

- [ ] **Step 2: Run contracts and verify RED**

Run: `bun test tests/design-system.test.ts tests/workbench-state.test.ts`

Expected: settings contracts fail while workbench preferences remain green.

- [ ] **Step 3: Implement profile popover**

Use a fixed portal positioned from the footer trigger. Support outside click,
Escape, keyboard focus, and one Settings command. Move library switching into
General settings.

- [ ] **Step 4: Implement the settings overlay**

Keep the workbench mounted behind a full app-level surface. Build compact
General, Profile, Appearance, Providers, Terminal, and About sections with
local mock state only.

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test tests/design-system.test.ts tests/workbench-state.test.ts`

Run: `bun run typecheck`

Expected: all pass.

### Task 6: Mascot Identity And Viewer Dot Grid

**Files:**
- Create: `public/assets/ralphy-mascot.svg`
- Create: `src/components/RalphyMascot.tsx`
- Modify: `src/components/ContextSidebar.tsx`
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/workbench.css`
- Modify: `src/styles/settings.css`
- Modify: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: exact mascot artwork from `ralphy-web/public/assets/ralphy-mascot.svg`.
- Produces: persistent sidebar peek, settings lockup, boot/empty terminal mark,
  and neutral dot-grid media background.

- [ ] **Step 1: Add failing visual contract assertions**

Assert the local mascot asset is referenced in all three approved placements
and that `.image-viewport` uses radial dot gradients without the previous
diagonal linear gradients.

- [ ] **Step 2: Run the contract and verify RED**

Run: `bun test tests/design-system.test.ts`

Expected: mascot and dot-grid assertions fail.

- [ ] **Step 3: Copy the exact mascot and implement restrained placements**

Do not recolor or edit the SVG. Keep the persistent peek below 48px and prevent
it from covering project rows or profile controls.

- [ ] **Step 4: Replace the viewer pattern**

Use a black base, 1px low-contrast points on a 20px grid, and a subtler major
point every 100px. Keep compact inspector previews neutral.

- [ ] **Step 5: Run visual contracts**

Run: `bun test tests/design-system.test.ts`

Expected: all design contracts pass.

### Task 7: End-To-End Verification

**Files:**
- Modify only files required by defects discovered during verification.

**Interfaces:**
- Consumes: complete terminal/settings/branding implementation.
- Produces: final signed packaged app and live verification evidence.

- [ ] **Step 1: Run the complete automated suite**

Run: `bun test`

Run: `bun run typecheck`

Run: `bun run build`

Run: `bun run smoke`

Expected: every command exits zero with no warnings attributable to the app.

- [ ] **Step 2: Package and verify native runtime**

Run: `bun run package:mac`

Verify the package signature, native PTY binary architecture, and presence of
xterm CSS/assets.

- [ ] **Step 3: Exercise a real shell**

Launch the packaged app, press `Cmd+J`, confirm `pwd` prints the active
`.ralphy` root, run a long-lived command, hide/show the panel, and confirm the
process/output survives. Create tabs, split both axes, resize panes, move a
tab, and middle-click close while checking that the PTY exits.

- [ ] **Step 4: Exercise settings and branding**

Open the profile menu and Settings, switch every category, return to the app,
and confirm the previous project, grid position, panel state, and terminals
remain. Inspect the mascot placements and image viewer dot grid at minimum,
default, and wide window sizes.

- [ ] **Step 5: Leave the final application open**

Leave the signed packaged app open on the media workbench with the terminal
panel visible and one idle shell ready for the user.
