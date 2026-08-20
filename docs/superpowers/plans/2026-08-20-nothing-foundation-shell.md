# Nothing Foundation and Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the durable reference, typed scenario contract, accessible token system, responsive shell, navigation, truthful Island, Settings, chat, and terminal foundations consumed verbatim by the next two plans.

**Architecture:** `App` and existing reducers remain owners of route, selection, restoration, and preferences. A focused `src/instrument/` layer owns presentation, docked/overlay rail behavior, the external desk scroll owner, scenario declarations, and renderer-only mock projection; it adds no Core session, review, or persistence contract.

**Tech Stack:** Electron 43.2.0 with embedded Node 24.18.0, React 19, resolved TypeScript 5.9.3, Bun 1.3, Vitest 0.34.6, Motion, Radix, Lucide React, xterm 6, WaveSurfer 7, CSS container queries.

**Spec:** `docs/superpowers/specs/2026-08-20-nothing-os-redesign-design.md`

**Visual evidence after Task 1:** `.superpowers/sdd/nothing-instrument/reference/design_handoff_instrument/README.md`, `design-v2.md`, and only sections `3a` / `3b` of `Ralphy Instrument System.dc.html`.

## Global Constraints

- Work only in `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/.worktrees/nothing-os-redesign` on `codex/nothing-os-redesign`; begin from the docs-only commit containing this revised spec and all three revised plans.
- This is a presentation rewrite. Reuse the current Core v3 contract, Electron security boundary, readers, controllers, reducers, media protocol, root fencing, MIME allowlists, clipboard bounds, and Marketplace origins.
- Do not add or reconcile a Core method, consumer credential/session lifecycle, `media.review` Desktop adapter, database migration, direct SQLite access, renderer filesystem/network access, sibling import, prototype runtime, remote asset/font, or package.
- Mock code loads only when `import.meta.env.VITE_RALPHY_ENABLE_MOCKS === "true"` and workspace name is exactly `UX Testing Lab`; it never crosses IPC/storage/files and production output contains no fixture ID or mock chunk path.
- Theme is exactly `system | dark | light`; apply it before paint and propagate the resolved palette to xterm and WaveSurfer. Required text uses the AA-readable token pairs from the spec.
- Right rail is exactly `docked | overlay | closed`; `overlay` is accessible and all virtualizers use `InstrumentScrollContext` rather than nested route scrollers.
- The one native hidden-inset traffic-light set remains functional. Never render HTML traffic-light duplicates.
- Each task starts with a definitely absent behavior, follows RED to GREEN, receives an independent task review, runs `git diff --check`, stages only named files, runs staged gitleaks, and commits.

---

Before Task 1, record `NOTHING_FOUNDATION_BASE=$(git rev-parse HEAD)` in executor notes. Do not commit the notes.

## Stable Interface Lock

Plans 2 and 3 import these exact names and fields. Any change requires a reviewed update to all three plans.

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
export type InstrumentRightRailMode = "docked" | "overlay" | "closed";
export type InstrumentRightRailOwner = "chat" | "media-review" | "shared-inspector" | "calendar-inspector" | "activity-inspector";

export interface InstrumentProfileIdentity {
  displayName: string;
  initials: string;
  avatarUrl: string | null;
}

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

export function ProjectDock<Id extends string>(props: {
  active: Id;
  items: readonly ProjectDockItem<Id>[];
  onSelect(id: Id): void;
}): React.ReactElement;

export function InstrumentProfileControl(props: {
  identity: InstrumentProfileIdentity;
  onOpenSettings(): void;
}): React.ReactElement;
```

```ts
// src/instrument/theme.ts and ThemeProvider.tsx
export const THEME_PREFERENCES: readonly ThemePreference[];
export function parseThemePreference(value: unknown): ThemePreference;
export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme;
export function applyResolvedTheme(root: HTMLElement, theme: ResolvedTheme): void;
export interface ThemeContextValue { preference: ThemePreference; resolved: ResolvedTheme; setPreference(value: ThemePreference): void }
export function ThemeProvider(props: { initialPreference: ThemePreference; children: React.ReactNode }): React.ReactElement;
export function useTheme(): ThemeContextValue;
```

```ts
// src/instrument/InstrumentShell.tsx
export interface InstrumentScrollContextValue {
  element: HTMLElement | null;
  width: number;
  height: number;
  routeScrollKey: string;
  getOffset(): number;
  scrollToOffset(offset: number, behavior?: ScrollBehavior): void;
  capture(): { key: string; offset: number };
  restore(snapshot: { key: string; offset: number }): void;
}

export interface InstrumentRightRailContextValue {
  mode: InstrumentRightRailMode;
  owner: InstrumentRightRailOwner;
  open(opener: HTMLElement | null): void;
  close(): void;
}

export interface InstrumentShellProps {
  sidebar: React.ReactNode;
  desk: React.ReactNode;
  chat: React.ReactNode;
  island: React.ReactNode;
  profile: React.ReactNode;
  routeScrollKey: string;
  leftVisible: boolean;
  rightPreference: boolean;
  rightOverlayOpen: boolean;
  bottomPanel?: React.ReactNode;
  bottomVisible: boolean;
  onToggleLeft(): void;
  onToggleRightPreference(): void;
  onRightOverlayOpenChange(open: boolean): void;
}

export function InstrumentShell(props: InstrumentShellProps): React.ReactElement;
export function useInstrumentScroll(): InstrumentScrollContextValue;
export function useInstrumentRightRail(): InstrumentRightRailContextValue;
export function InstrumentRightRailPortal(props: {
  owner: InstrumentRightRailOwner;
  label: string;
  children: React.ReactNode;
}): React.ReactPortal | null;
```

```ts
// src/instrument/scenarios.ts
export type InstrumentScenarioTheme = ThemePreference;
export type InstrumentViewport = "1440x900" | "1280x800" | "1100x720";
export type InstrumentRouteKey =
  | `startup.${"welcome" | "library" | "migration"}`
  | `workspace.${WorkspacePage}`
  | `project.${ProjectView}`
  | `settings.${"general" | "profile" | "appearance" | "providers" | "terminal" | "about"}`
  | `marketplace.${"discover" | "results" | "collection" | "detail"}`
  | `marketplace.category.${MarketplaceCategory}`
  | `marketplace.library.${MarketplaceLibrarySection}`
  | `marketplace.unavailable-detail.${"prompts" | "components" | "skills"}`;
