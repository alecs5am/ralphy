# Nothing Foundation and Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the local typography, two-palette theme, reusable Instrument layer, responsive application shell, truthful Dynamic Island, Settings preference, chat, and terminal surfaces that every rewritten route uses.

**Architecture:** Keep `App` and the existing workbench/Marketplace reducers as the owners of route, selection, restoration, and persisted panel state. Replace only the presentation hierarchy with a small `src/instrument/` layer; project and workspace screens consume it through typed props and a portal host, while Dynamic Island data is projected from renderer memory and never performs IPC itself.

**Tech Stack:** Electron 43.2.0 with embedded Node 24.18.0, React 19, resolved TypeScript 5.9.3 (declared `^5.7.3`), Bun 1.3, Vitest 0.34.6, Motion, Radix Dialog/Select, Lucide React, xterm 6, WaveSurfer 7, CSS container queries, locally bundled fonts/assets.

**Spec:** `docs/superpowers/specs/2026-08-20-nothing-os-redesign-design.md`

**Visual evidence:** `/tmp/ralphy-nothing-os.SYlRcI/design_handoff_instrument/README.md`, `/tmp/ralphy-nothing-os.SYlRcI/design_handoff_instrument/design-v2.md`, and only sections `3a` / `3b` of `/tmp/ralphy-nothing-os.SYlRcI/design_handoff_instrument/Ralphy Instrument System.dc.html`.

## Global Constraints

- Work only in `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/.worktrees/nothing-os-redesign` on `codex/nothing-os-redesign`; begin this plan from spec commit `634ff299081f70f03f3bd274a7c5fb00ec152306` plus only reviewed commits from this three-plan sequence.
- This is a presentation rewrite. Reuse the current Core v3 contract, Electron security boundary, readers, controllers, workbench/Marketplace reducers, media protocol, root fencing, MIME allowlists, clipboard bounds, and fixed Marketplace origins.
- Do not add a Core method, database migration, direct SQLite access, renderer filesystem access, renderer network access, sibling checkout import, prototype runtime, `support.js`, remote Lucide sprite, remote font, or new package.
- Theme preference is exactly `system | dark | light`; new, missing, and invalid values resolve to `system`. Light desk is `#E2E4EA`; dark desk is `#050505`; dark widgets are `#141414`; alert red is `#E0362C`.
- Apply `data-theme` and matching `color-scheme` before React paints. While preference is `system`, follow `prefers-color-scheme` changes. Pass the resolved `light | dark` palette to xterm and WaveSurfer.
- Use AWS Diatype Regular for UI text, AWS Diatype Rounded Semi-Mono for paths/metadata/keyboard labels, and local Doto 800 for numbers/short codes at 13px minimum. Reuse byte-identical AWS fonts and dither assets already in `public/assets`.
- App chrome is flat: no elevation shadow, blur, glass, inset highlight, decorative border, or depth gradient. Borders/rings remain only for semantic focus, status, selection, and required input affordances.
- Geometry is fixed at 8px outer padding/gap, 16px desk radius, 24px widget radius, 999px pills/circles, 48px top row, 240px full left stack, and 292px full right rail.
- Motion uses `cubic-bezier(.2, 0, .2, 1)` with 90ms hover, 160ms state, and 220ms panel transitions. `prefers-reduced-motion` removes movement/morphing but preserves immediate state changes.
- Support `1440x900`, `1280x800`, and the `1100x720` minimum with no horizontal body scroll. Right rail auto-collapses if the measured desk would be below 680px; detail columns stack at 760px desk width. Automatic compact behavior never writes the manual preference.
- Every icon-only control has an accessible name, tooltip, and visible 2px focus outline. Escape closes overlays and restores opener focus with `{ preventScroll: true }`; status is never color-only.
- `VITE_RALPHY_ENABLE_MOCKS=true` may provide deterministic Dynamic Island data only for a workspace named exactly `UX Testing Lab`. Mock state never crosses IPC, never writes a database/file, resets on root/workspace change, and is absent when the flag is false.
- Use Bun for TypeScript work. Each task follows RED to GREEN, receives an independent task review, runs `git diff --check`, stages only its files, runs `gitleaks protect --staged --redact`, and commits before the next task.

---

Before Task 1, record `NOTHING_FOUNDATION_BASE=$(git rev-parse HEAD)` in the executor's progress notes. Do not commit those notes.

## Stable Interface Lock

Tasks 1–8 establish the following public renderer interfaces. Plans 2 and 3 import these exact names and fields; changing them requires updating all three plans in one reviewed commit.

```ts
// src/instrument/types.ts
export type Availability<T> =
  | { status: "ready"; value: T }
  | { status: "partial"; value: T; reason: string }
  | { status: "empty"; reason: string }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };

export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export interface InstrumentScreenHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  filters?: React.ReactNode;
  counters?: React.ReactNode;
  actions?: React.ReactNode;
}

export interface ProjectDockItem<Id extends string = string> {
  id: Id;
  label: string;
  icon: LucideIcon;
  disabledReason?: string;
}
```

```ts
// src/instrument/theme.ts
export const THEME_PREFERENCES: readonly ThemePreference[];
export function parseThemePreference(value: unknown): ThemePreference;
export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme;
export function applyResolvedTheme(root: HTMLElement, theme: ResolvedTheme): void;

// src/instrument/ThemeProvider.tsx
export interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference(value: ThemePreference): void;
}
export function ThemeProvider(props: { initialPreference: ThemePreference; children: React.ReactNode }): React.ReactElement;
export function useTheme(): ThemeContextValue;
```

