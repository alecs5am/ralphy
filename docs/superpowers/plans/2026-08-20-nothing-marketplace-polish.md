# Nothing Marketplace and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Marketplace, eliminate reachable legacy presentation, and produce isolated per-scenario Electron, accessibility, Media pixel-diff, Core provenance, and database immutability evidence for final launch.

**Architecture:** Existing Marketplace navigation/controller/source adapters remain authoritative. Verification is implemented as Bun scripts outside the renderer: a source/root-marker audit, versioned evidence manifest, CDP scenario runner, accessibility journeys, ffmpeg Media diff, fixed Core pin, and per-launch DB/WAL wrapper.

**Tech Stack:** Electron 43.2.0, React 19, TypeScript 5.9.3, Bun 1.3, Vitest 0.34.6, Chrome DevTools Protocol, macOS `ditto`/`shasum`/`stat`/`plutil`/`codesign`, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-08-20-nothing-os-redesign-design.md`

**Visual evidence:** `.superpowers/sdd/nothing-instrument/reference/design_handoff_instrument/` prepared by Plan 1.

## Global Constraints

- Begin only after Plans 1 and 2 pass; record their HEAD. Import all locked Instrument/scenario/rail/scroll/profile/theme/Media presentation interfaces verbatim.
- Do not add/reconcile Core methods, consumer sessions, `media.review`, IPC, database/schema access, renderer network/filesystem access, remote runtime/assets/fonts, or packages.
- Marketplace counts/actions are truthful: Models and schema-1 Templates/Recipes are real; unsupported Prompts/Components/Skills/Saved/Added/Downloads/Updates/Attention/Forks stay explicit and disabled.
- Scenario fixture and mock review/Island code loads only under `import.meta.env.VITE_RALPHY_ENABLE_MOCKS === "true"` and exact UX Testing Lab; production chunks contain neither fixture IDs nor mock module paths.
- Source audit covers reachable TS/TSX/CSS and authored SVG, exact production screen/overlay roots, every approved primitive adapter and import owner, selector-aware effects, complete named palette, baseline-hashed brand assets, and production dist. Color literals are legal only in `palette.ts` and the verified definition block of `tokens.css`; xterm/WaveSurfer consume the palette.
- Every canonical scenario expands to the exact forced light/dark × 1440/1280/1100 case set unless a typed approved exception names each omitted pair; shell panel permutations remain a separate exact matrix.
- Every Electron process uses an explicit temporary `--user-data-dir`; every launch is individually wrapped by the Plan 1 DB/WAL fingerprint utility, with SHM recorded separately.
- Packaging input is exactly `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy Media.app/Contents/Resources/bin/ralphy`, version `0.3.0`, fixed SHA-256 `a843e2805b4b0a49d02f7afe46cdd5693d81184c14d560af836be93283d85679`. Reject mismatch before output replacement.
- Build and independently verify the deterministic mock package before every audit task that consumes it; an intervening bundle-affecting commit invalidates the prior package.
- Evidence records use the locked typed schema below: case journeys remain nested by scenario-case, the one `system-theme` execution lives in the manifest-level global suite, and required Media pixel evidence becomes mandatory only at `media-complete`. Tasks 11–14 mutate the bundle only through revision-checked `updateEvidenceBundle`, which atomically commits each record/ledger/artifact update or phase transition.
- Evidence is written only under ignored `.superpowers/sdd/nothing-instrument/runs/<run-id>/`; mock/production names never collide and the final command prints the absolute HTML report.
- Every task follows behavior-first RED/GREEN, independent review, `git diff --check`, exact staging, staged gitleaks, and a commit.

---

Before Task 1, record `NOTHING_POLISH_BASE=$(git rev-parse HEAD)` in executor notes.

## Consumed Interfaces

```ts
export type Availability<T> =
  | { status: "ready"; value: T }
  | { status: "partial"; value: T; reason: string }
  | { status: "empty"; reason: string }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };
export function InstrumentRightRailPortal(props: { owner: InstrumentRightRailOwner; label: string; children: React.ReactNode }): React.ReactPortal | null;
export type InstrumentOverlayId = keyof typeof INSTRUMENT_OVERLAYS;
export type InstrumentSharedSelectOwnerId = keyof typeof SHARED_SELECT_OVERLAY_OWNERS;
export function InstrumentOverlay<Id extends InstrumentOverlayId>(props: { id: Id; open: boolean; label: string; description: string; opener: HTMLElement | null; onOpenChange(open: boolean): void; children: React.ReactNode; localScroll?: boolean; host?: "managed-portal" | "primitive-host"; overlayOwner?: InstrumentSharedSelectOwnerId }): React.ReactPortal | React.ReactElement | null;
export const PRODUCTION_SCREEN_STATES: readonly InstrumentScreenStateDescriptor[];
export const INSTRUMENT_SCENARIOS: readonly InstrumentScenario[];
export function assertInstrumentScenarioCompleteness(): void;
```

## Evidence Interfaces

```ts
// scripts/instrument-evidence.d.ts (runtime validation lives in instrument-evidence.mjs)
export type InstrumentCaseAccessibilityJourneyKind = "keyboard" | "reduced-motion" | "live-region";
export const GLOBAL_ACCESSIBILITY_JOURNEY_IDS: readonly ["system-theme"];
export interface InstrumentAccessibilityJourneyEvidence {
  id: string;
  kind: InstrumentCaseAccessibilityJourneyKind;
  steps: readonly string[];
  focusOrder: readonly string[];
  liveRegionEvents: readonly string[];
  reducedMotion: boolean;
  artifacts: { trace: string; screenshot: string | null; logs: readonly string[] };
  launch: { label: string; ledgerId: string; exitCode: number | null; signal: string | null };
  dbRecord: string;
}
export interface InstrumentGlobalAccessibilityJourneyEvidence {
  id: "system-theme";
  kind: "system-theme";
  steps: readonly ["launch-system-dark", "switch-os-light", "assert-root-consumers"];
  focusOrder: readonly string[];
  liveRegionEvents: readonly string[];
  reducedMotion: false;
  artifacts: { trace: string; screenshot: string | null; logs: readonly string[] };
  launch: { label: "journey-global-system-theme"; ledgerId: string; exitCode: number | null; signal: string | null };
  dbRecord: string;
}
export interface InstrumentPixelDiffEvidence {
  version: 1;
  rendererCrop: { x: number; y: number; width: number; height: number };
  mediaContentMask: readonly { id: string; x: number; y: number; width: number; height: number }[];
  a11yDeviationMask: { version: "readable-text-v1"; regions: readonly { selector: string; x: number; y: number; width: number; height: number; fromToken: string; toToken: string }[]; pixelCount: number };
  metrics: { outsideUnionOver16: number; mediaContentPixels: number; mediaContentOver24: number; mediaContentOver24Ratio: number; maxGeometryDeltaCssPx: number };
  thresholds: { outsideUnionOver16: 0; mediaContentOver24Ratio: 0.005; maxGeometryDeltaCssPx: 1 };
}
export interface InstrumentEvidenceRecord {
  scenarioId: string;
  mode: "mock" | "production";
  theme: "system" | "dark" | "light";
  viewport: "1440x900" | "1280x800" | "1100x720";
  panels: { left: boolean; right: "docked" | "overlay" | "closed"; bottom: boolean };
  nativeBounds: { x: number; y: number; width: number; height: number };
  contentBounds: { width: number; height: number; deviceScaleFactor: number; topInset: number };
  landmarks: Record<string, { x: number; y: number; width: number; height: number }>;
  measurements: Record<string, { value: number; unit: "css-px" | "device-px" | "ratio" | "ms"; expected: number | null; tolerance: number | null }>;
  checks: Record<string, "pass" | "fail">;
  artifacts: { screenshot: string; reference: string | null; diff: string | null; accessibility: string | null; logs: readonly string[] };
  accessibilityJourneys: readonly InstrumentAccessibilityJourneyEvidence[];
  pixelDiff: InstrumentPixelDiffEvidence | null;
  launch: { label: string; ledgerId: string; exitCode: number | null; signal: string | null };
  dbRecord: string;
  failures: string[];
  reviewer: { product: string | null; accessibility: string | null; security: string | null; regression: string | null };
}
export interface InstrumentLaunchLedgerEntry {
  id: string;
  label: string;
  kind: "electron" | "reference-browser";
  scenarioEvidenceKey: string | null;
  journeyId: string | null;
  dbRecord: string;
  database: { main: "verified-unchanged"; wal: "verified-unchanged"; shm: "recorded-separately" };
  child: { exitCode: number | null; signal: string | null };
}
export interface InstrumentEvidenceManifest {
  schemaVersion: 2;
  revision: number;
  phase: "scenario" | "accessibility-complete" | "media-complete" | "final";
  runId: string;
  appCommit: string;
  appBundleSha256: string;
  coreVersion: "0.3.0";
  coreSha256: "a843e2805b4b0a49d02f7afe46cdd5693d81184c14d560af836be93283d85679";
  referenceArchiveSha256: "fe371e93e3d778bbd9d7e5621d200ff4298e386edbbc20d3e971941c004c0804";
  startedAt: string;
  requirements: {
    caseJourneys: Readonly<Record<string, readonly InstrumentCaseAccessibilityJourneyKind[]>>;
    globalAccessibilityJourneyIds: readonly ["system-theme"];
    mediaPixelEvidenceKeys: readonly ["mock__media.ready__light__1440x900", "mock__media.ready__dark__1440x900"];
  };
  launches: InstrumentLaunchLedgerEntry[];
  records: InstrumentEvidenceRecord[];
  globalAccessibilityJourneys: InstrumentGlobalAccessibilityJourneyEvidence[];
}
export type InstrumentEvidenceUpdate =
  | { type: "append-scenario-record"; record: InstrumentEvidenceRecord; ledgerEntries: readonly InstrumentLaunchLedgerEntry[] }
  | { type: "append-case-journey"; evidenceKey: string; journey: InstrumentAccessibilityJourneyEvidence; ledgerEntries: readonly [InstrumentLaunchLedgerEntry] }
  | { type: "set-global-accessibility-journey"; journey: InstrumentGlobalAccessibilityJourneyEvidence; ledgerEntries: readonly [InstrumentLaunchLedgerEntry] }
  | { type: "attach-media-pixel-evidence"; evidenceKey: "mock__media.ready__light__1440x900" | "mock__media.ready__dark__1440x900"; pixelDiff: InstrumentPixelDiffEvidence; artifacts: InstrumentEvidenceRecord["artifacts"]; ledgerEntries: readonly InstrumentLaunchLedgerEntry[] }
  | { type: "append-supporting-launches"; ledgerEntries: readonly InstrumentLaunchLedgerEntry[] }
  | { type: "set-record-reviewer"; evidenceKey: string; reviewer: InstrumentEvidenceRecord["reviewer"] }
  | { type: "advance-phase"; from: "scenario" | "accessibility-complete" | "media-complete"; to: "accessibility-complete" | "media-complete" | "final" };