export type InstrumentScenarioState =
  | "restoring" | "loading" | "ready" | "empty" | "offline" | "partial" | "unavailable" | "error"
  | "selected" | "disabled" | "editing" | "conflict" | "history" | "viewer" | "playing" | "scheduling" | "mock-review";
export type InstrumentOverlayId =
  | "none" | "root-picker" | "migration-recovery" | "app-alert" | "profile-menu" | "settings"
  | "dynamic-island" | "right-rail-sheet" | "shared-inspector" | "shared-viewer" | "shared-workflow"
  | "memory-editor" | "memory-history" | "memory-confirm" | "calendar-filter" | "calendar-drawer"
  | "calendar-inspector" | "calendar-schedule" | "document-editor" | "document-viewer" | "document-conflict"
  | "media-viewer" | "media-context-menu" | "mock-needs-work" | "unit-viewer" | "run-inspector"
  | "marketplace-detail" | "target-chooser" | "terminal";

export interface InstrumentScenario {
  id: string;
  routeKey: InstrumentRouteKey;
  state: InstrumentScenarioState;
  fixtureId: string;
  rootMarker: string;
  landmarks: readonly string[];
  railOwner: InstrumentRightRailOwner | null;
  overlay: InstrumentOverlayId;
  focusEntry: string | null;
  focusReturn: string | null;
  scrollOwner: "desk" | "overlay";
  themes: readonly InstrumentScenarioTheme[];
  viewports: readonly InstrumentViewport[];
  journeys: readonly ("keyboard" | "reduced-motion" | "live-region")[];
}

export const INSTRUMENT_SCENARIOS: readonly InstrumentScenario[];
export function assertInstrumentScenarioCompleteness(): void;

export interface InstrumentTestFixture { id: string; routeKey: InstrumentRouteKey; state: InstrumentScenarioState; payload: unknown }
export interface InstrumentTestFixtureProvider { get(fixtureId: string): InstrumentTestFixture | null }
export function loadInstrumentTestFixtures(): Promise<InstrumentTestFixtureProvider | null>;
```

```ts
// src/instrument/dynamic-island-feed.ts
export interface ProjectStatusSummary { approved: number; needsWork: number; rejected: number; unreviewed: number }
export interface IslandTask {
  id: string;
  label: string;
  status: "running" | "complete" | "failed";
  progress: number | null;
  destination?: WorkbenchRoute | MarketplaceLocation;
}
export interface IslandNotification {
  id: string;
  title: string;
  timestamp: number;
  severity: "info" | "attention" | "error";
  unread: boolean;
  destination?: WorkbenchRoute | MarketplaceLocation;
}
export interface DynamicIslandFeed {
  projectStatus: Availability<ProjectStatusSummary>;
  activeTask: IslandTask | null;
  notifications: Availability<IslandNotification[]>;
}
export interface DynamicIslandProjectionInput { rootEpoch: number; agentState: AgentChatState; appError: string | null }
export function projectDynamicIslandFeed(input: DynamicIslandProjectionInput): DynamicIslandFeed;
export interface DynamicIslandMockContext { rootEpoch: number; workspace: WorkspaceSummary | null; project: ProjectSummary | null }
export type DynamicIslandMockProvider = (input: DynamicIslandMockContext) => DynamicIslandFeed | null;
```

## File Map

- `.superpowers/sdd/nothing-instrument/` — ignored stable reference and generated evidence only.
- `src/instrument/types.ts`, `theme.ts`, `palette.ts` — stable types, theme helpers, named palette and contrast data.
- `src/instrument/scenarios.ts` — exhaustive scenario manifest and registry completeness.
- `src/instrument/test-fixtures.ts`, `dynamic-island-mock.ts` — compile-time mock-only fixtures.
- `src/instrument/InstrumentShell.tsx` — shell geometry, rail state, portal, external desk scroll owner.
- `src/instrument/primitives.tsx`, `InstrumentSidebar.tsx`, `ProjectDock.tsx`, `DynamicIsland.tsx` — shared presentation components.
- `src/styles/tokens.css`, `instrument.css`, `settings.css`, `terminal.css` — token-consuming style layers.

### Task 1: Pin and extract the authoritative handoff

**Files:**
- Modify: `.gitignore`
- Create: `scripts/prepare-instrument-evidence.mjs`
- Test: `tests/instrument-reference.test.ts`

**Interfaces:**
- Consumes: archive `/Users/maximovchinnikov/Downloads/Ralphy дизайн система (11).zip`.
- Produces: `REFERENCE_SHA256`, `EVIDENCE_ROOT`, `REFERENCE_ROOT`, and `bun scripts/prepare-instrument-evidence.mjs`.

- [ ] **Step 1: Write a failing archive/evidence test**

```ts
expect(REFERENCE_SHA256).toBe("fe371e93e3d778bbd9d7e5621d200ff4298e386edbbc20d3e971941c004c0804");
expect(await prepareInstrumentEvidence()).toMatchObject({
  readme: expect.stringContaining("design_handoff_instrument/README.md"),
  mediaSections: ["3a", "3b"],
});
expect(readFileSync(".gitignore", "utf8")).toContain(".superpowers/sdd/nothing-instrument/");
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-reference.test.ts`

Expected: FAIL because the preparation module and ignored stable workspace do not exist.

- [ ] **Step 3: Implement deterministic preparation**

```js
export const REFERENCE_SHA256 = "fe371e93e3d778bbd9d7e5621d200ff4298e386edbbc20d3e971941c004c0804";
export const EVIDENCE_ROOT = resolve(".superpowers/sdd/nothing-instrument");
export const REFERENCE_ROOT = join(EVIDENCE_ROOT, "reference", "design_handoff_instrument");
```

Hash with `createHash("sha256")`, reject mismatch before extraction, create `reference/`, invoke macOS `ditto -x -k` through `Bun.spawn`, and verify `README.md`, `design-v2.md`, HTML anchors `id="3a"`/`id="3b"`, all local media assets, and absence of extraction outside `EVIDENCE_ROOT`. Refuse a non-empty mismatched reference directory instead of deleting it.

- [ ] **Step 4: Run GREEN and reviewer gate**

Run: `bun run test -- tests/instrument-reference.test.ts && bun scripts/prepare-instrument-evidence.mjs && git diff --check`

Expected: PASS and print the absolute reference root. Reviewer verifies the SHA, ignored path, and authoritative 3a/3b files before any UI work.

- [ ] **Step 5: Commit**

```bash
git add .gitignore scripts/prepare-instrument-evidence.mjs tests/instrument-reference.test.ts
gitleaks protect --staged --redact
git commit -m "test: pin instrument design evidence"
```

### Task 2: Establish the exhaustive scenario and fixture boundary

**Files:**
- Create: `src/instrument/scenarios.ts`
- Create: `src/instrument/test-fixtures.ts`
- Create: `src/instrument/load-test-fixtures.ts`
- Test: `tests/instrument-scenarios.test.ts`
- Test: `tests/instrument-production-fixtures.test.ts`

**Interfaces:**
- Consumes: actual `WorkbenchRoute`, `WorkspacePage`, `ProjectView`, `MarketplaceRoute`, Settings categories, and the overlay registry.
- Produces: exact scenario interfaces in the Stable Interface Lock and `loadInstrumentTestFixtures(): Promise<InstrumentTestFixtureProvider | null>`.

- [ ] **Step 1: Write failing completeness and false-string tests**

```ts
expect(() => assertInstrumentScenarioCompleteness()).not.toThrow();
expect(missingRouteStatePairs()).toEqual([]);
expect(missingRegisteredOverlays()).toEqual([]);
expect(duplicateScenarioIds()).toEqual([]);
expect(loaderSource).toContain('import.meta.env.VITE_RALPHY_ENABLE_MOCKS === "true"');
expect(loaderSource).not.toMatch(/if\s*\(import\.meta\.env\.VITE_RALPHY_ENABLE_MOCKS\s*\)/);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-scenarios.test.ts tests/instrument-production-fixtures.test.ts`

Expected: FAIL because there is no typed manifest, overlay registry, or guarded fixture loader.

- [ ] **Step 3: Implement exact registries and mock-only loader**

Define route keys for startup `welcome/library/migration`, workspace `overview/projects/units/shared/memory/calendar`, project `documents/media/units/activity`, Settings `general/profile/appearance/providers/terminal/about`, and all Marketplace route/category/library/detail variants from `marketplace-navigation.ts`. Define `INSTRUMENT_SCENARIO_REQUIREMENTS` as `satisfies Record<InstrumentRouteKey, readonly InstrumentScenarioState[]>`; include every overlay in the locked union. Load fixtures only inside:

```ts
export async function loadInstrumentTestFixtures() {
  if (import.meta.env.VITE_RALPHY_ENABLE_MOCKS === "true") {
    return (await import("./test-fixtures")).instrumentTestFixtureProvider;
  }
  return null;
}
```

Fixtures expose stable IDs and renderer DTOs only; they import no bridge/Electron/filesystem type and are never statically re-exported.

- [ ] **Step 4: Run GREEN, both builds, and reviewer gate**

Run: `bun run test -- tests/instrument-scenarios.test.ts tests/instrument-production-fixtures.test.ts && VITE_RALPHY_ENABLE_MOCKS=true bun run build:renderer && VITE_RALPHY_ENABLE_MOCKS=false bun run build:renderer && ! rg -a 'instrument-test-fixture|test-fixtures' dist && git diff --check`

Expected: tests/builds pass and false output has no fixture ID or chunk path. Reviewer checks the manifest against actual unions and registered overlays.

- [ ] **Step 5: Commit**

```bash
git add src/instrument/scenarios.ts src/instrument/test-fixtures.ts src/instrument/load-test-fixtures.ts tests/instrument-scenarios.test.ts tests/instrument-production-fixtures.test.ts
gitleaks protect --staged --redact
git commit -m "test: define instrument scenario contract"
```

### Task 3: Bundle Doto and establish the named AA palette

**Files:**
- Create: `public/assets/fonts/Doto-Variable.ttf`
- Create: `public/assets/fonts/OFL-Doto.txt`
- Create: `src/instrument/types.ts`
- Create: `src/instrument/theme.ts`
- Create: `src/instrument/palette.ts`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/reset.css`
- Test: `tests/instrument-theme.test.ts`
- Test: `tests/instrument-contrast.test.ts`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: pinned Google Fonts commit `2c982e6bdf88fefbe9e34e78695d8e9e02d788ec` and Plan 1 stable types.
- Produces: `INSTRUMENT_PALETTE`, `INSTRUMENT_COLOR_ALLOWLIST`, `contrastRatio`, theme helpers, CSS tokens, and local Doto/OFL bytes.