```ts
// src/instrument/InstrumentShell.tsx
export interface InstrumentShellProps {
  sidebar: React.ReactNode;
  desk: React.ReactNode;
  chat: React.ReactNode;
  island: React.ReactNode;
  leftVisible: boolean;
  rightPreference: boolean;
  bottomPanel?: React.ReactNode;
  bottomVisible: boolean;
  onToggleLeft(): void;
  onToggleRight(): void;
}
export function InstrumentShell(props: InstrumentShellProps): React.ReactElement;
export function InstrumentRightRailPortal(props: { children: React.ReactNode }): React.ReactPortal | null;

// src/instrument/ProjectDock.tsx
export function ProjectDock<Id extends string>(props: {
  active: Id;
  items: readonly ProjectDockItem<Id>[];
  onSelect(id: Id): void;
}): React.ReactElement;
```

```ts
// src/instrument/dynamic-island-feed.ts
export interface ProjectStatusSummary {
  approved: number;
  needsWork: number;
  rejected: number;
  unreviewed: number;
}
export interface IslandTask {
  id: string;
  label: string;
  status: "running" | "complete" | "failed";
  progress: number | null;
  destination: WorkbenchRoute | MarketplaceLocation;
}
export interface IslandNotification {
  id: string;
  title: string;
  timestamp: number;
  severity: "info" | "attention" | "error";
  unread: boolean;
  destination: WorkbenchRoute | MarketplaceLocation;
}
export interface DynamicIslandFeed {
  projectStatus: Availability<ProjectStatusSummary>;
  activeTask: IslandTask | null;
  notifications: Availability<IslandNotification[]>;
}
export interface DynamicIslandProjectionInput {
  rootEpoch: number;
  workspace: WorkspaceSummary | null;
  project: ProjectSummary | null;
  projectOverview: ProjectOverviewDto | null;
  agentState: AgentChatState;
  appError: string | null;
}
export function projectDynamicIslandFeed(input: DynamicIslandProjectionInput): DynamicIslandFeed;
export interface DynamicIslandMockContext {
  rootEpoch: number;
  workspace: WorkspaceSummary | null;
  project: ProjectSummary | null;
}
export type DynamicIslandMockProvider = (input: DynamicIslandMockContext) => DynamicIslandFeed | null;

// src/instrument/dynamic-island-mock.ts -- imported only in mock builds
export const projectMockDynamicIslandFeed: DynamicIslandMockProvider;
```

## File Map

- `src/instrument/types.ts` — shared availability, theme, header, and dock types; no rendering.
- `src/instrument/theme.ts` and `src/instrument/ThemeProvider.tsx` — pure validation/resolution and the only live media-query listener.
- `src/instrument/primitives.tsx` — shared widget, pill, icon button, counter, status dot, dither identity, header, and empty state.
- `src/instrument/InstrumentShell.tsx` — top row, measured desk geometry, rail host, and one scroll-owner frame.
- `src/instrument/InstrumentSidebar.tsx` — current My Work/Marketplace navigation projected into Instrument widgets.
- `src/instrument/ProjectDock.tsx` — project-section navigation only.
- `src/instrument/dynamic-island-feed.ts` — pure live feed projector with no mock strings.
- `src/instrument/dynamic-island-mock.ts` — deterministic UX Testing Lab fixture, reachable only from a compile-time-guarded dynamic import.
- `src/instrument/DynamicIsland.tsx` — compact/expanded rendering and focus behavior; no IPC or route mutation.
- `src/styles/tokens.css` — palette, typography, radii, motion, content tokens, focus, and scrollbar tokens.
- `src/styles/instrument.css` — shell/primitives/sidebar/island geometry and container rules.

### Task 1: Bundle Doto and establish theme tokens