export function updateEvidenceBundle(manifestPath: string, expectedRevision: number, update: InstrumentEvidenceUpdate): Promise<InstrumentEvidenceManifest>;
```

## File Map

- `src/screens/marketplace/*` — Marketplace route presentation only.
- `scripts/audit-instrument-source.mjs` — production reachability/root/selector/palette/asset guard.
- `scripts/instrument-evidence.d.ts`, `instrument-evidence.mjs`, `render-instrument-report.mjs` — typed versioned manifest, runtime validation, and HTML/contact sheet.
- `scripts/audit-instrument-electron.mjs` — per-scenario Bun/CDP runner.
- `scripts/audit-instrument-accessibility.mjs` — keyboard/reduced-motion/live-region journeys.
- `scripts/audit-media-fidelity.mjs` — reference/actual/ffmpeg diff and tolerance.
- `scripts/package-mac.mjs` — fixed source path/version/SHA verification before output replacement.
- `scripts/with-db-fingerprint.mjs` — Plan 1 per-launch main/WAL enforcement and SHM record.

### Task 1: Rebuild Discover, search/results, categories, collection, and source states

**Files:**
- Modify: `src/screens/marketplace/MarketplaceHeader.tsx`
- Modify: `src/screens/marketplace/MarketplaceBrowse.tsx`
- Modify: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/state/marketplace-controller.ts`
- Modify: `src/styles/marketplace.css`
- Modify: `src/instrument/test-fixtures.ts`
- Modify: `src/instrument/production-screen-states.ts`
- Modify: `src/instrument/scenarios.ts`
- Test: `tests/marketplace-screen.test.tsx`
- Test: `tests/marketplace-controller.test.ts`
- Test: `tests/marketplace-navigation.test.tsx`

**Interfaces:** Consumes existing Marketplace route/query/controller/source health and shared `SelectMenu`. Produces rendered browse scenarios for discover/results/category/collection and loading/ready/empty/partial/error plus `shared-select-menu` owner `marketplace.header` coverage on every route that renders `MarketplaceHeader`.

- [ ] **Step 1: Write route/query/paging behavior tests**

```tsx
await user.type(screen.getByRole("searchbox"), "video");
expect(controller.setQueryText).toHaveBeenLastCalledWith("video");
await user.click(screen.getByRole("button", { name: "Search" }));
expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ route: { kind: "results" } }));
await user.click(screen.getByRole("button", { name: "Load more" }));
expect(controller.loadMore).toHaveBeenCalledTimes(1);
expect(renderInstrumentScenario("marketplace.results.partial").getByRole("status")).toHaveAccessibleDescription();
await user.click(screen.getByRole("combobox", { name: "Category" }));
expect(screen.getByRole("listbox")).toHaveAttribute("data-instrument-overlay-owner", "marketplace.header");
await user.keyboard("{Escape}");
expect(screen.getByRole("combobox", { name: "Category" })).toHaveFocus();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/marketplace-screen.test.tsx tests/marketplace-controller.test.ts tests/marketplace-navigation.test.tsx -t 'discover|results|category|collection|source'`

Expected: FAIL on Instrument root/state semantics, route callback, or scroll/focus restoration, even where legacy copy exists.

- [ ] **Step 3: Implement browse composition**

```tsx
<main data-instrument-root="marketplace-browse"><MarketplaceHeader query={query} /><MarketplaceBrowse state={snapshot} /></main>
```

Preserve reducer history/query/filters/paging/source adapters. Retain `overlayOwner="marketplace.header"` on every MarketplaceHeader `SelectMenu` (type/category/source/license/compatibility/modality/format/sort), and keep the Plan 1 open/select/Escape/focus-return scenarios complete for every exact production route where that header renders. Render truthful partial/source-health reasons, one desk scroller, adaptive widgets, and no fake count.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/marketplace-screen.test.tsx tests/marketplace-controller.test.ts tests/marketplace-navigation.test.tsx && bun run typecheck && git diff --check`

Expected: PASS; reviewer drives every browse state/route and focus/scroll round trip.

- [ ] **Step 5: Commit**

```bash
git add src/screens/marketplace/MarketplaceHeader.tsx src/screens/marketplace/MarketplaceBrowse.tsx src/screens/MarketplaceScreen.tsx src/state/marketplace-controller.ts src/styles/marketplace.css src/instrument/test-fixtures.ts src/instrument/production-screen-states.ts src/instrument/scenarios.ts tests/marketplace-screen.test.tsx tests/marketplace-controller.test.ts tests/marketplace-navigation.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild marketplace browse"
```

### Task 2: Rebuild Models, compatibility, and Ollama inventory

**Files:**
- Modify: `src/screens/marketplace/MarketplaceModelViews.tsx`
- Modify: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/styles/marketplace.css`
- Modify: `src/instrument/test-fixtures.ts`
- Modify: `src/instrument/production-screen-states.ts`
- Modify: `src/instrument/scenarios.ts`
- Test: `tests/marketplace-models.test.tsx`
- Test: `tests/marketplace-controller.test.ts`

**Interfaces:** Consumes real model provider results, local Ollama inventory, compatibility/availability. Produces models list/detail/installed/empty/partial/error scenarios.

- [ ] **Step 1: Write inventory/filter/detail behaviors**

```tsx
await user.click(screen.getByRole("button", { name: "Compatible" }));
expect(controller.setCompatibility).toHaveBeenCalledWith("compatible");
await user.click(screen.getByRole("button", { name: /Open model/ }));
expect(screen.getByRole("dialog", { name: "Model detail" })).toBeVisible();
expect(renderInstrumentScenario("marketplace.models.ollama-empty").getByRole("status")).toHaveTextContent(/No installed models/i);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/marketplace-models.test.tsx tests/marketplace-controller.test.ts -t 'model|Ollama|compatibility'`

Expected: FAIL on Instrument interactions/state/overlay focus.

- [ ] **Step 3: Implement real inventory views**

```tsx
<section data-instrument-root="marketplace-models"><ModelFilters /><ModelInventory availability={models} /></section>
```

Show only real provider/source/license/format/compatibility facts; installed means current Ollama inventory only. Use controlled detail overlay, focus return, and exact unavailable reasons.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/marketplace-models.test.tsx tests/marketplace-controller.test.ts && bun run typecheck && git diff --check`

Expected: PASS; reviewer checks all inventories, compatibility truth, detail focus, and no install no-op.

- [ ] **Step 5: Commit**

```bash
git add src/screens/marketplace/MarketplaceModelViews.tsx src/screens/MarketplaceScreen.tsx src/styles/marketplace.css src/instrument/test-fixtures.ts src/instrument/production-screen-states.ts src/instrument/scenarios.ts tests/marketplace-models.test.tsx tests/marketplace-controller.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild marketplace models"
```

### Task 3: Rebuild Template and Recipe details with controlled media

**Files:**
- Modify: `src/screens/marketplace/MarketplacePublicItemDetail.tsx`
- Modify: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/styles/marketplace.css`
- Modify: `src/instrument/test-fixtures.ts`
- Modify: `src/instrument/production-screen-states.ts`
- Modify: `src/instrument/scenarios.ts`
- Test: `tests/marketplace-public-details.test.tsx`
- Test: `tests/marketplace-media.test.tsx`

**Interfaces:** Consumes validated schema-1 DTOs, controlled CDN media, sanitized prose, bounded recipe clipboard. Produces owner-registered Template/Recipe detail/missing/failure/inert states and `marketplace-detail` through `InstrumentOverlay`.

- [ ] **Step 1: Write media/clipboard/back-focus tests**

```tsx
await openPublicItem(realRecipe.id);
expect(screen.getByRole("heading", { name: realRecipe.title })).toBeVisible();
await user.click(screen.getByRole("button", { name: "Copy recipe" }));
expect(clipboardWrite).toHaveBeenCalledWith(expectedBoundedText);
failControlledImage(); expect(screen.getByRole("status", { name: "Media unavailable" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "Back" })); expect(sourceCard).toHaveFocus();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/marketplace-public-details.test.tsx tests/marketplace-media.test.tsx`

Expected: FAIL on Instrument detail overlay/media failures/focus behavior.

- [ ] **Step 3: Implement controlled details**

```tsx
<InstrumentOverlay id="marketplace-detail" open={open} label={item.title} description="Marketplace item detail" opener={sourceCard} onOpenChange={onOpenChange}><SafePublicMedia media={item.media} /><SanitizedDetail body={item.description} /></InstrumentOverlay>
```

Preserve Template/Recipe identity including prompt-shaped Recipe, URL/origin/media controls, no remote HTML/style/script, bounded clipboard, failure fallbacks, and late-status suppression.

- [ ] **Step 4: Run GREEN and security review**

Run: `bun run test -- tests/marketplace-public-details.test.tsx tests/marketplace-media.test.tsx tests/protocol-access.test.ts && bun run typecheck && git diff --check`

Expected: PASS; reviewer checks media lifecycle, sanitized content, clipboard bounds, and focus.

- [ ] **Step 5: Commit**

```bash
git add src/screens/marketplace/MarketplacePublicItemDetail.tsx src/screens/MarketplaceScreen.tsx src/styles/marketplace.css src/instrument/test-fixtures.ts src/instrument/production-screen-states.ts src/instrument/scenarios.ts tests/marketplace-public-details.test.tsx tests/marketplace-media.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild marketplace public details"
```

### Task 4: Complete unavailable categories and My Library capability states

**Files:**
- Modify: `src/screens/marketplace/MarketplaceUnavailableViews.tsx`
- Modify: `src/screens/marketplace/MarketplaceMyLibrary.tsx`
- Modify: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/styles/marketplace.css`
- Modify: `src/instrument/test-fixtures.ts`
- Modify: `src/instrument/production-screen-states.ts`
- Modify: `src/instrument/scenarios.ts`
- Test: `tests/marketplace-library.test.tsx`
- Test: `tests/marketplace-navigation.test.tsx`

**Interfaces:** Consumes unsupported category/detail shells, real installed models, existing library route persistence. Produces explicit unavailable capabilities.

- [ ] **Step 1: Write unavailable action/count tests**

```tsx
for (const category of ["prompts", "components", "skills"]) {
  const view = renderUnavailableDetail(category);
  expect(view.getByRole("status")).toHaveAccessibleDescription();
  expect(view.queryByRole("button", { name: /Install|Add|Fork/ })).toBeNull();
}
for (const section of ["saved", "added", "downloads", "updates", "attention"]) {
  expect(renderLibrarySection(section).getByRole("status")).toHaveTextContent(/unavailable/i);
}
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/marketplace-library.test.tsx tests/marketplace-navigation.test.tsx`

Expected: FAIL on complete Instrument unavailable sections and action truth.

- [ ] **Step 3: Implement capability surfaces**

```tsx
<InstrumentEmptyState title={label} reason={MARKETPLACE_UNAVAILABLE_REASONS[capability]} />
```

Installed uses only Ollama. Saved/Added/Downloads/Updates/Attention/Forks and Prompt/Component/Skill use exact missing persistence/job/update/fork reasons, no zero/sample row, and disabled structural explanation only.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/marketplace-library.test.tsx tests/marketplace-navigation.test.tsx && bun run typecheck && git diff --check`

Expected: PASS; reviewer confirms every unsupported route is reachable, honest, focusable, and has no enabled no-op.

- [ ] **Step 5: Commit**

```bash
git add src/screens/marketplace/MarketplaceUnavailableViews.tsx src/screens/marketplace/MarketplaceMyLibrary.tsx src/screens/MarketplaceScreen.tsx src/styles/marketplace.css src/instrument/test-fixtures.ts src/instrument/production-screen-states.ts src/instrument/scenarios.ts tests/marketplace-library.test.tsx tests/marketplace-navigation.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: complete marketplace capability states"
```

### Task 5: Rebuild target chooser and non-mutating review workflows

**Files:**
- Modify: `src/screens/marketplace/MarketplaceWorkflows.tsx`
- Modify: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/styles/marketplace.css`
- Modify: `src/instrument/test-fixtures.ts`
- Modify: `src/instrument/production-screen-states.ts`
- Modify: `src/instrument/scenarios.ts`
- Test: `tests/marketplace-workflows.test.tsx`

**Interfaces:** Consumes current catalog target chooser and non-mutating review state. Produces exact target IDs and `target-chooser` through `InstrumentOverlay`.

- [ ] **Step 1: Write target/focus/no-mutation tests**

```tsx
await openTargetChooser();
await user.click(screen.getByRole("button", { name: `Project · ${project.name}` }));
expect(onChoose).toHaveBeenCalledWith(`project:${project.workspaceId}:${project.projectId}`);
await openReviewWorkflow();
expect(screen.getByText(/Review only/)).toBeVisible();
expect(recordedBridgeCalls()).toEqual([]);
await user.keyboard("{Escape}"); expect(opener).toHaveFocus();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/marketplace-workflows.test.tsx`

Expected: FAIL on Instrument overlay/focus and exact target semantics.

- [ ] **Step 3: Implement non-mutating workflows**

```ts
const targets = [
  ...catalog.workspaces.map((workspace) => ({ id: `workspace:${workspace.id}`, label: `Workspace · ${workspace.name}` })),
  ...catalog.projects.map((project) => ({ id: `project:${project.workspaceId}:${project.projectId}`, label: `Project · ${project.name}` })),
];
```

Render the chooser with `InstrumentOverlay id="target-chooser"`. Use real catalog entries, explicit review-only copy, focus trap/return, busy/error semantics, and no mutation/IPC.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/marketplace-workflows.test.tsx tests/marketplace-public-details.test.tsx && bun run typecheck && git diff --check`

Expected: PASS; reviewer confirms exact IDs and zero mutation path.

- [ ] **Step 5: Commit**

```bash
git add src/screens/marketplace/MarketplaceWorkflows.tsx src/screens/MarketplaceScreen.tsx src/styles/marketplace.css src/instrument/test-fixtures.ts src/instrument/production-screen-states.ts src/instrument/scenarios.ts tests/marketplace-workflows.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild marketplace workflows"
```

### Task 6: Close the rendered Marketplace scenario matrix

**Files:**
- Modify: `src/instrument/test-fixtures.ts`
- Modify: `src/instrument/production-screen-states.ts`
- Modify: `src/instrument/scenarios.ts`
- Test: `tests/marketplace-scenario-completeness.test.tsx`
- Test: `tests/instrument-accessibility-journeys.test.tsx`

**Interfaces:** Consumes all Marketplace owner state descriptors plus production overlay keys. Produces bidirectionally complete rendered Marketplace scenarios.

- [ ] **Step 1: Write exhaustive rendered checks**

```ts
for (const scenario of marketplaceScenarios()) {
  const view = renderInstrumentScenario(scenario.id);
  expect(view.container.querySelector(`[data-instrument-root="${scenario.rootMarker}"]`)).not.toBeNull();
  expectVisibleLandmarks(view, scenario.landmarks);
  expectFocusContract(view, scenario);
}
expect(missingMarketplaceRouteStatePairs()).toEqual([]);
expect(extraMarketplaceRouteStatePairs()).toEqual([]);
expect(marketplaceScenarioOverlayIds()).toEqual(productionMarketplaceOverlayIds());
expect(marketplaceScenarioSharedOverlayOwnerRoutePairs()).toEqual(productionMarketplaceSharedOverlayOwnerRoutePairs());
expect(marketplaceScenarioGlobalOverlayRoutePairs()).toEqual(productionMarketplaceGlobalOverlayRoutePairs());
expect(reachableMarketplaceSelectMenuImports()).toEqual([["src/screens/marketplace/MarketplaceHeader.tsx", "marketplace.header"]]);
expect(unregisteredRawMarketplaceOverlays()).toEqual([]);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/marketplace-scenario-completeness.test.tsx tests/instrument-accessibility-journeys.test.tsx -t Marketplace`

Expected: FAIL with exact missing scenario/overlay/journey IDs.

- [ ] **Step 3: Complete fixtures without weakening expectations**

```ts
export const MARKETPLACE_SCENARIO_IDS = INSTRUMENT_SCENARIOS.filter(({ routeKey }) => routeKey.startsWith("marketplace."));
```

Fill deterministic payloads/landmarks for every required state and overlay, including each `(routeKey, "shared-select-menu", "marketplace.header")` open/select/Escape/focus-return tuple and one desk/overlay scroll owner. Import the key-derived owner type; do not create a Marketplace-only owner union.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/marketplace-scenario-completeness.test.tsx tests/instrument-accessibility-journeys.test.tsx tests/instrument-scenarios.test.ts && bun run typecheck && git diff --check`

Expected: PASS; reviewer signs every Marketplace scenario before legacy deletion.

- [ ] **Step 5: Commit**

```bash
git add src/instrument/production-screen-states.ts src/instrument/scenarios.ts src/instrument/test-fixtures.ts tests/marketplace-scenario-completeness.test.tsx tests/instrument-accessibility-journeys.test.tsx
gitleaks protect --staged --redact
git commit -m "test: close marketplace scenario coverage"
```

### Task 7: Remove reachable legacy presentation and enforce source/root/palette guards

**Files:**
- Create: `scripts/audit-instrument-source.mjs`
- Delete: `src/components/ContextSidebar.tsx`
- Delete: `src/components/Titlebar.tsx`
- Delete: `src/components/ProjectControls.tsx`
- Delete: `src/components/ProjectHeader.tsx`
- Delete: `src/styles/app.css`
- Delete: `src/styles/workbench.css`
- Delete: `src/styles/workspace-overview.css`
- Modify: `src/main.tsx`
- Modify: `package.json`
- Test: `tests/instrument-design-guards.test.ts`
- Test: `tests/design-system.test.ts`

**Interfaces:** Produces `auditInstrumentSource({ root, mocks }): { files: string[]; violations: AuditViolation[] }`, `reachableOverlayPrimitiveSites(files)`, `reachableOverlayImportOwners(files)`, `unregisteredRawOverlaySites(files)`, `cssTokenDefinitions(path)`, `flattenPalette(palette)`, `colorLiteralSites()`, and `bun run audit:instrument:source`.

- [ ] **Step 1: Write failing reachable-source/root/selector tests**

```ts
expect(auditInstrumentSource({ root, mocks: false }).violations).toEqual([]);
expect(missingInstrumentRootMarkers(INSTRUMENT_SCENARIOS)).toEqual([]);
expect(unregisteredRawOverlaySites(reachableProductionFiles)).toEqual([]);
expect(reachableOverlayPrimitiveSites(reachableProductionFiles)).toEqual([
  ["src/components/UtilityPanels.tsx", "agent-chat-model-menu", "inline"],
  ["src/components/UtilityPanels.tsx", "agent-chat-mode-menu", "inline"],
  ["src/components/UtilityPanels.tsx", "agent-chat-provider-menu", "inline"],
  ["src/components/UtilityPanels.tsx", "agent-chat-recent-menu", "inline"],
  ["src/components/WorkspacePicker.tsx", "workspace-picker", "createPortal"],
  ["src/components/ui/SelectMenu.tsx", "shared-select-menu", "Select.Portal"],
]);
expect(reachableOverlayImportOwners(reachableProductionFiles)).toEqual([
  ["src/instrument/InstrumentSidebar.tsx", "WorkspacePicker", "workspace-picker"],
  ["src/screens/MemoryScreen.tsx", "SelectMenu", "memory.editor"],
  ["src/screens/SettingsScreen.tsx", "SelectMenu", "settings.appearance"],
  ["src/screens/marketplace/MarketplaceHeader.tsx", "SelectMenu", "marketplace.header"],
  ["src/screens/project/ActivityTimeline.tsx", "SelectMenu", "project.activity"],
  ["src/screens/project/MediaPanel.tsx", "SelectMenu", "project.media"],
  ["src/screens/shared-library/SharedLibraryToolbar.tsx", "SelectMenu", "shared.toolbar"],
  ["src/screens/shared-library/SharedLibraryWorkflows.tsx", "SelectMenu", "shared.workflow"],
]);
expect(productionDistText).not.toMatch(/instrument-test-fixture|mock-review|TEST REVIEW SESSION · NOT SAVED|ux-review-artifact-1|ux-review-iteration-3|mock-needs-work-fixture|ux-mock-render-1/);
expect(authoredColorsOutside(INSTRUMENT_COLOR_ALLOWLIST)).toEqual([]);
expect(cssTokenDefinitions("src/styles/tokens.css")).toEqual(flattenPalette(INSTRUMENT_PALETTE));
expect(colorLiteralSites()).toEqual(["src/instrument/palette.ts", "src/styles/tokens.css#instrument-token-definitions"]);
```

- [ ] **Step 2: Run RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=false bun run build && bun run test -- tests/instrument-design-guards.test.ts tests/design-system.test.ts`

Expected: FAIL on legacy imports/files/classes, missing audit/root checks, legacy TS terminal purple, or unallowlisted source.

- [ ] **Step 3: Implement recursive selector-aware audit and delete legacy**

Follow static and `import()` relative edges from `src/main.tsx`; evaluate mock branch false and scan all reachable `.ts/.tsx/.css` plus authored `.svg`. Require every route root to consume its production state descriptor and every dialog/drawer/viewer/menu/sheet/popover or portalled listbox to consume `InstrumentOverlay`. Enumerate JSX wrapper IDs, native/Radix portal or menu/listbox roots, imports of `SelectMenu`/`WorkspacePicker`, and their literal owner props instead of relying only on registry keys. The only raw primitive hosts are the exact six sorted sites above, and each must contain the matching `InstrumentOverlay host="primitive-host"`; `Select.Portal` is allowed only in `SelectMenu.tsx`, `createPortal` only in `WorkspacePicker.tsx`, and the four inline menu roots only in `UtilityPanels.tsx`. Compare the exact import-owner list above with `SHARED_SELECT_OVERLAY_OWNERS`, compare each production route/state/overlay/owner tuple to scenarios in both directions, and reject missing, extra, nonliteral, or duplicate owners as well as any other raw overlay. Reject legacy class prefixes/imports/assets, `box-shadow` other than none, backdrop/blur, gradients, old purple, dark-only form scheme; allow `color-scheme: dark` only on `html[data-theme="dark"]`. Parse literals in `palette.ts` and the exact `/* instrument-token-definitions:start */` block of `tokens.css`, require CSS-variable equality to the palette, and reject literals everywhere else, including terminal/WaveSurfer code. Permit brand/provider/model SVG only when path and SHA match the baseline map; dither PNGs only when Plan 1 hashes match. Scan dist against the complete mock module-path/fixture-marker set plus prototype/support/remote font/sprite paths.

```js
if (property === "color-scheme" && value === "dark" && selector !== 'html[data-theme="dark"]') violations.push({ file, selector, property, value });
```

- [ ] **Step 4: Run GREEN and review**

Run: `VITE_RALPHY_ENABLE_MOCKS=false bun run build && bun run audit:instrument:source && bun run test -- tests/instrument-design-guards.test.ts tests/design-system.test.ts && bun run typecheck && git diff --check`

Expected: prints `INSTRUMENT_SOURCE_AUDIT_OK`; reviewer confirms every deletion has no consumer, the primitive/import inventories equal the exact lists above, no raw site is forbidden by its own audit, and every route/state/overlay/owner tuple has scenario geometry/focus coverage.

- [ ] **Step 5: Commit**

```bash
git add -A -- scripts/audit-instrument-source.mjs src/components/ContextSidebar.tsx src/components/Titlebar.tsx src/components/ProjectControls.tsx src/components/ProjectHeader.tsx src/styles/app.css src/styles/workbench.css src/styles/workspace-overview.css src/main.tsx package.json tests/instrument-design-guards.test.ts tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "refactor: remove legacy desktop presentation"
```

### Task 8: Create the versioned evidence manifest and contact sheet

**Files:**
- Create: `scripts/instrument-evidence.d.ts`
- Create: `scripts/instrument-evidence.mjs`
- Create: `scripts/render-instrument-report.mjs`
- Create: `tests/fixtures/instrument-evidence-valid.json`
- Modify: `package.json`
- Test: `tests/instrument-evidence.test.ts`

**Interfaces:** Produces exact Evidence Interfaces, `createEvidenceRun(requirements)`, the sole mutation API `updateEvidenceBundle(manifestPath, expectedRevision, update)`, pure `validateManifest`, and `bun run report:instrument`.

- [ ] **Step 1: Write failing schema/path/collision tests**

```ts
expect(validateManifest(validManifest)).toBeUndefined();
expect(validManifest.schemaVersion).toBe(2);
expect(validManifest.phase).toBe("final");
expect(validManifest.requirements).toMatchObject({
  globalAccessibilityJourneyIds: ["system-theme"],
  mediaPixelEvidenceKeys: ["mock__media.ready__light__1440x900", "mock__media.ready__dark__1440x900"],
});
expect(validManifest.globalAccessibilityJourneys).toEqual([expect.objectContaining({ id: "system-theme", kind: "system-theme", launch: expect.objectContaining({ label: "journey-global-system-theme" }) })]);
expect(validManifest.launches[0]).toMatchObject({ journeyId: null, dbRecord: expect.stringMatching(/^db\//), database: { main: "verified-unchanged", wal: "verified-unchanged", shm: "recorded-separately" } });
expect(validManifest.records[0]).toMatchObject({ measurements: expect.any(Object), artifacts: expect.any(Object), accessibilityJourneys: expect.any(Array), launch: expect.any(Object), dbRecord: expect.any(String), reviewer: { regression: expect.any(String) } });
const threeJourneyRecord = manifestRecordFor("mock__media.ready__dark__1440x900", ["keyboard", "reduced-motion", "live-region"]);
expect(threeJourneyRecord.accessibilityJourneys.map(({ kind }) => kind)).toEqual(["keyboard", "reduced-motion", "live-region"]);
expect(threeJourneyRecord.accessibilityJourneys.map(({ launch }) => launch.ledgerId)).toHaveLength(3);
expect(new Set(threeJourneyRecord.accessibilityJourneys.map(({ dbRecord }) => dbRecord)).size).toBe(3);
expect(() => validateManifest(recordMissingDeclaredJourney)).toThrow(/missing.*journey/i);
expect(() => validateManifest(recordWithDuplicateJourneyId)).toThrow(/duplicate.*journey/i);
expect(() => validateManifest(recordWithJourneyLedgerMismatch)).toThrow(/journey.*launch ledger/i);
expect(() => validateManifest(scenarioPhaseWithPendingJourneysAndMedia)).not.toThrow();
expect(() => validateManifest(accessibilityCompleteWithExactCaseAndGlobalJourneysButPendingMedia)).not.toThrow();
expect(() => validateManifest(accessibilityCompleteWithoutSystemTheme)).toThrow(/global.*system-theme/i);
expect(() => validateManifest(accessibilityCompleteWithSystemThemeNestedInCase)).toThrow(/extra.*case journey/i);
expect(() => validateManifest(mediaCompleteWithoutOneRequiredPixelDiff)).toThrow(/pixelDiff.*mock__media.ready__dark__1440x900/i);
expect(() => validateManifest(nonRequiredCaseWithPixelDiff)).toThrow(/unexpected.*pixelDiff/i);
expect(() => validateManifest(skippedMediaPhase)).toThrow(/phase.*accessibility-complete.*media-complete.*final/i);
await expect(updateEvidenceBundle(path, staleRevision, validUpdate)).rejects.toThrow(/revision/i);
const bytesBeforeInvalidUpdate = await Bun.file(path).arrayBuffer();
await expect(updateEvidenceBundle(path, currentRevision, invalidJourneyLedgerUpdate)).rejects.toThrow(/launch ledger/i);
expect(await Bun.file(path).arrayBuffer()).toEqual(bytesBeforeInvalidUpdate);
const committed = await updateEvidenceBundle(path, currentRevision, validJourneyUpdate);
expect(committed.revision).toBe(currentRevision + 1);
expect(validateManifest(committed)).toBeUndefined();
const concurrent = await Promise.allSettled([
  updateEvidenceBundle(path, committed.revision, firstConcurrentUpdate),
  updateEvidenceBundle(path, committed.revision, secondConcurrentUpdate),
]);
expect(concurrent.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
expect(validateManifest(await Bun.file(path).json())).toBeUndefined();
expect(() => validateManifest(duplicateModeScenarioViewport)).toThrow(/duplicate evidence key/i);
expect(() => validateManifest(recordWithMissingArtifact)).toThrow(/artifact/i);
expect(() => validateManifest(recordWithUnknownLaunch)).toThrow(/launch ledger/i);
expect(evidenceFileName("mock", "media.ready", "dark", "1440x900")).toBe("mock__media.ready__dark__1440x900.png");
expect(renderReport(validManifest)).toMatch(/system-theme.*global accessibility.*measurements.*pixel diff.*accessibility journeys.*keyboard.*reduced-motion.*live-region.*DB\/WAL\/SHM.*regression/is);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-evidence.test.ts`

Expected: FAIL because manifest/report modules do not exist.

- [ ] **Step 3: Implement durable bundle schema/report**

```js
export const evidenceKey = ({ mode, scenarioId, theme, viewport }) => [mode, scenarioId, theme, viewport].join("__");
```

Create `.superpowers/sdd/nothing-instrument/runs/<UTC>-<commit>/` with `manifest.json`, `report.html`, `screenshots/`, `references/`, `diffs/`, `accessibility/`, `db/`, and `logs/`. `createEvidenceRun` stores revision `0`, phase `scenario`, the independently expanded case→journey requirements, exact global ID tuple `["system-theme"]`, and exact required Media keys `["mock__media.ready__light__1440x900", "mock__media.ready__dark__1440x900"]`.

`updateEvidenceBundle` is the only exported mutation path used by Tasks 11–14. It acquires an exclusive sibling lock with `open(lockPath, "wx")` from `node:fs/promises` under Bun, reads and fully validates the current manifest, rejects a stale `expectedRevision`, clones and applies exactly one discriminated update including its record/artifact and ledger links, increments revision, validates the resulting phase, serializes to a same-directory unique temporary file, flushes and `fsync`s it, atomically renames it over `manifest.json`, and `fsync`s the parent directory. In `finally`, it closes the handle and unlinks only that exact sibling lock. Any apply/validation/write failure removes the temp file and leaves the prior manifest bytes unchanged; a concurrent/stale writer fails rather than overwriting. No audit script edits JSON directly.

Validation is phase-aware and every stored entry is validated even while collection is incomplete. During `scenario`, records may be a duplicate-free subset of required cases; their case-journey arrays and `globalAccessibilityJourneys` may be incomplete; the two required Media keys may have `pixelDiff: null`; and all non-required records must keep `pixelDiff: null`. Advancing to `accessibility-complete` requires the exact case-key set, exact declared case journeys, and exactly one manifest-level `system-theme` entry with `scenarioEvidenceKey: null`, `journeyId: "system-theme"`, artifacts, child result, ledger ID, and DB link; Media pixel evidence may still be null or partially attached. `attach-media-pixel-evidence` is legal only in `accessibility-complete`. Advancing to `media-complete` requires non-null, valid pixel/artifact/launch/DB evidence for both exact required Media keys and rejects pixel evidence elsewhere. Advancing to `final` is legal only from `media-complete` and revalidates case/global accessibility, Media, all launch/DB/artifact links, and non-null product/accessibility/security/regression decisions. Skipped/reversed phases fail.

The HTML displays revision/phase, measurements, mask regions/pixel counts/thresholds, artifacts/logs, a row per case journey, a separate Global Accessibility section for `system-theme`, launch/exit/DB evidence, failures, and product/accessibility/security/regression decisions. Retain mock/production separately and print the absolute report path.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/instrument-evidence.test.ts && bun run report:instrument -- --fixture tests/fixtures/instrument-evidence-valid.json && git diff --check`

Expected: PASS and prints an absolute ignored HTML path. Reviewer traces the three case journeys plus global system-theme independently, confirms accessibility-complete accepts pending Media, media-complete rejects it, and verifies failed/stale writes leave the prior valid bundle unchanged.

- [ ] **Step 5: Commit**

```bash
git add scripts/instrument-evidence.d.ts scripts/instrument-evidence.mjs scripts/render-instrument-report.mjs tests/fixtures/instrument-evidence-valid.json package.json tests/instrument-evidence.test.ts
gitleaks protect --staged --redact
git commit -m "test: create instrument evidence bundle"
```

### Task 9: Pin Core 0.3.0 before packaging replaces the release app

**Files:**
- Modify: `scripts/bundled-core.mjs`
- Modify: `scripts/package-mac.mjs`
- Modify: `scripts/smoke-electron.mjs`
- Modify: `package.json`
- Test: `tests/bundled-core.test.ts`

**Interfaces:** Produces `APPROVED_CORE_SOURCE`, `APPROVED_CORE_VERSION`, `APPROVED_CORE_SHA256`, `readApprovedCoreBytes()`, `verifyPackagedCore(appPath)`, and `bun scripts/bundled-core.mjs --verify-packaged <app>`.

- [ ] **Step 1: Write failing independent-pin tests**

```ts
expect(APPROVED_CORE_SOURCE).toBe("/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy Media.app/Contents/Resources/bin/ralphy");
expect(APPROVED_CORE_VERSION).toBe("0.3.0");
expect(APPROVED_CORE_SHA256).toBe("a843e2805b4b0a49d02f7afe46cdd5693d81184c14d560af836be93283d85679");
await expect(readApprovedCoreBytes(wrongShaBinary)).rejects.toThrow(/approved Core SHA/i);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/bundled-core.test.ts`

Expected: FAIL because packaging trusts caller path/version and a self-authenticated manifest.

- [ ] **Step 3: Verify then retain bytes before output deletion**

```js
export const APPROVED_CORE_SOURCE = "/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy Media.app/Contents/Resources/bin/ralphy";
export const APPROVED_CORE_VERSION = "0.3.0";
export const APPROVED_CORE_SHA256 = "a843e2805b4b0a49d02f7afe46cdd5693d81184c14d560af836be93283d85679";
```

Before `rm(output)`, require `RALPHY_CORE_BIN === APPROVED_CORE_SOURCE`, verify version/fixed SHA, and read bytes into memory. After replacing output, write those retained bytes to packaged Core, chmod, and write manifest with the fixed values. `verifyPackagedCore` and its CLI validate packaged binary and manifest against the independent constants, not only each other; all later package-consuming gates call it immediately after building.

Run package/smoke scripts through Bun in `package.json`: `"package:mac": "bun run build && bun run pty:prepare && bun run icon:mac && bun scripts/package-mac.mjs"` and `"smoke:packaged": "RALPHY_PACKAGED_APP='release/Ralphy Media.app' bun scripts/smoke-electron.mjs"`.

- [ ] **Step 4: Run GREEN and provenance review**

Run: `test "$(/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy\ Media.app/Contents/Resources/bin/ralphy --version)" = '0.3.0' && test "$(shasum -a 256 '/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy Media.app/Contents/Resources/bin/ralphy' | awk '{print $1}')" = 'a843e2805b4b0a49d02f7afe46cdd5693d81184c14d560af836be93283d85679' && bun run test -- tests/bundled-core.test.ts && git diff --check`

Expected: PASS before any package command. Reviewer confirms mismatch fails before release output is touched.

- [ ] **Step 5: Commit**

```bash
git add scripts/bundled-core.mjs scripts/package-mac.mjs scripts/smoke-electron.mjs package.json tests/bundled-core.test.ts
gitleaks protect --staged --redact
git commit -m "build: pin approved Core 0.3.0"
```

### Task 10: Enforce main DB and WAL immutability around every launch

**Files:**
- Modify: `scripts/db-fingerprint.mjs`
- Modify: `scripts/with-db-fingerprint.mjs`
- Test: `tests/db-fingerprint.test.ts`

**Interfaces:** Consumes Plan 1 fingerprint utility and locked evidence schema. Produces `snapshotDatabaseFamily(dbPath)`, `withDatabaseFingerprint(label, launch)`, `toInstrumentLaunchLedgerEntry(record)`, CLI single-launch wrapper, and launch records.

- [ ] **Step 1: Write failing main/WAL/SHM comparison tests**

```ts
expect(compareDatabaseSnapshots(before, identicalAfter).violations).toEqual([]);
expect(compareDatabaseSnapshots(before, walGrew).violations).toContain("ralphy.db-wal size changed");
expect(compareDatabaseSnapshots(noWal, createdWal).violations).toContain("ralphy.db-wal existence changed");
expect(compareDatabaseSnapshots(before, shmMetadataChanged).violations).toEqual([]);
expect(shmMetadataChanged.shm).toBeDefined();
expect(toInstrumentLaunchLedgerEntry(successRecord)).toMatchObject({ label: "scenario-media", dbRecord: expect.stringMatching(/^db\//), database: { main: "verified-unchanged", wal: "verified-unchanged", shm: "recorded-separately" }, child: { exitCode: 0, signal: null } });
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/db-fingerprint.test.ts`

Expected: FAIL until existence/SHA/bytes/nanosecond mtime are compared for main and WAL and SHM is separate.

- [ ] **Step 3: Implement exact per-launch wrapper**

```ts
type FileFingerprint = { exists: boolean; sha256: string | null; bytes: bigint | null; mtimeNs: bigint | null };
type DatabaseFamilySnapshot = { main: FileFingerprint; wal: FileFingerprint; shm: Omit<FileFingerprint, "sha256"> };
```

Never open SQLite. Snapshot `/Users/maximovchinnikov/.ralphy/ralphy.db` and `-wal` before/after one child process and fail on any existence/SHA/size/mtime change; record `-shm` existence/size/mtime before/after without failing or claiming byte immutability. Always save JSON under the evidence run, including stable ID, child exit/signal, and label, and return the exact launch-ledger entry so each caller must append it before finalization.

- [ ] **Step 4: Run GREEN and safety review**

Run: `bun run test -- tests/db-fingerprint.test.ts && bun scripts/with-db-fingerprint.mjs --label no-launch -- bun -e 'process.exit(0)' && git diff --check`

Expected: PASS and one JSON record; reviewer confirms no SQLite library/command is invoked and each child equals exactly one launch.

- [ ] **Step 5: Commit**

```bash
git add scripts/db-fingerprint.mjs scripts/with-db-fingerprint.mjs tests/db-fingerprint.test.ts
gitleaks protect --staged --redact
git commit -m "test: enforce per-launch database immutability"
```

### Task 11: Build the verified mock package and drive every canonical scenario

**Files:**
- Create: `scripts/audit-instrument-electron.mjs`
- Modify: `package.json`
- Test: `tests/instrument-electron-audit.test.ts`

**Interfaces:** Consumes approved Core pin, scenario manifest, revision-checked `updateEvidenceBundle`, and Bun CDP. Produces and verifies the deterministic mock package before the runner consumes it, then produces `bun run audit:instrument:electron` and `INSTRUMENT_ELECTRON_AUDIT_OK <exact-case-count>`.

- [ ] **Step 1: Write failing expansion/calibration/semantic tests**

```ts
const expectedKeys = independentlyExpandLockedAxes(INSTRUMENT_SCENARIOS, REQUIRED_SCENARIO_THEMES, REQUIRED_SCENARIO_VIEWPORTS);
expect(expandScenarioCases(INSTRUMENT_SCENARIOS).map(({ key }) => key)).toEqual(expectedKeys);
expect(expectedKeys).toHaveLength(INSTRUMENT_SCENARIOS.length * 6 - reviewedOmittedPairCount(INSTRUMENT_SCENARIOS));
expect(invalidCoverageExceptions(INSTRUMENT_SCENARIOS)).toEqual([]);
expect(SHELL_PANEL_CASES).toEqual(EXACT_REVIEWED_SHELL_PANEL_CASES);
expect(assertExpectedRailAndPanels(expandScenarioCases(INSTRUMENT_SCENARIOS))).toBeUndefined();
expect(calibrateBounds(nativeBounds, innerMetrics)).toMatchObject({ nativeBounds, contentBounds: expect.any(Object) });
expect(() => assertScenarioEvidence(missingLandmarkRecord)).toThrow(/landmark/i);
expect(() => assertScenarioEvidence(missingLaunchAndDbRecord)).toThrow(/launch|DB record/i);
expect(() => assertScenarioEvidence(missingAccessibilityJourneysArray)).toThrow(/accessibilityJourneys/i);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-electron-audit.test.ts`

Expected: FAIL because no per-scenario Bun/CDP runner exists.

- [ ] **Step 3: Implement isolated scenario execution**

For each exact expanded scenario key, create a fresh temp `userData`, then call `withDatabaseFingerprint(label, launch)` around its one Electron child, with label `scenario-${caseId}`. Spawn with `Bun.spawn`, the freshly verified mock package, and CDP. Select fixture via production UI/test-fixture route only in mock build. Record native outer bounds separately from inner dimensions/device scale/top inset. Assert expected root/landmarks/overlay/focus/scroll owner plus `expectedRailMode[viewport]` and `panelSetup[viewport]`, no horizontal overflow, only modal-local scroller exception, dock reachability, native traffic inset/no HTML duplicate, native minimized/maximized/restored Browser states, computed flat styles, and AA contrast for every visible text-sized element/state. Create/retain the manifest at revision `0`, phase `scenario`; after each child, pass the typed record with `accessibilityJourneys: []` and `pixelDiff: null` plus its `journeyId: null` ledger entry in one `append-scenario-record` update. Carry the returned revision into the next `updateEvidenceBundle` call; never edit `manifest.json` or its launch ledger directly. Close in `finally`. Task 12 appends journey entries to these existing parent records and never adds another four-part scenario key. Run the separate exact shell panel matrix without merging it into canonical scenario keys.

```js
const profile = await mkdtemp(join(tmpdir(), `ralphy-instrument-${caseId}-`));
const child = Bun.spawn([executable, `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`], { env });
```

- [ ] **Step 4: Run GREEN through the DB wrapper and review**

Run: `CORE_BIN='/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy Media.app/Contents/Resources/bin/ralphy'; VITE_RALPHY_ENABLE_MOCKS=true RALPHY_CORE_BIN="$CORE_BIN" bun run package:mac && bun scripts/bundled-core.mjs --verify-packaged 'release/Ralphy Media.app' && bun run audit:instrument:electron`

Expected: package is rebuilt and fixed Core/manifest verified before consumption; audit prints `INSTRUMENT_ELECTRON_AUDIT_OK <exact-case-count>` and absolute manifest path; DB main/WAL unchanged, SHM recorded. The manifest remains valid in `scenario` with pending journeys and Media pixels. Reviewer compares exact keys, rail/panel expectations, revision progression, launch ledger, and per-scenario records rather than a lower bound.

- [ ] **Step 5: Commit**

```bash
git add scripts/audit-instrument-electron.mjs package.json tests/instrument-electron-audit.test.ts
gitleaks protect --staged --redact
git commit -m "test: audit canonical Electron scenarios"
```

### Task 12: Add system-theme, keyboard, reduced-motion, and live-region journeys

**Files:**
- Create: `scripts/audit-instrument-accessibility.mjs`
- Modify: `scripts/audit-instrument-electron.mjs`
- Modify: `package.json`
- Test: `tests/instrument-accessibility-audit.test.ts`

**Interfaces:** Consumes expanded scenario cases, each scenario's case `journeys`, `GLOBAL_ACCESSIBILITY_JOURNEY_IDS`, and revision-checked `updateEvidenceBundle`; produces `bun run audit:instrument:accessibility`, one nested journey evidence entry per declared case journey, and the separate manifest-level `system-theme` execution.

- [ ] **Step 1: Write failing journey coverage tests**

```ts
expect(missingJourneyCoverage(INSTRUMENT_SCENARIOS)).toEqual([]);
expect(GLOBAL_ACCESSIBILITY_JOURNEY_IDS).toEqual(["system-theme"]);
expect(systemThemeJourney).toEqual(["launch-system-dark", "switch-os-light", "assert-root-consumers"]);
expect(shortcutCases).toEqual(expect.arrayContaining(["interactive-button", "contenteditable", "modal-open", "modifier", "composition", "repeat"]));
const caseWithThreeJourneys = expandedScenarioCase("accessibility.all-kinds");
expect(caseWithThreeJourneys.scenario.journeys).toEqual(["keyboard", "reduced-motion", "live-region"]);
expect(expectedJourneyLaunchLabels(caseWithThreeJourneys)).toEqual([
  `journey-${caseWithThreeJourneys.key}-keyboard`,
  `journey-${caseWithThreeJourneys.key}-reduced-motion`,
  `journey-${caseWithThreeJourneys.key}-live-region`,
]);
expect(expectedGlobalAccessibilityLaunchLabels()).toEqual(["journey-global-system-theme"]);
expect(() => validateManifest(accessibilityCompleteWithPendingMediaPixelEvidence)).not.toThrow();
expect(() => validateManifest(accessibilityCompleteWithSystemThemeNestedInCase)).toThrow(/extra.*case journey/i);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-accessibility-audit.test.ts`

Expected: FAIL because end-to-end journey coverage and system theme are absent.

- [ ] **Step 3: Implement end-to-end journeys**

For each expanded scenario-case and every case journey declared by its scenario, launch a separate child and use CDP `Emulation.setEmulatedMedia` for `prefers-reduced-motion` where applicable. Wrap that child with `withDatabaseFingerprint(label, launch)` using collision-free label `journey-${caseKey}-${journeyKind}`. Tab/click/activate sidebar, Workspace picker, dock, Island, profile/Settings, every shared Select owner, all four Agent Chat menus, filters/cards, and every other production-registered overlay; Escape and assert opener focus/unchanged desk offset. Under reduce, nonessential computed animation/transition durations are zero. Commit exactly one nested entry and its matching ledger entry through `updateEvidenceBundle(manifestPath, revision, { type: "append-case-journey", evidenceKey: caseKey, journey, ledgerEntries: [ledger] })`, then use the returned revision. The ledger entry stores `scenarioEvidenceKey: caseKey` and `journeyId: journeyKind`; prove polite deduplication/no focus move and exercise tuple-fenced mock-review shortcut suppression cases.

Run `system-theme` once as a typed manifest-level global suite, not as a scenario-case journey. Its separate isolated-profile Electron child uses launch label `journey-global-system-theme`, starts with the OS preference dark, switches the emulated OS preference live to light, and asserts the resolved root, xterm, and WaveSurfer consumers update without a flash. Wrap it with `withDatabaseFingerprint`, then atomically store the global entry and its one ledger entry using `set-global-accessibility-journey`; that ledger has `scenarioEvidenceKey: null` and `journeyId: "system-theme"`. After all case and global children, use one `advance-phase` update from `scenario` to `accessibility-complete`. The writer independently derives and validates exact equality for every case journey plus the exact global ID tuple, rejects missing/extra/duplicate entries or second scenario records, and deliberately accepts both required Media records with `pixelDiff: null` until Task 13. No Task 12 producer edits manifest JSON directly.

```js
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
```

- [ ] **Step 4: Run GREEN through wrapper and accessibility review**

Run: `bun run audit:instrument:accessibility`

Expected: prints `INSTRUMENT_ACCESSIBILITY_AUDIT_OK <exact-case-journey-child-count+1-global-child>`; DB/WAL unchanged; every scenario-case record contains its exact case-journey array, the manifest has exactly one separate global system-theme execution, and every entry resolves to a distinct child/ledger/DB/artifact chain. Phase is `accessibility-complete` while Media pixel evidence remains optional. Accessibility reviewer signs system theme, focus, keyboard, motion, live regions, and contrast in their matching sections.

- [ ] **Step 5: Commit**

```bash
git add scripts/audit-instrument-accessibility.mjs scripts/audit-instrument-electron.mjs package.json tests/instrument-accessibility-audit.test.ts
gitleaks protect --staged --redact
git commit -m "test: audit instrument accessibility journeys"
```

### Task 13: Rebuild the verified mock package and measure Media 3a/3b fidelity

**Files:**
- Create: `scripts/capture-media-reference.mjs`
- Create: `scripts/audit-media-fidelity.mjs`
- Modify: `package.json`
- Test: `tests/media-fidelity-audit.test.ts`

**Interfaces:** Consumes stable extracted HTML/assets, freshly rebuilt/verified mock package, the two exact Media evidence keys, revision-checked `updateEvidenceBundle`, and ffmpeg. Produces `A11Y_DEVIATION_MASK_VERSION = "readable-text-v1"`, `calibrateRendererCrop`, `validateA11yDeviationMask`, `assertGeometryDelta`, `assertPixelDiff`, and `bun run audit:media:fidelity`.

- [ ] **Step 1: Write failing geometry/diff tolerance tests**

```ts
expect(MEDIA_GEOMETRY_1440).toMatchObject({ sidebar: 240, outerGap: 8, filterRow: 38, lanes: 4, laneGap: 10, rail: 292, selectedRing: 3 });
expect(assertGeometryDelta(referenceBoxes, withinOnePx)).toBeUndefined();
expect(() => assertGeometryDelta(referenceBoxes, twoPxDelta)).toThrow(/1 CSS px/);
expect(calibrateRendererCrop(referenceMetrics, actualMetrics)).toEqual({ x: 0, y: 28, width: 1440, height: 872 });
expect(validateA11yDeviationMask(readableTextMask)).toMatchObject({ version: "readable-text-v1", pixelCount: 18420 });
expect(requiredMediaPixelEvidenceKeys).toEqual(["mock__media.ready__light__1440x900", "mock__media.ready__dark__1440x900"]);
expect(() => validateManifest(accessibilityCompleteWithPendingMediaPixelEvidence)).not.toThrow();
expect(() => validateManifest(mediaCompleteWithoutOneRequiredPixelDiff)).toThrow(/pixelDiff.*mock__media.ready__dark__1440x900/i);
expect(() => validateManifest(mediaCompleteWithPixelDiffOnNonRequiredCase)).toThrow(/unexpected.*pixelDiff/i);
expect(assertPixelDiff({ outsideUnionOver16: 0, mediaContentPixels: 100000, mediaContentOver24: 500, maxGeometryDeltaCssPx: 1 })).toBeUndefined();
expect(() => assertPixelDiff({ outsideUnionOver16: 1, mediaContentPixels: 100000, mediaContentOver24: 500, maxGeometryDeltaCssPx: 1 })).toThrow(/outside union mask/);
expect(() => validateA11yDeviationMask(maskContainingNativeChrome)).toThrow(/native chrome/i);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/media-fidelity-audit.test.ts`

Expected: FAIL because reference capture, geometry, raw diff analysis, and tolerance do not exist.

- [ ] **Step 3: Implement reproducible captures and ffmpeg raw diff**

Capture reference HTML sections 3a/3b at 1440×900 from the stable extracted path and actual mock Media light/dark from the freshly verified packaged app. Wrap each reference-browser and actual-app child separately with `withDatabaseFingerprint(label, launch)`, label `media-${captureId}`, and append each child to the launch ledger. Calibrate native outer/content bounds, crop both screenshots to the exact same renderer-content rectangle, and exclude native chrome before diffing. Produce cropped reference/actual/diff PNGs; run ffmpeg `blend=all_mode=difference` and pipe RGB24 raw bytes to Bun.

Build `mediaContentMask` from measured structural Media rectangles. Build versioned `a11yDeviationMask` only from selectors whose computed actual token is an approved readable substitution for the captured handoff token; record each selector/rectangle/from/to token and union pixel count, reject overlap with native chrome and unregistered regions, then union both masks. Require structural boxes within 1 CSS px, zero pixels outside the union above RGB delta 16, and at most 0.5% of Media-content pixels above RGB delta 24. The a11y mask is exempt only from pixel color tolerance, never geometry. For each exact light/dark Media evidence key, include both 3a/3b reference/actual/diff artifacts, metrics, masks, logs, and all reference/app launch-ledger entries in one `attach-media-pixel-evidence` call; pass the current manifest revision and carry the returned revision forward. Partial collection remains a valid `accessibility-complete` bundle, so an interrupted second capture never invalidates the first committed attachment. Also capture actual 1280/1100 selection/viewer/video-hover/chat/dock/overlay states without the 1440 pixel threshold and append their supporting launches through the same update API.

After both exact keys have non-null validated pixel evidence, call `updateEvidenceBundle` once with `advance-phase` from `accessibility-complete` to `media-complete`. The transition derives the exact required keys from the stored manifest, rejects any missing required evidence or any `pixelDiff` on another case, and atomically publishes the new phase. No capture or audit script edits the manifest, records, artifact paths, or launch ledger directly.

```js
const diff = Bun.spawn(["ffmpeg", "-i", reference, "-i", actual, "-filter_complex", "blend=all_mode=difference", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { stdout: "pipe" });
```

- [ ] **Step 4: Run GREEN through wrapper and visual review**

Run: `CORE_BIN='/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy Media.app/Contents/Resources/bin/ralphy'; VITE_RALPHY_ENABLE_MOCKS=true RALPHY_CORE_BIN="$CORE_BIN" bun run package:mac && bun scripts/bundled-core.mjs --verify-packaged 'release/Ralphy Media.app' && bun run audit:media:fidelity`

Expected: mock package and fixed Core/manifest are verified before capture; prints `MEDIA_FIDELITY_AUDIT_OK`; DB/WAL unchanged and SHM linked; manifest advances from valid pending-Media `accessibility-complete` to `media-complete` only after both exact records hold calibrated crops, Media/a11y mask regions and pixel count, exact deltas, artifacts/logs, and launches. Visual reviewer signs the versioned readable-text deviations separately from strict geometry/Media-content tolerance.

- [ ] **Step 5: Commit**

```bash
git add scripts/capture-media-reference.mjs scripts/audit-media-fidelity.mjs package.json tests/media-fidelity-audit.test.ts
gitleaks protect --staged --redact
git commit -m "test: measure Media handoff fidelity"
```

### Task 14: Package mock and production, prove persistence/immutability, and finalize evidence

**Files:**
- Modify: `scripts/audit-instrument-electron.mjs`
- Modify: `scripts/smoke-electron.mjs`
- Modify: `scripts/render-instrument-report.mjs`
- Modify: `package.json`
- Test: `tests/instrument-final-acceptance.test.ts`

**Interfaces:** Consumes all audit tools, the revision-checked evidence bundle, and fixed Core pin. Produces `bun run audit:instrument:final` and absolute final report path.

- [ ] **Step 1: Write failing launch ledger/persistence/final checks**

```ts
expect(launchLabels).toEqual(expect.arrayContaining(["mock-smoke", "production-truth", "production-smoke", "persistence-first", "persistence-second"]));
expect(launchLabels.some((label) => label.startsWith("scenario-"))).toBe(true);
expect(launchLabels.some((label) => label.startsWith("journey-"))).toBe(true);
expect(launchLabels.some((label) => label.startsWith("media-"))).toBe(true);
expect(launchLabels).toEqual(expectedFinalLaunchLabels(INSTRUMENT_SCENARIOS, GLOBAL_ACCESSIBILITY_JOURNEY_IDS, mediaCaptures));
expect(assertEveryLaunchHasDbRecord(manifest)).toBeUndefined();
expect(assertEveryRecordLinksLaunchAndArtifacts(manifest)).toBeUndefined();
expect(assertEveryScenarioCaseHasExactJourneyExecutions(manifest, INSTRUMENT_SCENARIOS)).toBeUndefined();
expect(assertExactGlobalAccessibilityExecutions(manifest, GLOBAL_ACCESSIBILITY_JOURNEY_IDS)).toBeUndefined();
expect(assertEveryJourneyLinksDistinctChildLedgerDbAndArtifacts(manifest)).toBeUndefined();
expect(manifest.requirements.mediaPixelEvidenceKeys).toEqual(["mock__media.ready__light__1440x900", "mock__media.ready__dark__1440x900"]);
expect(assertExactMediaPixelEvidence(manifest)).toBeUndefined();
expect(manifest.phase).toBe("final");
expect(manifest.records.every(({ reviewer }) => reviewer.regression !== null)).toBe(true);
expect(assertReportDisplaysLockedSchema(reportHtml)).toBeUndefined();
expect(assertTwoLaunchPersistence(first, second)).toMatchObject({ themeBeforePaint: "light", sidebarVisible: false, rightPreference: false });
expect(assertProductionExclusion(distText)).toBeUndefined();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-final-acceptance.test.ts`

Expected: FAIL because the final launch ledger, two-launch profile reuse, production truth case, and consolidated report checks do not exist.

- [ ] **Step 3: Implement exact final orchestration**

Preflight the approved Core source/version/SHA, then package mock mode using the verified in-memory bytes and verify its packaged Core/manifest before any consumer. Scenario/accessibility/Media scripts wrap every child internally and commit their record-plus-ledger updates through `updateEvidenceBundle`; wrap each single smoke child with the CLI and add its returned ledger entry with `append-supporting-launches`, always passing the latest returned revision. Accessibility finalization independently expands every scenario-case's declared case journeys, requires one nested entry and one distinct `journey-${caseKey}-${journeyKind}` child/ledger/DB/artifact chain for each, and separately requires the exact manifest-global `system-theme` entry with the `journey-global-system-theme` child and `scenarioEvidenceKey: null`. It rejects missing/extra/duplicate entries, reused ledger IDs, or an extra four-part scenario record.

In the `--persistence` path, create one temporary profile and call `withDatabaseFingerprint("persistence-first", launchFirst)`; choose Light, hide sidebar, close right preference through UI, and close cleanly. Then call `withDatabaseFingerprint("persistence-second", launchSecond)` with the same profile and verify prepaint Light plus restored panels before interaction. Package production false mode, reverify Core/manifest, run source audit, reject the complete fixture/mock marker list, then have `--production-truth` wrap its one child as `production-truth`; wrap production smoke separately. Production truth asserts real read-only Media status, disabled A/N/R reason, unavailable live Island counters, and no mock label. Add these supporting ledger entries and each record's reviewer decision only through revision-checked discriminated updates. Verify app version/codesign and require exact launch labels—including `journey-global-system-theme`—DB/WAL/SHM links, child results, typed scenario/case-journey/global-journey/Media records and artifacts, and all four reviewer decisions. Finally call `updateEvidenceBundle` with `advance-phase` from `media-complete` to `final`; the writer revalidates the complete bundle before the atomic rename, after which the report reads revision/phase and every required section. No final orchestrator edits JSON directly.

```bash
CORE_BIN='/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy Media.app/Contents/Resources/bin/ralphy'
test "$($CORE_BIN --version)" = '0.3.0'
test "$(shasum -a 256 "$CORE_BIN" | awk '{print $1}')" = 'a843e2805b4b0a49d02f7afe46cdd5693d81184c14d560af836be93283d85679'
VITE_RALPHY_ENABLE_MOCKS=true RALPHY_CORE_BIN="$CORE_BIN" bun run package:mac
bun scripts/bundled-core.mjs --verify-packaged 'release/Ralphy Media.app'
bun run audit:instrument:electron
bun scripts/with-db-fingerprint.mjs --label mock-smoke -- bun run smoke:packaged
bun run audit:instrument:accessibility
bun run audit:media:fidelity
bun run audit:instrument:electron -- --persistence
VITE_RALPHY_ENABLE_MOCKS=false RALPHY_CORE_BIN="$CORE_BIN" bun run package:mac
bun scripts/bundled-core.mjs --verify-packaged 'release/Ralphy Media.app'
bun run audit:instrument:source
! rg -a 'mock-review|TEST REVIEW SESSION · NOT SAVED|ux-review-artifact-1|ux-review-iteration-3|mock-needs-work-fixture|instrument-test-fixture|ux-mock-render-1' dist 'release/Ralphy Media.app/Contents/Resources/app/dist'
bun run audit:instrument:electron -- --production-truth
bun scripts/with-db-fingerprint.mjs --label production-smoke -- bun run smoke:packaged
codesign --verify --deep --strict --verbose=2 'release/Ralphy Media.app'
bun run report:instrument
```

- [ ] **Step 4: Run the complete final gate and independent reviews**

Run: `bun run test && bun run typecheck && bun run audit:instrument:final`

Expected: all checks pass; every Electron child has its own DB/WAL before/after record and SHM observation; packaged Core/manifest equal fixed pin; production is fixture-free; codesign passes; exact case journeys, the separate global system-theme journey, and both required Media pixel records validate; product, accessibility/visual, security, and regression reviewers record decisions in manifest; a single atomic `media-complete` → `final` update succeeds and the command prints the absolute `report.html`.

- [ ] **Step 5: Commit final harness**

```bash
git add scripts/audit-instrument-electron.mjs scripts/smoke-electron.mjs scripts/render-instrument-report.mjs package.json tests/instrument-final-acceptance.test.ts
gitleaks protect --staged --redact
git commit -m "test: finalize instrument launch evidence"
```

## Final Completion Gate

Run: `bun run test && bun run typecheck && VITE_RALPHY_ENABLE_MOCKS=false bun run build && bun run audit:instrument:source && bun run audit:instrument:final && git diff --check && git log --oneline "$NOTHING_POLISH_BASE..HEAD"`

Expected: complete green gate; 14 scoped commits; every canonical scenario represented in the versioned report; Media reference/actual/diff within tolerance; system/keyboard/reduced-motion/live-region journeys pass; every launch DB/WAL-clean with SHM recorded; production has no fixtures; bundled Core is exactly pinned 0.3.0; absolute report path is ready for handoff.