- [ ] **Step 1: Write failing byte, token, and contrast tests**

```ts
expect(sha256("public/assets/fonts/Doto-Variable.ttf")).toBe("6f4fe7d37853b91df3698daa84cde2dbe1c9695d88c986e6510134910337d426");
expect(INSTRUMENT_PALETTE.light.textSecondaryReadable).toBe("#4A4A48");
expect(INSTRUMENT_PALETTE.dark.textSecondaryReadable).toBe("#A4A4A0");
expect(contrastRatio("#4A4A48", "#E2E4EA")).toBeGreaterThanOrEqual(4.5);
expect(contrastRatio("#A4A4A0", "#141414")).toBeGreaterThanOrEqual(4.5);
expect(INSTRUMENT_COLOR_ALLOWLIST).toEqual(expect.arrayContaining(["#111111", "#262626", "#2E2E2E", "#E8E8E6", "#4A4A48", "#DFE2E9", "#EB4438", "#ED6A5E", "#F0B544", "#5CC45C"]));
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-theme.test.ts tests/instrument-contrast.test.ts tests/design-system.test.ts`

Expected: FAIL because Doto, the named palette, readable tokens, and contrast helpers do not exist.

- [ ] **Step 3: Fetch verified bytes and implement the palette**

```bash
gh api 'repos/google/fonts/contents/ofl/doto/Doto%5BROND%2Cwght%5D.ttf?ref=2c982e6bdf88fefbe9e34e78695d8e9e02d788ec' --jq .content | tr -d '\n' | base64 --decode > public/assets/fonts/Doto-Variable.ttf
gh api 'repos/google/fonts/contents/ofl/doto/OFL.txt?ref=2c982e6bdf88fefbe9e34e78695d8e9e02d788ec' --jq .content | tr -d '\n' | base64 --decode > public/assets/fonts/OFL-Doto.txt
```

Use this complete authored-app allowlist; `#7F7BD6` is explicitly forbidden:

```ts
export const INSTRUMENT_COLOR_ALLOWLIST = [
  "#050505", "#060606", "#111111", "#141414", "#181818", "#1C1C1C", "#1D1D1D", "#1E1E1E",
  "#242422", "#242424", "#262626", "#2D2D2D", "#2E2E2E", "#343434", "#3A3A38", "#3F3F3D",
  "#4A4A48", "#5CC45C", "#6A6A66", "#6E6E6A", "#8A8A86", "#9A9A96", "#A4A4A0",
  "#CCCED6", "#D3D6DD", "#D8D8D6", "#DFE2E9", "#E0362C", "#E2E4EA", "#E4E4E2",
  "#E8E8E6", "#EB4438", "#ED6A5E", "#F0B544", "#F1F2F6", "#F2F2F0", "#FFFFFF",
] as const;

export const DITHER_ASSET_SHA256 = {
  "g1.png": "fb43bf175834760b7cc472c5c8851b883650c47127dc692ead9015c097f80bcb",
  "g2.png": "72dde495cb348ae80a6533fd0871ca09a29a643570ea6c37da491b0ddb3635eb",
  "g3.png": "5dfa56d359c95cfcfb5e1998e379b9fc013e4f473d106ffce636825aaa4e95fd",
  "g4.png": "2c2ccc8a300e3292c6172de49bdc11baa0120ba29d085dd803cd5f04a637e47b",
  "g5.png": "ca0dbba304dc263da977858db43455a871ca7e5ea6d28fd85456dfa0cbed478e",
  "g6.png": "1c0bae79c7c4ae0eb748aaf695d75740f8aef202173f1440800e5bfa4ed775f1",
  "g7.png": "69a66ce0370d80ac3ec671b3ceee0896754f03e72e49ee0148e5137ba4ba29c4",
  "g8.png": "89056912780217afd1eb20ef3b18ed9cbe02b1cd242d92e20842fb846dc5c4a3",
  "orb-22.png": "754610c28180607de31c84bc7ce7a41234049f9295b354803392fa62f116d1c7",
  "ribbon-card-hi.png": "85080b991d4ef998968942ab6b13bae54fa7e1f715a7d10a7c961c909180b574",
  "ribbon-card.png": "3d0850222336365e709e03be1ad7c604f22addb0a40f32cec0e67bfe1870a6af",
  "row-field.png": "4c79cea9da6447e45df8b154decd8b459d37c2264ddb03b50ae8c19aa4220240",
} as const;
```

CSS references named tokens; low-contrast values are decorative/disabled tokens only. The later audit permits byte-identical dither PNGs rather than arbitrary dither colors.

- [ ] **Step 4: Run GREEN and reviewer gate**

Run: `bun run test -- tests/instrument-theme.test.ts tests/instrument-contrast.test.ts tests/design-system.test.ts && bun run typecheck && git diff --check`

Expected: PASS. Reviewer confirms every authored palette literal is named, readable text pairs are AA, Doto is minimum 13px, and old purple is absent.

- [ ] **Step 5: Commit**

```bash
git add public/assets/fonts/Doto-Variable.ttf public/assets/fonts/OFL-Doto.txt src/instrument/types.ts src/instrument/theme.ts src/instrument/palette.ts src/styles/tokens.css src/styles/reset.css tests/instrument-theme.test.ts tests/instrument-contrast.test.ts tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "feat: establish accessible instrument tokens"
```

### Task 4: Add shared primitives and the stable profile control

**Files:**
- Create: `src/instrument/primitives.tsx`
- Create: `src/instrument/InstrumentProfileControl.tsx`
- Modify: `src/lib/project-glyph.ts`
- Modify: `src/main.tsx`
- Create: `src/styles/instrument.css`
- Test: `tests/instrument-primitives.test.tsx`
- Test: `tests/instrument-profile.test.tsx`
- Test: `tests/project-glyph.test.ts`

**Interfaces:**
- Consumes: named tokens, existing `ProfileAvatar` identity derivation, Radix menu/dialog behavior, Lucide icons.
- Produces: `InstrumentWidget`, `InstrumentPill`, `InstrumentIconButton`, `InstrumentCounter`, `StatusDot`, `DitherIdentity`, `InstrumentScreenHeader`, `InstrumentEmptyState`, and `InstrumentProfileControl` using `InstrumentProfileIdentity`.

- [ ] **Step 1: Write behavior-first primitive/profile tests**

```tsx
await user.click(screen.getByRole("button", { name: "Open profile menu" }));
expect(screen.getByRole("menu")).toHaveFocus();
await user.keyboard("{Escape}");
expect(screen.getByRole("button", { name: "Open profile menu" })).toHaveFocus();
expect(render(<InstrumentEmptyState title="Unavailable" reason="No contract" />)).toContain("No contract");
expect(iconButton).toHaveAttribute("aria-label", "Refresh");
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-primitives.test.tsx tests/instrument-profile.test.tsx tests/project-glyph.test.ts`

Expected: FAIL because the shared components and stable profile menu do not exist.

- [ ] **Step 3: Implement semantic primitives**

```tsx
export function InstrumentIconButton({ label, tooltip = label, children, ...button }: React.ComponentProps<"button"> & { label: string; tooltip?: string }) {
  return <button {...button} className="instrument-icon-button" aria-label={label} title={tooltip}>{children}</button>;
}
```

Use native button/section/progress/disclosure semantics. Profile uses derived display name/initials and local avatar URL or fallback; menu exposes Settings and dismissal callbacks, contains no fake account action, traps no page scroll, and restores focus with `{ preventScroll: true }`. Add `data-instrument-root` to every shared route/portal root primitive.

- [ ] **Step 4: Run GREEN and reviewer gate**

Run: `bun run test -- tests/instrument-primitives.test.tsx tests/instrument-profile.test.tsx tests/project-glyph.test.ts && bun run typecheck && git diff --check`

Expected: PASS. Reviewer confirms primitives serve multiple routes, status is not color-only, and profile behavior is stable and keyboard complete.

- [ ] **Step 5: Commit**

```bash
git add src/instrument/primitives.tsx src/instrument/InstrumentProfileControl.tsx src/lib/project-glyph.ts src/main.tsx src/styles/instrument.css tests/instrument-primitives.test.tsx tests/instrument-profile.test.tsx tests/project-glyph.test.ts
gitleaks protect --staged --redact
git commit -m "feat: add instrument primitives and profile"
```

### Task 5: Persist and apply the three-state theme before paint

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
- Consumes: theme helpers and existing `ralphy-media-workbench-v1` key.
- Produces: `ThemeProvider`, `useTheme`, and `theme: ThemePreference` in `WorkbenchPreferences`.

- [ ] **Step 1: Write failing preference/startup/system tests**

```ts
expect(readWorkbenchPreferences(storageWith({ theme: "sepia" })).theme).toBe("system");
expect(indexSource.indexOf('/theme-bootstrap.js')).toBeLessThan(indexSource.indexOf("<body>"));
expect(indexSource).not.toMatch(/<script(?![^>]+src=)[^>]*>/i);
expect(await emulateSystemTheme("dark")).toMatchObject({ dataset: "dark", colorScheme: "dark" });
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-theme.test.ts tests/workbench-state.test.ts tests/instrument-settings.test.tsx`