**Files:**
- Create: `public/assets/fonts/Doto-Variable.ttf`
- Create: `public/assets/fonts/OFL-Doto.txt`
- Create: `src/instrument/types.ts`
- Create: `src/instrument/theme.ts`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/reset.css`
- Test: `tests/instrument-theme.test.ts`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: `localStorage`, `Window.matchMedia`, existing byte-identical AWS/dither assets, and the exact Stable Interface Lock definitions.
- Produces: `Availability<T>`, `ThemePreference`, `ResolvedTheme`, `THEME_PREFERENCES`, `parseThemePreference`, `resolveTheme`, `applyResolvedTheme`, the full semantic token table, and local Doto/OFL files.

- [ ] **Step 1: Write failing theme and asset tests**

```ts
expect(parseThemePreference("dark")).toBe("dark");
expect(parseThemePreference("light")).toBe("light");
expect(parseThemePreference("sepia")).toBe("system");
expect(resolveTheme("system", true)).toBe("dark");
expect(resolveTheme("system", false)).toBe("light");
expect(readFileSync("src/styles/tokens.css", "utf8")).toMatch(/--desk:\s*#e2e4ea/i);
expect(readFileSync("src/styles/tokens.css", "utf8")).toMatch(/\[data-theme="dark"\][\s\S]*--desk:\s*#050505/i);
expect(existsSync("public/assets/fonts/Doto-Variable.ttf")).toBe(true);
expect(readFileSync("public/assets/fonts/OFL-Doto.txt", "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
expect(sha256("public/assets/fonts/Doto-Variable.ttf")).toBe("6f4fe7d37853b91df3698daa84cde2dbe1c9695d88c986e6510134910337d426");
expect(sha256("public/assets/fonts/OFL-Doto.txt")).toBe("26a7b58bdba6cda8a78ca6e8b3791d8013b8abc6d5e6519f84193893aee02020");
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `bun run test -- tests/instrument-theme.test.ts tests/design-system.test.ts`

Expected: FAIL because the Instrument types/theme module and local Doto files do not exist and old purple/dark-only tokens remain.

- [ ] **Step 3: Add the exact theme helpers, font files, and semantic tokens**

```ts
export const THEME_PREFERENCES = ["system", "dark", "light"] as const;
export function parseThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference) ? value as ThemePreference : "system";
}
export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}
export function applyResolvedTheme(root: HTMLElement, theme: ResolvedTheme): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
```

Fetch the official Google Fonts files at reviewed commit `2c982e6bdf88fefbe9e34e78695d8e9e02d788ec` without adding a runtime dependency, then verify their bytes before continuing:

```bash
gh api 'repos/google/fonts/contents/ofl/doto/Doto%5BROND%2Cwght%5D.ttf?ref=2c982e6bdf88fefbe9e34e78695d8e9e02d788ec' --jq .content | tr -d '\n' | base64 --decode > public/assets/fonts/Doto-Variable.ttf
gh api 'repos/google/fonts/contents/ofl/doto/OFL.txt?ref=2c982e6bdf88fefbe9e34e78695d8e9e02d788ec' --jq .content | tr -d '\n' | base64 --decode > public/assets/fonts/OFL-Doto.txt
test "$(shasum -a 256 public/assets/fonts/Doto-Variable.ttf | awk '{print $1}')" = '6f4fe7d37853b91df3698daa84cde2dbe1c9695d88c986e6510134910337d426'
test "$(shasum -a 256 public/assets/fonts/OFL-Doto.txt | awk '{print $1}')" = '26a7b58bdba6cda8a78ca6e8b3791d8013b8abc6d5e6519f84193893aee02020'
```

Declare Doto with `font-weight: 100 900`, use weight 800 through `--font-doto`, and replace legacy tokens with the complete light/dark table from the spec plus `--media-frame`, `--content-scrim`, `--focus-outline`, `--duration-hover`, `--duration-state`, and `--duration-panel`. Restore global `:focus-visible` instead of suppressing outlines.

- [ ] **Step 4: Run GREEN checks and review the diff**

Run: `bun run test -- tests/instrument-theme.test.ts tests/design-system.test.ts && bun run typecheck && git diff --check`

Expected: both suites pass, TypeScript exits 0, and the diff contains no remote font reference or unrelated asset replacement.

- [ ] **Step 5: Commit the token foundation**

```bash
git add public/assets/fonts/Doto-Variable.ttf public/assets/fonts/OFL-Doto.txt src/instrument/types.ts src/instrument/theme.ts src/styles/tokens.css src/styles/reset.css tests/instrument-theme.test.ts tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "feat: establish instrument theme tokens"
```

### Task 2: Add the shared Instrument primitives

**Files:**
- Create: `src/instrument/primitives.tsx`
- Create: `src/styles/instrument.css`
- Modify: `src/main.tsx`
- Modify: `src/lib/project-glyph.ts`
- Test: `tests/instrument-primitives.test.tsx`
- Test: `tests/project-glyph.test.ts`

**Interfaces:**
- Consumes: Task 1 tokens/types, existing `workspaceDitherVars(name)`, Lucide icons, native `button`/`progress` semantics.
- Produces:

```ts
export function InstrumentWidget(props: React.ComponentProps<"section"> & { tone?: "dark" | "light" }): React.ReactElement;
export function InstrumentPill(props: React.ComponentProps<"button"> & { selected?: boolean; dominant?: boolean; danger?: boolean }): React.ReactElement;
export function InstrumentIconButton(props: React.ComponentProps<"button"> & { label: string; tooltip?: string }): React.ReactElement;
export function InstrumentCounter(props: { value: number; label: string }): React.ReactElement;
export function StatusDot(props: { tone: "approved" | "needs-work" | "rejected" | "unreviewed"; label: string }): React.ReactElement;
export function DitherIdentity(props: { name: string; size: number; className?: string }): React.ReactElement;
export function InstrumentScreenHeader(props: InstrumentScreenHeaderProps): React.ReactElement;
export function InstrumentEmptyState(props: { title: string; reason: string; action?: React.ReactNode; busy?: boolean; error?: boolean }): React.ReactElement;
```

- [ ] **Step 1: Write failing semantic and rendering tests**

```tsx
const html = renderToStaticMarkup(<>
  <InstrumentIconButton label="Collapse sidebar"><PanelLeft /></InstrumentIconButton>
  <InstrumentCounter value={38} label="Items" />
  <StatusDot tone="needs-work" label="4 need work" />
  <DitherIdentity name="UX Testing Lab" size={32} />
</>);
expect(html).toContain('aria-label="Collapse sidebar"');
expect(html).toContain('title="Collapse sidebar"');
expect(html).toContain('aria-label="38 Items"');
expect(html).toContain("4 need work");
expect(workspaceDitherVars("UX Testing Lab")).toEqual(workspaceDitherVars("UX Testing Lab"));
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `bun run test -- tests/instrument-primitives.test.tsx tests/project-glyph.test.ts`

Expected: FAIL because `src/instrument/primitives.tsx` is absent.

- [ ] **Step 3: Implement the minimal primitives and flat geometry**

```tsx
export function InstrumentIconButton({ label, tooltip = label, children, ...button }: React.ComponentProps<"button"> & { label: string; tooltip?: string }) {
  return <button {...button} className={`instrument-icon-button ${button.className ?? ""}`.trim()} aria-label={label} title={tooltip}>{children}</button>;
}
export function InstrumentCounter({ value, label }: { value: number; label: string }) {
  return <span className="instrument-counter" aria-label={`${value} ${label}`}><b>{value}</b><small>{label}</small></span>;
}
```

Use semantic elements, `data-tone`/`data-status` attributes, and Task 1 tokens. `DitherIdentity` applies `workspaceDitherVars(name)` and the existing mask assets; color remains deterministic identity and is never exposed as state. Import `instrument.css` once from `main.tsx`.

- [ ] **Step 4: Run GREEN checks and independent primitive review**

Run: `bun run test -- tests/instrument-primitives.test.tsx tests/project-glyph.test.ts tests/design-system.test.ts && bun run typecheck && git diff --check`

Expected: suites pass; reviewer confirms no primitive exists for only one route and no component hard-codes a palette literal.

- [ ] **Step 5: Commit the primitives**

```bash
git add src/instrument/primitives.tsx src/styles/instrument.css src/main.tsx src/lib/project-glyph.ts tests/instrument-primitives.test.tsx tests/project-glyph.test.ts
gitleaks protect --staged --redact
git commit -m "feat: add instrument primitives"
```

### Task 3: Persist and apply the three-state theme

**Files:**
- Create: `public/theme-bootstrap.js`
- Create: `src/instrument/ThemeProvider.tsx`
- Modify: `index.html`
- Modify: `src/main.tsx`
- Modify: `src/state/workbench.ts`
- Modify: `src/App.tsx`
- Modify: `src/screens/SettingsScreen.tsx`
- Test: `tests/instrument-theme.test.ts`
- Test: `tests/workbench-state.test.ts`
- Test: `tests/instrument-settings.test.tsx`

**Interfaces:**
- Consumes: Task 1 theme functions and existing `ralphy-media-workbench-v1` preference storage.
- Produces: exact `ThemeContextValue`, `ThemeProvider`, and `useTheme` signatures from the Stable Interface Lock; adds `theme: ThemePreference` to `WorkbenchPreferences` without changing its storage key.

- [ ] **Step 1: Add failing preference/startup/system-change tests**

```ts
expect(readWorkbenchPreferences(storageWith({ theme: "light" })).theme).toBe("light");
expect(readWorkbenchPreferences(storageWith({ theme: "sepia" })).theme).toBe("system");
expect(readWorkbenchPreferences(storageWith({})).theme).toBe("system");
const indexSource = readFileSync("index.html", "utf8");
expect(indexSource).toContain('<script src="/theme-bootstrap.js"></script>');
expect(readFileSync("public/theme-bootstrap.js", "utf8")).toContain("document.documentElement.dataset.theme");
expect(indexSource).not.toMatch(/<script(?![^>]+src=)[^>]*>/i);
expect(indexSource).not.toMatch(/https:\/\/fonts\./);
expect(indexSource.indexOf('/theme-bootstrap.js')).toBeLessThan(indexSource.indexOf("<body>"));
```

Mount `ThemeProvider` with a controllable `matchMedia` stub; assert the root changes on a media-query event only for `system`, persists the preference, and removes the listener at unmount.

- [ ] **Step 2: Run tests and verify RED**

Run: `bun run test -- tests/instrument-theme.test.ts tests/workbench-state.test.ts tests/instrument-settings.test.tsx`

Expected: FAIL because workbench preferences have no `theme`, startup does not apply it synchronously, and Appearance lacks Light.

- [ ] **Step 3: Implement startup application, provider, and controlled Settings**

```tsx
export function ThemeProvider({ initialPreference, children }: { initialPreference: ThemePreference; children: React.ReactNode }) {
  const media = useMemo(() => matchMedia("(prefers-color-scheme: dark)"), []);
  const [preference, setPreference] = useState(initialPreference);
  const [systemDark, setSystemDark] = useState(media.matches);
  const resolved = resolveTheme(preference, systemDark);
  useLayoutEffect(() => applyResolvedTheme(document.documentElement, resolved), [resolved]);
  useEffect(() => { const changed = (event: MediaQueryListEvent) => setSystemDark(event.matches); media.addEventListener("change", changed); return () => media.removeEventListener("change", changed); }, [media]);
  return <ThemeContext.Provider value={{ preference, resolved, setPreference }}>{children}</ThemeContext.Provider>;
}
```

Add a blocking `<script src="/theme-bootstrap.js"></script>` in `<head>` immediately after the CSP meta tag and before `<body>` or Vite's module script. The local bootstrap reads only `ralphy-media-workbench-v1`, validates `theme`, resolves `system`, sets `data-theme`/`colorScheme`, and catches storage errors. This satisfies the existing `script-src 'self'` CSP without permitting inline or remote script. In `src/main.tsx`, call `readWorkbenchPreferences(localStorage)` once for `ThemeProvider.initialPreference` and wrap `App`; in `App`, read `useTheme().preference` when the existing debounced preference writer emits `WorkbenchPreferences`. Make Appearance's System/Dark/Light group controlled by `useTheme()`.

- [ ] **Step 4: Run GREEN checks and build**

Run: `bun run test -- tests/instrument-theme.test.ts tests/workbench-state.test.ts tests/instrument-settings.test.tsx && bun run typecheck && bun run build && git diff --check`

Expected: suites pass; `dist/index.html` loads the synchronous self-hosted bootstrap before the module entry; the CSP remains unchanged; no inline script or remote font URL exists.

- [ ] **Step 5: Commit theme behavior**

```bash
git add public/theme-bootstrap.js index.html src/main.tsx src/instrument/ThemeProvider.tsx src/state/workbench.ts src/App.tsx src/screens/SettingsScreen.tsx tests/instrument-theme.test.ts tests/workbench-state.test.ts tests/instrument-settings.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: persist instrument theme preference"
```

### Task 4: Build the responsive Instrument shell and right-rail portal

**Files:**
- Create: `src/instrument/InstrumentShell.tsx`
- Modify: `src/styles/instrument.css`
- Modify: `src/App.tsx`
- Modify: `src/state/workbench.ts`
- Modify: `electron/main.ts`
- Test: `tests/instrument-shell.test.tsx`
- Test: `tests/window-state.test.ts`

**Interfaces:**
- Consumes: Task 2 primitives, Task 3 theme context, existing persisted `sidebarVisible`, `rightPanelVisible`, `bottomPanelVisible`, and `MINIMUM_WINDOW_SIZE`.
- Produces: exact `InstrumentShellProps`, `InstrumentShell`, and `InstrumentRightRailPortal` signatures from the Stable Interface Lock. The right-rail portal host is above permanent chat and exists only while the rail is rendered.

- [ ] **Step 1: Write failing shell/geometry/portal tests**

```tsx
expect(markup).toContain('class="instrument-top-row"');
expect(markup).toContain('class="instrument-left-stack"');
expect(markup).toContain('class="instrument-desk"');
expect(markup).toContain('class="instrument-right-rail"');
expect(markup).toContain('data-manual-right="true"');
expect(styles).toMatch(/container-type:\s*inline-size/);
expect(styles).toMatch(/--left-stack-width:\s*240px/);
expect(styles).toMatch(/--right-rail-width:\s*292px/);
expect(mainSource).not.toMatch(/vibrancy:\s*"sidebar"/);
expect(readWorkbenchPreferences(storageWith({})).rightPanelVisible).toBe(true);
expect(readWorkbenchPreferences(storageWith({ rightPanelVisible: false })).rightPanelVisible).toBe(false);
```

Mount a portal child and assert it appears in `[data-right-rail-accessory]`; unmount it and assert chat remains.

- [ ] **Step 2: Run shell tests and verify RED**

Run: `bun run test -- tests/instrument-shell.test.tsx tests/window-state.test.ts`

Expected: FAIL because `InstrumentShell` and the rail portal do not exist and BrowserWindow still enables vibrancy/transparency.

- [ ] **Step 3: Implement measured shell geometry**

```tsx
const RightRailHost = createContext<HTMLElement | null>(null);
export function InstrumentRightRailPortal({ children }: { children: React.ReactNode }) {
  const host = useContext(RightRailHost);
  return host ? createPortal(children, host) : null;
}
```

Use one `ResizeObserver` on `.instrument-desk-frame`; `rightPreference` stays the persisted manual value, while derived `rightVisible` is `rightPreference && (windowWidth >= 1280 ? deskWidth >= 680 : false)`. Change only the new/missing/invalid preference default to `rightPanelVisible: true`, so the 1440px reference state starts with the full rail; preserve an explicitly stored `false`. At `1100x720` initialize the derived rail closed without writing preferences. Make `.instrument-desk-scroll` the sole screen scroll owner, set `body`/shell overflow hidden, keep the dock layer outside that scroller, and offset it from a visible right rail. Remove BrowserWindow vibrancy and transparent background; use an opaque background that React immediately covers with the resolved desk.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/instrument-shell.test.tsx tests/window-state.test.ts tests/workbench-state.test.ts && bun run typecheck && bun run build && git diff --check`

Expected: suites/build pass; independent reviewer confirms 1440/1280/1100 rules are derived without changing stored manual preferences and there is one vertical screen scroller.

- [ ] **Step 5: Commit the shell frame**

```bash
git add src/instrument/InstrumentShell.tsx src/styles/instrument.css src/App.tsx src/state/workbench.ts electron/main.ts tests/instrument-shell.test.tsx tests/window-state.test.ts tests/workbench-state.test.ts
gitleaks protect --staged --redact
git commit -m "feat: build responsive instrument shell"
```

### Task 5: Replace sidebar chrome and project tabs

**Files:**
- Create: `src/instrument/InstrumentSidebar.tsx`
- Create: `src/instrument/ProjectDock.tsx`
- Modify: `src/App.tsx`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/styles/instrument.css`
- Test: `tests/instrument-sidebar.test.tsx`
- Test: `tests/project-screen.test.tsx`
- Test: `tests/workspace-navigation.test.tsx`
- Test: `tests/marketplace-navigation.test.tsx`

**Interfaces:**
- Consumes: current `WorkbenchRoute`, `WorkspacePage`, `MarketplaceRoute`, `AppMode`, reducers/callbacks, truthful `WorkspaceSummary` counts, `ProjectView`, and Task 2 primitives.
- Produces: `InstrumentSidebar` with the existing `ContextSidebarProps` callback semantics and exact generic `ProjectDock` signature from the Stable Interface Lock.

- [ ] **Step 1: Write failing navigation and dock tests**

```tsx
expect(workSidebar).toContain("My Work");
expect(workSidebar).toContain("Marketplace");
expect(workSidebar).toContain("Shared library");
expect(workSidebar).not.toContain("Local Models");
expect(workSidebar).not.toContain(">Settings<");
expect(marketSidebar).not.toContain("UX Testing Lab");
expect(projectMarkup).toContain('aria-label="Project sections"');
expect(projectMarkup).not.toContain("Overview");
expect(projectMarkup).toContain("Documents");
expect(projectMarkup).toContain("Media");
expect(projectMarkup).toContain("Units");
expect(projectMarkup).toContain("Activity");
expect(workSidebar).toContain('data-workspace-name="UX Testing Lab"');
```

- [ ] **Step 2: Run tests and verify RED**

Run: `bun run test -- tests/instrument-sidebar.test.tsx tests/project-screen.test.tsx tests/workspace-navigation.test.tsx tests/marketplace-navigation.test.tsx`

Expected: FAIL because the continuous `ContextSidebar` and project tab strip still render.

- [ ] **Step 3: Implement the widget stack and capability-aware dock**

```tsx
const PROJECT_DOCK_ITEMS: readonly ProjectDockItem<ProjectView>[] = [
  { id: "documents", label: "Documents", icon: FileText },
  { id: "media", label: "Media", icon: Image },
  { id: "units", label: "Units", icon: Layers3 },
  { id: "activity", label: "Activity", icon: Activity },
];
```

At 1440px render 240px stack: mode pill, work-only dither workspace identity, route nav, only truthful count badges, existing-route context instruments, and bottom user pill. Put `data-workspace-name={workspace.name}` on the focusable workspace identity/selector so the external Electron audit can select UX Testing Lab through production UI. Settings opens from user pill/profile menu. Marketplace omits workspace identity and keeps Models inside Marketplace. Preserve current history, focus restoration, workspace selection, and mode round-trip callbacks. Do not add Overview because the current `ProjectView` has no Overview route; do not expose `compositions` separately because Units owns its current entry path.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/instrument-sidebar.test.tsx tests/project-screen.test.tsx tests/workspace-navigation.test.tsx tests/marketplace-navigation.test.tsx tests/profile-menu.test.tsx && bun run typecheck && git diff --check`

Expected: suites pass; reviewer confirms every enabled row invokes an existing callback and unsupported counts are absent, not zero.

- [ ] **Step 5: Commit navigation chrome**

```bash
git add src/instrument/InstrumentSidebar.tsx src/instrument/ProjectDock.tsx src/App.tsx src/screens/ProjectScreen.tsx src/styles/instrument.css tests/instrument-sidebar.test.tsx tests/project-screen.test.tsx tests/workspace-navigation.test.tsx tests/marketplace-navigation.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: replace navigation with instrument controls"
```

### Task 6: Add the truthful Dynamic Island and mock-only UX island

**Files:**
- Create: `src/instrument/dynamic-island-feed.ts`
- Create: `src/instrument/dynamic-island-mock.ts`
- Create: `src/instrument/DynamicIsland.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/instrument.css`
- Test: `tests/dynamic-island-feed.test.ts`
- Test: `tests/dynamic-island-mock.test.ts`
- Test: `tests/dynamic-island.test.tsx`
- Test: `tests/chat-state.test.ts`

**Interfaces:**
- Consumes: exact `DynamicIslandProjectionInput`, route types, `AgentChatState`, renderer-resident app errors, existing project overview fields, and compile-time `VITE_RALPHY_ENABLE_MOCKS` replacement.
- Produces: exact live-feed and mock-provider definitions from the Stable Interface Lock; `DynamicIsland` accepts `{ feed, onNavigate }` and performs no IPC. The mock fixture and its stable IDs exist only in `dynamic-island-mock.ts`.

- [ ] **Step 1: Write failing projector and focus tests**

```ts
expect(projectDynamicIslandFeed(libraryInput).projectStatus.status).toBe("unavailable");
expect(projectDynamicIslandFeed(uxInput).activeTask).toBeNull();
expect(projectMockDynamicIslandFeed(otherWorkspaceContext)).toBeNull();
const mocked = projectMockDynamicIslandFeed(uxWorkspaceContext);
expect(mocked?.activeTask?.id).toBe("ux-mock-render-1");
expect(mocked?.notifications.status === "ready" && mocked.notifications.value.map(({ id }) => id)).toEqual([
  "ux-mock-review", "ux-mock-complete", "ux-mock-error",
]);
expect(mocked?.activeTask?.destination).toEqual({
  kind: "project",
  workspaceId: uxWorkspaceContext.workspace.id,
  projectId: uxWorkspaceContext.project.projectId,
});
```

Mount `DynamicIsland`, open it, press Escape, and assert focus returns to the expand button without changing a sentinel scroller's `scrollTop`. Assert only meaningful feed ID/status changes write to the polite live region. Assert `App.tsx` has one `if (import.meta.env.VITE_RALPHY_ENABLE_MOCKS)` guarded dynamic import and no fixture ID literal.

- [ ] **Step 2: Run island tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/dynamic-island-feed.test.ts tests/dynamic-island-mock.test.ts tests/dynamic-island.test.tsx tests/chat-state.test.ts`

Expected: FAIL because the feed projector and island do not exist.

- [ ] **Step 3: Implement pure projection and accessible compact/expanded UI**

```ts
export const projectMockDynamicIslandFeed: DynamicIslandMockProvider = ({ workspace, project }) => {
  if (workspace?.name !== "UX Testing Lab") return null;
  const destination: WorkbenchRoute = project
    ? { kind: "project", workspaceId: workspace.id, projectId: project.projectId }
    : { kind: "workspace", workspaceId: workspace.id };
  return {
    projectStatus: { status: "partial", value: { approved: 28, needsWork: 7, rejected: 3, unreviewed: 12 }, reason: "UX fixture" },
    activeTask: { id: "ux-mock-render-1", label: "Rendering vertical cut", status: "running", progress: 41, destination },
    notifications: { status: "ready", value: [
      { id: "ux-mock-review", title: "12 media items await review", timestamp: 1_787_214_600_000, severity: "attention", unread: true, destination },
      { id: "ux-mock-complete", title: "Vertical cut render completed", timestamp: 1_787_214_300_000, severity: "info", unread: false, destination },
      { id: "ux-mock-error", title: "One generation attempt failed", timestamp: 1_787_213_900_000, severity: "error", unread: true, destination },
    ] },
  };
};
```

Derive the live active task only from a real `runningChatId`/busy conversation; its progress is `null` because the chat contract exposes no percentage. Live notifications are unavailable unless renderer memory contains an app error; no unread count appears without explicit `unread`. In `App`, initialize a nullable `DynamicIslandMockProvider`; only inside `if (import.meta.env.VITE_RALPHY_ENABLE_MOCKS)` dynamically import `./instrument/dynamic-island-mock`, then choose `mockProvider?.({ rootEpoch, workspace, project }) ?? projectDynamicIslandFeed(liveInput)`. Do not statically import or re-export the mock module. Key one-session mock animation state by `rootEpoch`, workspace ID, and project ID so it clears on root/selection change. The fixture uses stable IDs/times but actual selected destination IDs and never calls bridge/storage. Compact island has no clock/prose context; expanded card has task, up to three notifications, empty/unavailable/error states, focus trap, Escape, and truthful destination callbacks. Animate the one-session mock notification only when motion is allowed.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/dynamic-island-feed.test.ts tests/dynamic-island-mock.test.ts tests/dynamic-island.test.tsx tests/chat-state.test.ts && VITE_RALPHY_ENABLE_MOCKS=false bun run build && ! rg -a 'ux-mock-render-1|ux-mock-review|ux-mock-complete|ux-mock-error' dist && bun run typecheck && git diff --check`

Expected: all suites/build pass; the production bundle contains no fixture IDs; reviewer confirms live data never fabricates percentages/zeros/unread items and the component imports neither `bridge` nor Electron types.

- [ ] **Step 5: Commit the island**

```bash
git add src/instrument/dynamic-island-feed.ts src/instrument/dynamic-island-mock.ts src/instrument/DynamicIsland.tsx src/App.tsx src/styles/instrument.css tests/dynamic-island-feed.test.ts tests/dynamic-island-mock.test.ts tests/dynamic-island.test.tsx tests/chat-state.test.ts
gitleaks protect --staged --redact
git commit -m "feat: add truthful dynamic island"
```

### Task 7: Reskin Settings, dialogs, menus, and profile utilities

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/components/ProfileMenu.tsx`
- Modify: `src/components/ui/SelectMenu.tsx`
- Modify: `src/styles/settings.css`
- Modify: `src/styles/instrument.css`
- Test: `tests/instrument-settings.test.tsx`
- Test: `tests/profile-menu.test.tsx`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: Task 2 primitives, Task 3 `useTheme`, existing Settings category state/search, existing Radix/native controls, and current profile/settings callbacks.
- Produces: the complete General/Profile/Appearance/Providers/Terminal/About Instrument Settings surface plus flat shared portal/menu/select/tooltip behavior.

- [ ] **Step 1: Add failing Settings and utility accessibility tests**

```tsx
expect(markup).toContain("General");
expect(markup).toContain("Profile");
expect(markup).toContain("Appearance");
expect(markup).toContain("Providers");
expect(markup).toContain("Terminal");
expect(markup).toContain("About");
expect(markup).toContain("System");
expect(markup).toContain("Dark");
expect(markup).toContain("Light");
expect(markup).toContain("Back to app");
expect(settingsCss).not.toMatch(/box-shadow|backdrop-filter|linear-gradient|#8b7cf6/i);
```

Exercise search, category activation, profile menu Escape, outside click, first-item focus, and opener restoration with `{ preventScroll: true }`.

- [ ] **Step 2: Run utility tests and verify RED**

Run: `bun run test -- tests/instrument-settings.test.tsx tests/profile-menu.test.tsx tests/design-system.test.ts`

Expected: FAIL because Appearance lacks Light and existing settings/menu styles retain legacy depth/accent rules.

- [ ] **Step 3: Implement complete flat utility surfaces**

```tsx
<InstrumentScreenHeader
  eyebrow="Preferences"
  title={activeLabel}
  actions={<InstrumentPill type="button" onClick={onBack}>Back to app</InstrumentPill>}
/>
```

Keep the existing category IDs and stateful provider/general/terminal controls. Make the Settings header sticky inside its single scroll owner; portal dialogs/menus/selects into bounded flat surfaces with 8px viewport margins, no shadow/blur/gradient, visible focus, Escape, and focus restoration. Disabled/no-op utilities keep `aria-disabled="true"` plus an adjacent reason. Remove fake What's New dates/counts if no feed supports them.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/instrument-settings.test.tsx tests/profile-menu.test.tsx tests/design-system.test.ts && bun run typecheck && bun run build && git diff --check`

Expected: suites/build pass; reviewer confirms every displayed settings value is either persisted/operational or explicitly local UI state, and portals fit a 1100x720 viewport.

- [ ] **Step 5: Commit utilities**

```bash
git add src/screens/SettingsScreen.tsx src/components/ProfileMenu.tsx src/components/ui/SelectMenu.tsx src/styles/settings.css src/styles/instrument.css tests/instrument-settings.test.tsx tests/profile-menu.test.tsx tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "feat: restyle settings and utilities"
```

### Task 8: Integrate permanent chat, bottom terminal, and foundation regression checks

**Files:**
- Modify: `src/components/UtilityPanels.tsx`
- Modify: `src/components/terminal/TerminalPane.tsx`
- Modify: `src/components/terminal/TerminalWorkspace.tsx`
- Modify: `src/components/media/AudioWaveform.tsx`
- Modify: `src/styles/terminal.css`
- Modify: `src/styles/instrument.css`
- Modify: `src/App.tsx`
- Test: `tests/instrument-chat-terminal.test.tsx`
- Test: `tests/chat-state.test.ts`
- Test: `tests/terminal-layout.test.ts`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: existing `AgentChatController`, terminal controller/layout, xterm instance, WaveSurfer instance, Task 3 `ResolvedTheme`, Task 4 right rail, and existing `⌘J`/right-panel callbacks.
- Produces: permanent dark `AgentChatPanel` with white composer, Instrument bottom terminal, explicit JS-consumer palette updates, and a runnable foundation that later plans only populate.

- [ ] **Step 1: Add failing chat/terminal/theme-consumer tests**

```tsx
expect(chatMarkup).toContain('class="instrument-chat-widget"');
expect(chatMarkup).toContain('class="agent-composer instrument-composer"');
expect(chatMarkup).toContain("Disconnected");
expect(chatMarkup).toContain('aria-label="Message agent"');
expect(terminalTheme("light").background).toBe("#141414");
expect(terminalTheme("dark").foreground).toBe("#F2F2F0");
expect(waveformTheme("dark").cursorColor).toBe("#E0362C");
```

Cover connected empty, messages/tools, permission mode, sending/loading/stopping, error, disconnected/provider setup, collapsed rail, and bottom-panel visible/hidden states.

- [ ] **Step 2: Run integration tests and verify RED**

Run: `bun run test -- tests/instrument-chat-terminal.test.tsx tests/chat-state.test.ts tests/terminal-layout.test.ts tests/design-system.test.ts`

Expected: FAIL because chat/terminal remain legacy panels and xterm/WaveSurfer do not receive resolved palettes.

- [ ] **Step 3: Integrate the stable shell consumers**

```ts
export function terminalTheme(_theme: ResolvedTheme): ITheme {
  return { background: "#141414", foreground: "#F2F2F0", cursor: "#F2F2F0", selectionBackground: "#3A3A38" };
}
export function waveformTheme(theme: ResolvedTheme) {
  return { waveColor: theme === "dark" ? "#8A8A86" : "#6E6E6A", progressColor: "#F2F2F0", cursorColor: "#E0362C" };
}
```

Keep all `AgentChatController` behavior and truthful provider/model/permission/error states. The right rail is 292px, chat is always `#141414`, and composer is `#F2F2F0` in both themes. Bottom terminal remains the existing lazy terminal, is controlled by `⌘J`, and uses the resolved palette without restart. Remove the old resize columns and `MainHeader`; `App` renders one `InstrumentShell` with sidebar, desk, island, permanent chat, optional rail accessory host, and bottom panel.

- [ ] **Step 4: Run the complete foundation gate**

Run: `bun run test -- tests/instrument-theme.test.ts tests/instrument-primitives.test.tsx tests/instrument-shell.test.tsx tests/instrument-sidebar.test.tsx tests/dynamic-island-feed.test.ts tests/dynamic-island.test.tsx tests/instrument-settings.test.tsx tests/instrument-chat-terminal.test.tsx tests/workbench-state.test.ts tests/workspace-navigation.test.tsx tests/marketplace-navigation.test.tsx tests/profile-menu.test.tsx tests/chat-state.test.ts tests/terminal-layout.test.ts tests/window-state.test.ts tests/design-system.test.ts && bun run typecheck && bun run build && git diff --check`

Expected: all named suites pass, typecheck/build exit 0, and the app is runnable with existing screens inside the new shell. Independent task review verifies the Stable Interface Lock against exported declarations before Plan 2 begins.

- [ ] **Step 5: Commit the runnable foundation**

```bash
git add src/components/UtilityPanels.tsx src/components/terminal/TerminalPane.tsx src/components/terminal/TerminalWorkspace.tsx src/components/media/AudioWaveform.tsx src/styles/terminal.css src/styles/instrument.css src/App.tsx tests/instrument-chat-terminal.test.tsx tests/chat-state.test.ts tests/terminal-layout.test.ts tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "feat: integrate instrument chat and terminal"
```

## Plan 1 Acceptance Gate

Run:

```bash
bun run test
bun run typecheck
bun run build
git diff --check "$NOTHING_FOUNDATION_BASE"..HEAD
```

Expected: all repository tests pass or only a baseline failure recorded before Task 1 remains; typecheck/build pass; the range contains no Core/database changes, new dependency, remote font/runtime, or shipped prototype file. Inspect forced light/dark at 1440x900 and confirm shell geometry, theme switching, island focus, permanent chat, terminal palette, and responsive collapse before starting Plan 2.