Expected: FAIL because preferences lack Light, no CSP-safe prepaint script exists, and system changes do not propagate.

- [ ] **Step 3: Implement provider and local head bootstrap**

```tsx
export function ThemeProvider({ initialPreference, children }: { initialPreference: ThemePreference; children: React.ReactNode }) {
  const media = useMemo(() => matchMedia("(prefers-color-scheme: dark)"), []);
  const [preference, setPreference] = useState(initialPreference);
  const [systemDark, setSystemDark] = useState(media.matches);
  const resolved = resolveTheme(preference, systemDark);
  useLayoutEffect(() => applyResolvedTheme(document.documentElement, resolved), [resolved]);
  return <ThemeContext.Provider value={{ preference, resolved, setPreference }}>{children}</ThemeContext.Provider>;
}
```

Add blocking `/theme-bootstrap.js` immediately after CSP in `<head>`. It reads only the existing key, validates theme, resolves `matchMedia`, sets `data-theme`/`colorScheme`, and catches storage errors. `ThemeProvider` owns the sole media-query listener. `App` persists `useTheme().preference`; Settings renders controlled System/Dark/Light.

- [ ] **Step 4: Run GREEN and reviewer gate**

Run: `bun run test -- tests/instrument-theme.test.ts tests/workbench-state.test.ts tests/instrument-settings.test.tsx && bun run typecheck && bun run build && git diff --check`

Expected: PASS; built HTML keeps `script-src 'self'`, prepaint script precedes body, and no remote font/script exists. Reviewer checks system listener cleanup and no first-frame flash.

- [ ] **Step 5: Commit**

```bash
git add public/theme-bootstrap.js src/instrument/ThemeProvider.tsx index.html src/main.tsx src/state/workbench.ts src/App.tsx src/screens/SettingsScreen.tsx tests/instrument-theme.test.ts tests/workbench-state.test.ts tests/instrument-settings.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: persist three-state instrument theme"
```

### Task 6: Build the native responsive shell, shared rail, and scroll context

**Files:**
- Create: `src/instrument/InstrumentShell.tsx`
- Modify: `src/styles/instrument.css`
- Modify: `src/App.tsx`
- Modify: `src/state/workbench.ts`
- Modify: `electron/main.ts`
- Test: `tests/instrument-shell.test.tsx`
- Test: `tests/instrument-scroll-context.test.tsx`
- Test: `tests/window-state.test.ts`

**Interfaces:**
- Consumes: Stable Interface Lock, native hidden-inset BrowserWindow, persisted panel preferences.
- Produces: exact shell/rail/scroll interfaces; `resolveRightRailMode({ dockEligible, preferenceOpen, overlayOpen })`.

- [ ] **Step 1: Write failing rail, scroll, and native-chrome behaviors**

```tsx
expect(resolveRightRailMode({ dockEligible: true, preferenceOpen: true, overlayOpen: false })).toBe("docked");
expect(resolveRightRailMode({ dockEligible: false, preferenceOpen: true, overlayOpen: false })).toBe("closed");
expect(resolveRightRailMode({ dockEligible: false, preferenceOpen: true, overlayOpen: true })).toBe("overlay");
expect(renderShell()).toHaveSingleScrollOwner("instrument-desk-scroll");
expect(mainSource).toMatch(/titleBarStyle:\s*"hiddenInset"/);
expect(renderShell()).not.toContain("traffic-light");
```

Exercise overlay open/Escape/focus restore/inert/scroll lock and scroll capture/restore after a route-key round trip.

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-shell.test.tsx tests/instrument-scroll-context.test.tsx tests/window-state.test.ts tests/workbench-state.test.ts`

Expected: FAIL because rail modes, overlay accessibility, external scroll context, and Instrument shell do not exist.

- [ ] **Step 3: Implement measured shell contracts**

```ts
export function resolveRightRailMode(input: { dockEligible: boolean; preferenceOpen: boolean; overlayOpen: boolean }): InstrumentRightRailMode {
  if (input.dockEligible) return input.preferenceOpen ? "docked" : "closed";
  return input.overlayOpen ? "overlay" : "closed";
}
```

Measure desk/frame with one `ResizeObserver`; docking requires window width at least 1280 and desk at least 680px. New/invalid preferences default right panel to true, explicit false persists, and automatic narrow behavior never writes it. Overlay uses a labelled dialog/sheet, focus trap, inert desk, local marked scroller, Escape, and opener restoration. Reserve a measured native inset; keep one hidden-inset traffic-light set, remove vibrancy/transparency, and render no HTML copy. Expose the desk element to virtualizers and capture offsets by `routeScrollKey`.

- [ ] **Step 4: Run GREEN and reviewer gate**

Run: `bun run test -- tests/instrument-shell.test.tsx tests/instrument-scroll-context.test.tsx tests/window-state.test.ts tests/workbench-state.test.ts && bun run typecheck && bun run build && git diff --check`

Expected: PASS. Reviewer verifies docked/overlay/closed transitions, one desk scroll owner, modal-local exception, selection retention, native inset, and no preference write on automatic collapse.

- [ ] **Step 5: Commit**

```bash
git add src/instrument/InstrumentShell.tsx src/styles/instrument.css src/App.tsx src/state/workbench.ts electron/main.ts tests/instrument-shell.test.tsx tests/instrument-scroll-context.test.tsx tests/window-state.test.ts tests/workbench-state.test.ts
gitleaks protect --staged --redact
git commit -m "feat: build responsive instrument shell"
```

### Task 7: Prove shell geometry at all three viewports early

**Files:**
- Create: `scripts/audit-instrument-shell.mjs`
- Create: `scripts/db-fingerprint.mjs`
- Create: `scripts/with-db-fingerprint.mjs`
- Modify: `package.json`
- Test: `tests/instrument-shell-audit.test.ts`
- Test: `tests/db-fingerprint.test.ts`

**Interfaces:**
- Consumes: built Electron app in mock mode, temporary `userData`, Bun built-in fetch/WebSocket, and live DB path as opaque files only.
- Produces: `bun run audit:instrument:shell`, `.superpowers/sdd/nothing-instrument/shell/manifest.json`, `snapshotDatabaseFamily`, `compareDatabaseSnapshots`, `withDatabaseFingerprint(label, launch)`, and `bun scripts/with-db-fingerprint.mjs --label <label> -- <single-launch command>`.

- [ ] **Step 1: Write failing calibration and geometry tests**

```ts
expect(shellCases()).toEqual([[1440, 900], [1280, 800], [1100, 720]]);
expect(calibrateGeometry({ outer: { width: 1440, height: 900 }, inner: { width: 1440, height: 872 } }).topInset).toBe(28);
expect(assertShellGeometry(valid1100Overlay)).toBeUndefined();
expect(() => assertShellGeometry({ ...valid1100Overlay, bodyScrollWidth: 1101 })).toThrow(/horizontal overflow/i);
expect(compareDatabaseSnapshots(before, identicalAfter).violations).toEqual([]);
expect(compareDatabaseSnapshots(before, changedWal).violations).toContain("ralphy.db-wal changed");
expect(compareDatabaseSnapshots(before, changedShm).violations).toEqual([]);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-shell-audit.test.ts tests/db-fingerprint.test.ts`

Expected: FAIL because the Bun CDP shell auditor, geometry calibration, and per-launch DB-family wrapper do not exist.

- [ ] **Step 3: Implement isolated real-Electron shell audit**

```ts
export type FileFingerprint = { exists: boolean; sha256: string | null; bytes: bigint | null; mtimeNs: bigint | null };
export type DatabaseFamilySnapshot = { main: FileFingerprint; wal: FileFingerprint; shm: Omit<FileFingerprint, "sha256"> };
```

Use `Bun.spawn`, `fetch`, and `WebSocket`; create one temporary `--user-data-dir` per case and call `withDatabaseFingerprint(label, launch)` around each Electron child, with label `foundation-shell-${width}x${height}`. Record native `Browser.getWindowBounds`, renderer inner size, device scale and inset separately. At 1440 assert docked 240/desk/292; at 1280 assert conditional dock threshold; at 1100 assert closed then user-opened accessible overlay. Check one native traffic-light inset/no HTML duplicates, drag/no-drag regions, one scroll owner, no body overflow, dock clearance, Escape/focus restoration, and screenshots. Add `"audit:instrument:shell": "bun scripts/audit-instrument-shell.mjs"`.

Implement the wrapper without opening SQLite. For `/Users/maximovchinnikov/.ralphy/ralphy.db` and `-wal`, record existence, streaming SHA-256, bytes, and bigint nanosecond mtime before/after one child launch and fail on any difference including creation/removal. Record `-shm` existence/bytes/mtime separately without failing or claiming byte immutability. Always write the labelled JSON record even when the child fails.

- [ ] **Step 4: Run GREEN and reviewer gate**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run build && bun run audit:instrument:shell && git diff --check`

Expected: prints `INSTRUMENT_SHELL_AUDIT_OK 3` and absolute manifest path; main DB/WAL fingerprints match and SHM is recorded. Reviewer checks all three screenshots and the launch record before route migration continues.

- [ ] **Step 5: Commit**

```bash
git add scripts/audit-instrument-shell.mjs scripts/db-fingerprint.mjs scripts/with-db-fingerprint.mjs package.json tests/instrument-shell-audit.test.ts tests/db-fingerprint.test.ts
gitleaks protect --staged --redact
git commit -m "test: gate responsive shell geometry"
```

### Task 8: Replace sidebar chrome and project tabs

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
- Consumes: current navigation callbacks, truthful counts, stable profile control, `ProjectView`.
- Produces: `InstrumentSidebar` and generic `ProjectDock`; workspace selector marker `data-workspace-name`.

- [ ] **Step 1: Write interaction-first navigation tests**

```tsx
await user.click(screen.getByRole("button", { name: "Marketplace" }));
expect(onSwitchMode).toHaveBeenCalledWith("marketplace");
expect(screen.queryByText("UX Testing Lab")).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "Media" }));
expect(onProjectView).toHaveBeenCalledWith("media");
expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-sidebar.test.tsx tests/project-screen.test.tsx tests/workspace-navigation.test.tsx tests/marketplace-navigation.test.tsx`

Expected: FAIL because the legacy continuous sidebar/tab strip remains and the interactions lack Instrument roots.

- [ ] **Step 3: Implement truthful navigation**

```tsx
const PROJECT_DOCK_ITEMS: readonly ProjectDockItem<ProjectView>[] = [
  { id: "documents", label: "Documents", icon: FileText },
  { id: "media", label: "Media", icon: Image },
  { id: "units", label: "Units", icon: Layers3 },
  { id: "activity", label: "Activity", icon: Activity },
];
```

Render mode pill, work-only dither identity, route widgets with supported counts only, bottom profile control, and capability-aware dock for Documents/Media/Units/Activity. Put `data-workspace-name={workspace.name}` on the focusable selector. Preserve reducer history/focus/scroll callbacks; Settings opens only from profile. Marketplace omits workspace identity and keeps Models inside Marketplace.

- [ ] **Step 4: Run GREEN and reviewer gate**

Run: `bun run test -- tests/instrument-sidebar.test.tsx tests/project-screen.test.tsx tests/workspace-navigation.test.tsx tests/marketplace-navigation.test.tsx tests/instrument-profile.test.tsx && bun run typecheck && git diff --check`

Expected: PASS. Reviewer traces every enabled row to an existing callback and checks keyboard order and route scroll restoration.

- [ ] **Step 5: Commit**

```bash
git add src/instrument/InstrumentSidebar.tsx src/instrument/ProjectDock.tsx src/App.tsx src/screens/ProjectScreen.tsx src/styles/instrument.css tests/instrument-sidebar.test.tsx tests/project-screen.test.tsx tests/workspace-navigation.test.tsx tests/marketplace-navigation.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: replace navigation with instruments"
```

### Task 9: Add truthful live and isolated mock Dynamic Island feeds

**Files:**
- Create: `src/instrument/dynamic-island-feed.ts`
- Create: `src/instrument/dynamic-island-mock.ts`
- Create: `src/instrument/DynamicIsland.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/instrument.css`
- Test: `tests/dynamic-island-feed.test.ts`
- Test: `tests/dynamic-island-mock.test.ts`
- Test: `tests/dynamic-island.test.tsx`

**Interfaces:**
- Consumes: locked feed types, renderer chat/error memory, mock loader.
- Produces: live projector with unavailable counters/optional destinations and UX mock projector with counters/task/three notifications.

- [ ] **Step 1: Write failing truth/focus/once-only tests**

```ts
expect(projectDynamicIslandFeed(liveBusyChat).projectStatus.status).toBe("unavailable");
expect(projectDynamicIslandFeed(liveBusyChat).activeTask?.destination).toBeUndefined();
expect(projectMockDynamicIslandFeed(otherWorkspace)).toBeNull();
expect(projectMockDynamicIslandFeed(uxWorkspace)?.notifications.status).toBe("ready");
expect(mockAnimationCountAfterAwayAndBack()).toBe(1);
```

Open/close with keyboard; assert focus/scroll retention, no action for missing destination, action only for explicit mock provenance, polite deduped live region, and no focus movement on updates.

- [ ] **Step 2: Run RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/dynamic-island-feed.test.ts tests/dynamic-island-mock.test.ts tests/dynamic-island.test.tsx`

Expected: FAIL because the feed/component do not exist.

- [ ] **Step 3: Implement live truth and mock isolation**

```ts
export function projectDynamicIslandFeed(input: DynamicIslandProjectionInput): DynamicIslandFeed {
  return {
    projectStatus: { status: "unavailable", reason: "Project review totals are unavailable from the current Desktop contract." },
    activeTask: projectLiveChatTask(input.agentState),
    notifications: projectLiveAppErrors(input.appError),
  };
}
```

Live counters are always `{ status: "unavailable", reason: "Project review totals are unavailable from the current Desktop contract." }`; live chat task has null progress and no inferred destination. Errors become notifications without navigation unless explicit provenance exists. Mock provider matches exact workspace name, uses actual route IDs, stable counters/task/three notification IDs, and is dynamically imported only under `=== "true"`. Keep `hasAnimatedMockNotification` for renderer lifetime, separate from root/workspace feed reset.

- [ ] **Step 4: Run GREEN, both builds, and reviewer gate**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/dynamic-island-feed.test.ts tests/dynamic-island-mock.test.ts tests/dynamic-island.test.tsx && VITE_RALPHY_ENABLE_MOCKS=false bun run build:renderer && ! rg -a 'ux-mock-render-1|dynamic-island-mock' dist && git diff --check`

Expected: PASS and production contains no mock ID/chunk path. Reviewer checks stale navigation, deleted context, focus, reduced motion, and once-per-session animation.

- [ ] **Step 5: Commit**

```bash
git add src/instrument/dynamic-island-feed.ts src/instrument/dynamic-island-mock.ts src/instrument/DynamicIsland.tsx src/App.tsx src/styles/instrument.css tests/dynamic-island-feed.test.ts tests/dynamic-island-mock.test.ts tests/dynamic-island.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: add truthful dynamic island"
```

### Task 10: Rebuild Settings from an explicit capability table

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/components/ProfileMenu.tsx`
- Modify: `src/components/ui/SelectMenu.tsx`
- Modify: `src/styles/settings.css`
- Modify: `src/styles/instrument.css`
- Test: `tests/instrument-settings.test.tsx`
- Test: `tests/profile-menu.test.tsx`
- Test: `tests/settings-capabilities.test.ts`

**Interfaces:**
- Consumes: theme/profile contracts and existing operational callbacks.
- Produces: `SETTINGS_CAPABILITIES: readonly SettingsCapability[]` with `id`, `backing`, `lifetime`, `enabled`, `verification`, `disabledReason`.

- [ ] **Step 1: Write failing capability and overlay behaviors**

```ts
expect(capability("appearance.theme")).toMatchObject({ backing: "WorkbenchPreferences.theme", lifetime: "persistent", enabled: true });
expect(capability("providers.keys")).toMatchObject({ enabled: false, disabledReason: "Provider credentials are configured outside Settings in this release." });
expect(capability("terminal.shell")).toMatchObject({ enabled: false, disabledReason: "Terminal shell mode is not configurable in this release." });
expect(capability("appearance.motion")).toMatchObject({ enabled: false, disabledReason: "Motion follows macOS Reduced Motion in this release." });
```

Interact with search/profile/select/modal; assert sticky header, Escape, focus return, and every unsupported control is focusable `aria-disabled`, never enabled local state.

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-settings.test.tsx tests/profile-menu.test.tsx tests/settings-capabilities.test.ts`

Expected: FAIL because current density/motion/provider/shell/display controls pretend local capability and no table exists.

- [ ] **Step 3: Implement exact capability rulings**

```ts
export const SETTINGS_CAPABILITIES = [
  { id: "general.root", backing: "WorkbenchPreferences.rootPath", lifetime: "persistent", enabled: true, verification: "read-only value", disabledReason: null },
  { id: "general.restore", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "No persisted preference exists in this release." },
  { id: "general.reveal", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "No persisted preference exists in this release." },
  { id: "profile.identity", backing: "active root identity", lifetime: "root-scoped", enabled: true, verification: "derived render", disabledReason: null },
  { id: "profile.displayName", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "Profile identity is derived from the active library." },
  { id: "appearance.theme", backing: "WorkbenchPreferences.theme", lifetime: "persistent", enabled: true, verification: "two-launch", disabledReason: null },
  { id: "appearance.density", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "Interface density is fixed in this release." },
  { id: "appearance.motion", backing: "matchMedia(prefers-reduced-motion)", lifetime: "system", enabled: false, verification: "computed media", disabledReason: "Motion follows macOS Reduced Motion in this release." },
  { id: "providers.keys", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "Provider credentials are configured outside Settings in this release." },
  { id: "providers.connect", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "Provider connections are configured outside Settings in this release." },
  { id: "terminal.workingDirectory", backing: "active root", lifetime: "root-scoped", enabled: true, verification: "read-only value", disabledReason: null },
  { id: "terminal.shell", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "Terminal shell mode is not configurable in this release." },
  { id: "terminal.links", backing: "none", lifetime: "none", enabled: false, verification: "disabled", disabledReason: "Terminal link handling is not configurable in this release." },
  { id: "terminal.toggle", backing: "existing Cmd+J action", lifetime: "runtime", enabled: true, verification: "invoke and observe panel", disabledReason: null },
  { id: "about.version", backing: "package metadata", lifetime: "build", enabled: true, verification: "read-only value", disabledReason: null },
] as const;
```

Enable only read-only root/profile identity, persisted theme, operational Back/search/category navigation, working terminal shortcut, and static About facts. Disable restore/reveal (`No persisted preference exists in this release.`), profile display-name editing (`Profile identity is derived from the active library.`), density, motion, provider keys/connect, shell mode, and link toggle with exact reasons. Reskin overlays as bounded flat Instrument surfaces; no fake What's New data.

- [ ] **Step 4: Run GREEN and reviewer gate**

Run: `bun run test -- tests/instrument-settings.test.tsx tests/profile-menu.test.tsx tests/settings-capabilities.test.ts tests/design-system.test.ts && bun run typecheck && git diff --check`

Expected: PASS. Reviewer maps every enabled control to backing/verification and checks focus/dismissal at 1100 overlay geometry.

- [ ] **Step 5: Commit**

```bash
git add src/screens/SettingsScreen.tsx src/components/ProfileMenu.tsx src/components/ui/SelectMenu.tsx src/styles/settings.css src/styles/instrument.css tests/instrument-settings.test.tsx tests/profile-menu.test.tsx tests/settings-capabilities.test.ts
gitleaks protect --staged --redact
git commit -m "feat: make settings capability truthful"
```

### Task 11: Integrate permanent chat in docked and overlay rails

**Files:**
- Modify: `src/components/UtilityPanels.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/instrument.css`
- Test: `tests/instrument-chat.test.tsx`
- Test: `tests/chat-state.test.ts`

**Interfaces:**
- Consumes: `AgentChatController`, rail portal/mode, theme tokens.
- Produces: permanent chat content shared verbatim by docked and overlay modes.

- [ ] **Step 1: Write failing chat rail behaviors**

```tsx
expect(renderChat("connected-empty")).toHaveAccessibleName("Agent chat");
await openRailAt(1100);
expect(screen.getByRole("dialog", { name: "Agent chat" })).toContainElement(screen.getByRole("textbox"));
await user.keyboard("{Escape}");
expect(rightRailButton).toHaveFocus();
```

Cover messages/tools, permission mode, send/loading/stop, error, disconnected/provider setup, rail selection retention, deduped live messages, and no focus move on background updates.

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-chat.test.tsx tests/chat-state.test.ts`

Expected: FAIL because chat is not rendered through the shared docked/overlay rail contract.

- [ ] **Step 3: Implement one chat instance contract**

```tsx
<InstrumentRightRailPortal owner="chat" label="Agent chat"><AgentChatPanel controller={agentChatController} /></InstrumentRightRailPortal>
```

Keep controller behavior and truthful states. Render a single semantic chat tree into the active rail host; dark `#141414` widget and white composer in both themes. Overlay focus starts at the heading/first actionable control, background is inert, and close restores the top-row button.

- [ ] **Step 4: Run GREEN and reviewer gate**

Run: `bun run test -- tests/instrument-chat.test.tsx tests/chat-state.test.ts && bun run typecheck && git diff --check`

Expected: PASS. Reviewer validates docked/overlay parity, permissions, live regions, disconnected truth, and 1100 accessibility.

- [ ] **Step 5: Commit**

```bash
git add src/components/UtilityPanels.tsx src/App.tsx src/styles/instrument.css tests/instrument-chat.test.tsx tests/chat-state.test.ts
gitleaks protect --staged --redact
git commit -m "feat: integrate instrument chat rail"
```

### Task 12: Apply resolved theme to existing and new terminals and WaveSurfer

**Files:**
- Modify: `src/components/terminal/TerminalPane.tsx`
- Modify: `src/components/terminal/TerminalWorkspace.tsx`
- Modify: `src/components/media/AudioWaveform.tsx`
- Modify: `src/terminal/controller.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles/terminal.css`
- Test: `tests/terminal-theme.test.ts`
- Test: `tests/terminal-layout.test.ts`
- Test: `tests/audio-waveform-theme.test.tsx`

**Interfaces:**
- Consumes: `ResolvedTheme`, xterm `ITheme`, WaveSurfer color setters, existing terminal controller.
- Produces: `terminalTheme(theme: ResolvedTheme): ITheme` and `TerminalController.setTheme(theme)`.

- [ ] **Step 1: Write failing live-consumer tests**

```ts
expect(terminalTheme("light").background).toBe("#F1F2F6");
expect(terminalTheme("dark").background).toBe("#141414");
expect(controller.options.theme).toEqual(terminalTheme("light"));
controller.setTheme("dark");
expect(existingTerminal.options.theme).toEqual(terminalTheme("dark"));
expect(newTerminal.options.theme).toEqual(terminalTheme("dark"));
```

Assert WaveSurfer updates cursor/wave/progress colors without recreating playback and no source contains `#514a7a`.

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/terminal-theme.test.ts tests/terminal-layout.test.ts tests/audio-waveform-theme.test.tsx`

Expected: FAIL because `src/terminal/controller.ts` owns a legacy fixed purple theme and consumers do not update live.

- [ ] **Step 3: Implement explicit palette propagation**

```ts
export function terminalTheme(theme: ResolvedTheme): ITheme {
  return theme === "dark"
    ? { background: "#141414", foreground: "#F2F2F0", cursor: "#F2F2F0" }
    : { background: "#F1F2F6", foreground: "#141414", cursor: "#141414" };
}
```

Remove `TERMINAL_THEME`; inject the resolved theme at construction, update every open terminal on changes, and retain it for new tabs. Pass resolved waveform colors without restart. Keep `⌘J`, lazy terminal creation, PTY behavior, and bottom-panel sizing unchanged.

- [ ] **Step 4: Run GREEN and final foundation review**

Run: `bun run test -- tests/terminal-theme.test.ts tests/terminal-layout.test.ts tests/audio-waveform-theme.test.tsx tests/instrument-shell.test.tsx tests/instrument-scenarios.test.ts && bun run typecheck && bun run build && bun run audit:instrument:shell && git diff --check`

Expected: PASS and shell audit prints three cases. Reviewer inspects forced light/dark/system consumer changes, reduced motion, chat/terminal, and confirms no Core/DB/product-fixture leakage.

- [ ] **Step 5: Commit**

```bash
git add src/components/terminal/TerminalPane.tsx src/components/terminal/TerminalWorkspace.tsx src/components/media/AudioWaveform.tsx src/terminal/controller.ts src/App.tsx src/styles/terminal.css tests/terminal-theme.test.ts tests/terminal-layout.test.ts tests/audio-waveform-theme.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: synchronize terminal and waveform themes"
```

## Foundation Completion Gate

Run: `bun run test && bun run typecheck && bun run build && VITE_RALPHY_ENABLE_MOCKS=true bun run audit:instrument:shell && git diff --check && git log --oneline "$NOTHING_FOUNDATION_BASE..HEAD"`

Expected: all checks pass or only an exact baseline recorded before Task 1 remains; 12 scoped commits exist; stable reference, scenario, rail, scroll, palette, profile, Island, Settings, chat, and terminal interfaces are ready for Plan 2.
