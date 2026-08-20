# Nothing Work Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every startup, My Work, and Project route/state in the Instrument shell, including read-only production Media and the isolated UX Testing Lab test-review experience.

**Architecture:** Existing reducers, controllers, readers, DTOs, media protocol, and mutations remain unchanged. Route components render shared Instrument roots, rail portals, and the external shell scroll owner; deterministic scenario fixtures drive tests only under the exact mock build flag.

**Tech Stack:** Electron 43.2.0, React 19, TypeScript 5.9.3, Bun 1.3, Vitest 0.34.6, Motion, Radix, Lucide React, `@tanstack/react-virtual` 3.5.0, existing media viewers.

**Spec:** `docs/superpowers/specs/2026-08-20-nothing-os-redesign-design.md`

**Visual evidence:** `.superpowers/sdd/nothing-instrument/reference/design_handoff_instrument/`; iteration-3 HTML sections 3a/3b are authoritative only for Media.

## Global Constraints

- Begin after Plan 1 completes and record its HEAD. Import Plan 1 interfaces verbatim; do not fork Availability, scenario, rail, scroll, profile, theme, Island, header, or dock contracts.
- Do not add or reconcile `media.review`, Core consumer authentication/session state, IPC, preload, Core types, database/schema code, renderer persistence, or a package.
- Production Media is read-only. A/N/R controls are focusable `aria-disabled` with exact reason `Review is unavailable in Core 0.3.0 from Desktop.`
- Mock review exists only when `import.meta.env.VITE_RALPHY_ENABLE_MOCKS === "true"` and workspace name is exactly `UX Testing Lab`; label it `TEST REVIEW SESSION · NOT SAVED`, reset it on root/workspace change, and never call bridge/storage/filesystem.
- Right-side content uses the shared `docked | overlay | closed` rail. Virtualized Media and Activity use `InstrumentScrollContext` as their external scroll element.
- Every task completes deterministic ready/loading/empty/partial/unavailable/error/selected/disabled fixtures applicable to its surface and adds behavior-first interaction/focus/scroll assertions; copy assertions alone are not acceptance.
- Every rendered route/overlay has `data-instrument-root`, a scenario manifest entry, expected landmarks, focus contract, and scroll owner.
- Each task follows RED/GREEN, task-sized independent review, `git diff --check`, exact staging, staged gitleaks, and a commit.

---

Before Task 1, record `NOTHING_WORK_BASE=$(git rev-parse HEAD)` in executor notes.

## Consumed Plan 1 Interfaces

```ts
export type Availability<T> =
  | { status: "ready"; value: T }
  | { status: "partial"; value: T; reason: string }
  | { status: "empty"; reason: string }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };

export type InstrumentRightRailMode = "docked" | "overlay" | "closed";
export function InstrumentRightRailPortal(props: { owner: InstrumentRightRailOwner; label: string; children: React.ReactNode }): React.ReactPortal | null;
export function useInstrumentScroll(): InstrumentScrollContextValue;
export const INSTRUMENT_SCENARIOS: readonly InstrumentScenario[];
export function assertInstrumentScenarioCompleteness(): void;
```

## Media Presentation Interfaces

```ts
// src/screens/project/media-review-presentation.ts
import type { ArtifactRevisionState, MediaCardDto } from "../../../electron/ralphy/types";

export type MediaReviewVerdict = "approved" | "needs-work" | "rejected";
export type ProductionMediaReviewStatus = ArtifactRevisionState;
export const MEDIA_REVIEW_UNSUPPORTED_REASON = "Review is unavailable in Core 0.3.0 from Desktop.";
export function productionMediaReviewStatus(card: MediaCardDto): Availability<ProductionMediaReviewStatus>;

// src/screens/project/mock-review-session.ts -- mock-only dynamic import
export interface MockReviewIteration { id: string; label: string; active: boolean }
export interface MockReviewRecord { artifactId: string; verdict: MediaReviewVerdict; feedback: string | null; iterationId: string | null }
export interface MockReviewSessionState {
  rootEpoch: number;
  workspaceId: string;
  projectId: string | null;
  iteration: MockReviewIteration;
  reviews: Readonly<Record<string, MockReviewRecord>>;
  needsWorkDraft: { artifactId: string; feedback: string } | null;
}
export type MockReviewAction =
  | { type: "approve" | "reject"; artifactId: string }
  | { type: "open-needs-work"; artifactId: string }
  | { type: "change-feedback"; value: string }
  | { type: "submit-needs-work" }
  | { type: "cancel-needs-work" }
  | { type: "reset-context"; rootEpoch: number; workspaceId: string; projectId: string | null };
export function reduceMockReviewSession(state: MockReviewSessionState, action: MockReviewAction): MockReviewSessionState;
```

## File Map

- `tests/helpers/render-instrument-scenario.tsx` — DOM scenario renderer using deterministic fixture provider.
- `src/styles/work-surfaces.css` — route geometry only; all colors are Plan 1 tokens.
- `src/screens/workspace/*`, `SharedLibraryScreen.tsx`, `MemoryScreen.tsx`, `CalendarScreen.tsx` — My Work surfaces.
- `src/screens/project/*` — Documents, read-only/mock Media, Units, Activity.
- `src/components/VirtualAssetGrid.tsx` and Activity virtualization — external shell-scroll consumers.

### Task 1: Rebuild startup, Home Library, migration, and app-level states

**Files:**
- Create: `tests/helpers/render-instrument-scenario.tsx`
- Create: `tests/helpers/instrument-matchers.ts`
- Create: `tests/helpers/instrument-matchers.d.ts`
- Create: `src/styles/work-surfaces.css`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/WelcomeScreen.tsx`
- Modify: `src/screens/LibraryScreen.tsx`
- Modify: `src/screens/MigrationRecoveryScreen.tsx`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/instrument-global-states.test.tsx`
- Test: `tests/migration-recovery.test.tsx`

**Interfaces:** Consumes Plan 1 scenario provider, existing `tests/react-host.ts`, and root/migration callbacks. Produces `renderInstrumentScenario(id: string): InstrumentScenarioHost` for all later DOM state tests. `InstrumentScenarioHost` exposes `container`, `getByRole`, `queryByRole`, `user.click/type/clear/hover/tab/keyboard`, and `cleanup`; it is a thin adapter over the existing DOM host and adds no testing package. `instrument-matchers.ts` implements and declares the plan's DOM matchers with `vitest.expect.extend`; it does not import Testing Library or jest-dom. Each later snippet's `screen` and `user` come from this host.

- [ ] **Step 1: Write absent rendered-state behavior tests**

```tsx
const error = renderInstrumentScenario("startup.library.error");
expect(error.getByRole("alert")).toHaveTextContent("Core unavailable");
await user.click(error.getByRole("button", { name: "Choose another library" }));
expect(onChooseRoot).toHaveBeenCalledTimes(1);
expect(renderInstrumentScenario("startup.library.empty").getByRole("status")).toHaveAttribute("data-instrument-root");
```

Cover welcome/restoring, root picker, empty/unavailable/error Home Library, Migration Recovery, app alert/refresh failure, loading/offline/partial.

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/instrument-global-states.test.tsx tests/migration-recovery.test.tsx`

Expected: FAIL on absent Instrument roots, semantic alert/status behavior, and root-picker focus return.

- [ ] **Step 3: Implement state composition and fixture renderer**

```tsx
return <main data-instrument-root="startup-library"><InstrumentScreenHeader title="Home Library" />{renderAvailability(catalogState)}</main>;
```

```ts
export function renderInstrumentScenario(id: string): InstrumentScenarioHost {
  const scenario = requiredScenario(id);
  const fixture = requiredFixture(instrumentTestFixtureProvider, scenario.fixtureId);
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  act(() => root.render(<ScenarioHarness scenario={scenario} fixture={fixture} />));
  return createInstrumentScenarioHost(host, root);
}
```

```ts
function createInstrumentScenarioHost(host: ReturnType<typeof createReactHost>, root: Root): InstrumentScenarioHost {
  const queryByRole = (role: string, options: { name?: string | RegExp } = {}) => host.container
    .findAll((node) => implicitOrExplicitRole(node) === role)
    .find((node) => options.name === undefined || matches(accessibleName(node), options.name)) ?? null;
  return {
    container: host.container,
    queryByRole,
    getByRole(role, options) { const node = queryByRole(role, options); if (!node) throw new Error(`Role not found: ${role}`); return node; },
    user: {
      async click(node) { await act(async () => node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))); },
      async type(node, value) { const input = node as HostNode & { value: string }; for (const key of value) await act(async () => { input.value = `${input.value ?? ""}${key}`; input.dispatchEvent(new InputEvent("input", { bubbles: true, data: key, inputType: "insertText" })); }); },
      async clear(node) { const input = node as HostNode & { value: string }; await act(async () => { input.value = ""; input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" })); }); },
      async hover(node) { await act(async () => node.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))); },
      async tab() { const node = (host.container.ownerDocument.activeElement as HostNode | null) ?? host.container; await act(async () => node.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }))); },
      async keyboard(key) { const node = (host.container.ownerDocument.activeElement as HostNode | null) ?? host.container; const normalized = key === "{Escape}" ? "Escape" : key; await act(async () => node.dispatchEvent(new KeyboardEvent("keydown", { key: normalized, bubbles: true, cancelable: true }))); },
    },
    async cleanup() { await act(async () => root.unmount()); host.restore(); },
  };
}
```

```ts
const IMPLICIT_ROLES: Record<string, string> = {
  ASIDE: "complementary", BUTTON: "button", MAIN: "main", NAV: "navigation",
  SELECT: "combobox", TABLE: "table", TEXTAREA: "textbox",
};
function implicitOrExplicitRole(node: HostNode): string | null {
  return node.getAttribute("role") ?? IMPLICIT_ROLES[node.tagName] ?? (node.tagName === "INPUT" ? "textbox" : null);
}
const matches = (actual: string, expected: string | RegExp) => typeof expected === "string" ? actual === expected : expected.test(actual);
const matcherResult = (pass: boolean, expected: string) => ({ pass, message: () => `expected node ${pass ? "not " : ""}to be ${expected}` });
function accessibleName(node: HostNode): string {
  const labelledBy = node.getAttribute("aria-labelledby");
  return node.getAttribute("aria-label") ?? (labelledBy ? node.ownerDocument.getElementById(labelledBy)?.textContent : null) ?? node.textContent;
}
function accessibleDescription(node: HostNode): string {
  const describedBy = node.getAttribute("aria-describedby");
  return describedBy ? describedBy.split(/\s+/).map((id) => node.ownerDocument.getElementById(id)?.textContent ?? "").join(" ").trim() : "";
}
expect.extend({
  toBeVisible(node: HostNode) { return matcherResult(node.getAttribute("hidden") === null && node.getAttribute("aria-hidden") !== "true", "visible"); },
  toHaveFocus(node: HostNode) { return matcherResult(node.ownerDocument.activeElement === node, "focused"); },
  toHaveAttribute(node: HostNode, name: string, value?: string) { return matcherResult(value === undefined ? node.getAttributeNames().includes(name) : node.getAttribute(name) === value, `${name}=${value}`); },
  toHaveTextContent(node: HostNode, value: string | RegExp) { return matcherResult(matches(node.textContent, value), `text ${String(value)}`); },
  toHaveAccessibleName(node: HostNode, value: string | RegExp) { return matcherResult(matches(accessibleName(node), value), `name ${String(value)}`); },
  toHaveAccessibleDescription(node: HostNode, value?: string | RegExp) { return matcherResult(matches(accessibleDescription(node), value ?? /.+/), "accessible description"); },
  toContainElement(node: HostNode, child: HostNode) { return matcherResult(node.contains(child), "contain element"); },
  toBeDisabled(node: HostNode) { return matcherResult(node.disabled || node.getAttribute("aria-disabled") === "true", "disabled"); },
});
```

```ts
import type { HostNode } from "../react-host";

declare module "vitest" {
  interface Assertion<T = unknown> {
    toBeVisible(): void;
    toHaveFocus(): void;
    toHaveAttribute(name: string, value?: string): void;
    toHaveTextContent(value: string | RegExp): void;
    toHaveAccessibleName(value: string | RegExp): void;
    toHaveAccessibleDescription(value?: string | RegExp): void;
    toContainElement(child: HostNode): void;
    toBeDisabled(): void;
  }
}
```

Use fixture IDs from the manifest, real callbacks, `aria-busy`, deduped alerts, and focus restoration. Do not turn unavailable into empty or add local mock actions.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/instrument-global-states.test.tsx tests/migration-recovery.test.tsx tests/instrument-scenarios.test.ts && bun run typecheck && git diff --check`

Expected: PASS; reviewer drives all startup scenarios and confirms semantic differences/focus.

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/render-instrument-scenario.tsx tests/helpers/instrument-matchers.ts tests/helpers/instrument-matchers.d.ts src/styles/work-surfaces.css src/main.tsx src/App.tsx src/components/WelcomeScreen.tsx src/screens/LibraryScreen.tsx src/screens/MigrationRecoveryScreen.tsx src/instrument/test-fixtures.ts tests/instrument-global-states.test.tsx tests/migration-recovery.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild instrument startup states"
```

### Task 2: Rebuild Workspace Overview instruments

**Files:**
- Modify: `src/screens/WorkspaceScreen.tsx`
- Modify: `src/screens/workspace/overview-presentation.ts`
- Modify: `src/screens/workspace/WorkspaceOverviewHeader.tsx`
- Modify: `src/screens/workspace/WorkspacePerformance.tsx`
- Modify: `src/screens/workspace/WorkspacePlanAndOutcomes.tsx`
- Modify: `src/screens/workspace/WorkspaceInsights.tsx`
- Modify: `src/screens/workspace/WorkspaceOperations.tsx`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/workspace-overview-screen.test.tsx`
- Test: `tests/workspace-overview-presentation.test.ts`
- Test: `tests/workspace-overview-navigation.test.tsx`

**Interfaces:** Consumes existing controller/presentation and Plan 1 Availability. Produces overview ready/partial/unavailable/error widgets without changing projection math.

- [ ] **Step 1: Write behavior-first availability/navigation tests**

```tsx
const partial = renderInstrumentScenario("workspace.overview.partial");
expect(partial.getByRole("status", { name: "Calendar availability" })).toHaveTextContent("Calendar status unavailable");
await user.click(partial.getByRole("button", { name: "Open attention" }));
expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ page: "calendar" }));
expect(restoredDeskOffset()).toBe(418);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/workspace-overview-screen.test.tsx tests/workspace-overview-presentation.test.ts tests/workspace-overview-navigation.test.tsx`

Expected: FAIL because sections lack Instrument roots/state semantics and shell scroll restoration.

- [ ] **Step 3: Compose existing projections**

```ts
import type { Availability } from "../../instrument/types";
```

Delete the local narrower Availability alias. Render separate Performance, Plan/outcomes, Insights, Operations, and Attention widgets; preserve all existing reasons/math and route-return focus/offset.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/workspace-overview-screen.test.tsx tests/workspace-overview-presentation.test.ts tests/workspace-overview-navigation.test.tsx && bun run typecheck && git diff --check`

Expected: PASS; reviewer verifies every presentation branch and one desk scroller.

- [ ] **Step 5: Commit**

```bash
git add src/screens/WorkspaceScreen.tsx src/screens/workspace/overview-presentation.ts src/screens/workspace/WorkspaceOverviewHeader.tsx src/screens/workspace/WorkspacePerformance.tsx src/screens/workspace/WorkspacePlanAndOutcomes.tsx src/screens/workspace/WorkspaceInsights.tsx src/screens/workspace/WorkspaceOperations.tsx src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/workspace-overview-screen.test.tsx tests/workspace-overview-presentation.test.ts tests/workspace-overview-navigation.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild workspace overview instruments"
```

### Task 3: Rebuild Projects collection and honest Workspace Units

**Files:**
- Modify: `src/screens/WorkspaceScreen.tsx`
- Modify: `src/screens/WorkspaceProjectsScreen.tsx`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/workspace-domain.test.tsx`
- Test: `tests/workspace-navigation.test.tsx`

**Interfaces:** Consumes catalog projects and existing navigation. Produces adaptive project cards and `WorkspacePagePlaceholder` with a fixed unsupported reason.

- [ ] **Step 1: Write card/action/placeholder tests**

```tsx
await user.click(renderInstrumentScenario("workspace.projects.ready").getByRole("button", { name: /Open project/ }));
expect(onOpenProject).toHaveBeenCalledWith(realProjectReference);
const units = renderInstrumentScenario("workspace.units.unavailable");
expect(units.getByRole("status")).toHaveTextContent("Workspace Units are unavailable from the current contract");
expect(units.queryByRole("button", { name: /Create unit/i })).toBeNull();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/workspace-domain.test.tsx tests/workspace-navigation.test.tsx`

Expected: FAIL on Instrument card behavior and truthful unavailable state.

- [ ] **Step 3: Implement collection/placeholder**

```tsx
return page === "units" ? <InstrumentEmptyState title="Workspace Units" reason="Workspace Units are unavailable from the current contract." /> : <ProjectCardGrid projects={projects} />;
```

Render real status/count facts only; no fake zero/create action. Use desk container queries and preserve opener focus on return.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/workspace-domain.test.tsx tests/workspace-navigation.test.tsx && bun run typecheck && git diff --check`

Expected: PASS; reviewer tests ready/empty/error projects and unavailable Units at three widths.

- [ ] **Step 5: Commit**

```bash
git add src/screens/WorkspaceScreen.tsx src/screens/WorkspaceProjectsScreen.tsx src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/workspace-domain.test.tsx tests/workspace-navigation.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild workspace collections"
```

### Task 4: Rebuild Shared Library search and result states

**Files:**
- Modify: `src/screens/SharedLibraryScreen.tsx`
- Modify: `src/screens/shared-library/SharedLibraryToolbar.tsx`
- Modify: `src/screens/shared-library/presentation.ts`
- Modify: `src/styles/shared-library.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/shared-library-screen.test.tsx`
- Test: `tests/shared-library-presentation.test.ts`

**Interfaces:** Consumes current controller/query/paging. Produces Instrument search/filter/results for loading/ready/empty/partial/error and selected states.

- [ ] **Step 1: Write paging/filter/selection tests**

```tsx
await user.type(screen.getByRole("searchbox"), "vertical");
expect(controller.setQuery).toHaveBeenLastCalledWith("vertical");
await user.click(screen.getByRole("button", { name: "Load more" }));
expect(controller.loadMore).toHaveBeenCalledTimes(1);
expect(renderInstrumentScenario("shared.results.partial").getByRole("status")).toHaveTextContent(/partial/i);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/shared-library-screen.test.tsx tests/shared-library-presentation.test.ts`

Expected: FAIL on Instrument root, state semantics, and shell scroll retention.

- [ ] **Step 3: Implement results only**

```tsx
<main data-instrument-root="shared-library-results"><SharedLibraryToolbar /><SharedLibraryAuditList scrollElement={scroll.element} /></main>
```

Keep controller debounce/paging/stale-request logic; render real availability reasons and selection callbacks. No inspector/workflow changes in this task.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/shared-library-screen.test.tsx tests/shared-library-presentation.test.ts && bun run typecheck && git diff --check`

Expected: PASS; reviewer exercises filters/paging/partial/error and one-scroll-owner restoration.

- [ ] **Step 5: Commit**

```bash
git add src/screens/SharedLibraryScreen.tsx src/screens/shared-library/SharedLibraryToolbar.tsx src/screens/shared-library/presentation.ts src/styles/shared-library.css src/instrument/test-fixtures.ts tests/shared-library-screen.test.tsx tests/shared-library-presentation.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild shared library results"
```

### Task 5: Rebuild Shared Library inspector, viewer, history, and failures

**Files:**
- Modify: `src/screens/shared-library/SharedArtifactInspector.tsx`
- Modify: `src/screens/shared-library/SharedArtifactViewer.tsx`
- Modify: `src/screens/SharedLibraryScreen.tsx`
- Modify: `src/styles/shared-library.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/shared-library-inspector.test.tsx`
- Test: `tests/shared-library-viewer.test.tsx`

**Interfaces:** Consumes selected item/history/media failure state and shared rail. Produces docked/overlay inspector plus modal viewer.

- [ ] **Step 1: Write rail/viewer focus tests**

```tsx
await selectSharedItem();
expect(screen.getByRole("complementary", { name: "Shared item inspector" })).toBeVisible();
await openAt1100();
expect(screen.getByRole("dialog", { name: "Shared item inspector" })).toBeVisible();
await user.keyboard("{Escape}");
expect(selectedCard).toHaveFocus();
expect(renderInstrumentScenario("shared.viewer.media-error").getByRole("alert")).toBeVisible();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/shared-library-inspector.test.tsx tests/shared-library-viewer.test.tsx`

Expected: FAIL because inspector does not use shared rail modes and viewer focus/failure states are incomplete.

- [ ] **Step 3: Implement rail/viewer ownership**

```tsx
<InstrumentRightRailPortal owner="shared-inspector" label="Shared item inspector"><SharedArtifactInspector item={selected} /></InstrumentRightRailPortal>
```

Use one overlay-local scroller marker in viewer only; preserve guarded media URLs, history facts, Escape/opener restoration, and disabled unavailable explanations.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/shared-library-inspector.test.tsx tests/shared-library-viewer.test.tsx tests/protocol-access.test.ts && bun run typecheck && git diff --check`

Expected: PASS; reviewer checks selected/history/failure at docked and 1100 overlay modes.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared-library/SharedArtifactInspector.tsx src/screens/shared-library/SharedArtifactViewer.tsx src/screens/SharedLibraryScreen.tsx src/styles/shared-library.css src/instrument/test-fixtures.ts tests/shared-library-inspector.test.tsx tests/shared-library-viewer.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild shared library inspection"
```

### Task 6: Rebuild Shared Library workflows

**Files:**
- Modify: `src/screens/shared-library/SharedLibraryWorkflows.tsx`
- Modify: `src/screens/SharedLibraryScreen.tsx`
- Modify: `src/styles/shared-library.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/shared-library-workflows.test.tsx`

**Interfaces:** Consumes current preflight/mutation contracts. Produces focus-managed target/action workflows without no-op actions.

- [ ] **Step 1: Write preflight/confirm/focus tests**

```tsx
await openWorkflow("Add to project");
await user.click(screen.getByRole("button", { name: realProject.name }));
expect(preflight).toHaveBeenCalledWith(realProject);
expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
await resolvePreflightReady();
await user.click(screen.getByRole("button", { name: "Confirm" }));
expect(mutation).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/shared-library-workflows.test.tsx`

Expected: FAIL on Instrument dialog focus and truthful preflight gating.

- [ ] **Step 3: Reskin existing workflow state machine**

```tsx
<Dialog.Content data-instrument-root="shared-workflow" aria-describedby={reasonId}>{workflowBody}</Dialog.Content>
```

Keep exact Core mutation/preflight behavior, loading/error/partial reasons, Escape, and opener focus. No new operation or drag/drop path.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/shared-library-workflows.test.tsx tests/shared-library-screen.test.tsx && bun run typecheck && git diff --check`

Expected: PASS; reviewer verifies no enabled control bypasses preflight.

- [ ] **Step 5: Commit**

```bash
git add src/screens/shared-library/SharedLibraryWorkflows.tsx src/screens/SharedLibraryScreen.tsx src/styles/shared-library.css src/instrument/test-fixtures.ts tests/shared-library-workflows.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild shared library workflows"
```

### Task 7: Rebuild Memory list and rulebook detail

**Files:**
- Modify: `src/screens/MemoryScreen.tsx`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/memory-screen.test.tsx`
- Test: `tests/memory-contract.test.ts`

**Interfaces:** Consumes current Memory controller/contracts. Produces list/filter/loading/empty/partial/unavailable/error and rulebook detail.

- [ ] **Step 1: Write filter/detail/state tests**

```tsx
await user.click(screen.getByRole("button", { name: "Proposed" }));
expect(controller.setStatus).toHaveBeenCalledWith("proposed");
await user.click(screen.getByRole("button", { name: /Open rule/ }));
expect(screen.getByText("Does NOT apply to:")).toBeVisible();
expect(renderInstrumentScenario("memory.list.unavailable").getByRole("status")).toHaveAccessibleDescription();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/memory-screen.test.tsx tests/memory-contract.test.ts`

Expected: FAIL on Instrument state composition and distinct rule body structure.

- [ ] **Step 3: Implement list/detail**

```tsx
<article data-instrument-root="memory-rule"><RuleSection title="Why" body={rule.why} /><RuleSection title="How to apply" body={rule.how} /><RuleSection title="Does NOT apply to" body={rule.negativeScope} /></article>
```

Preserve exact body content and controller state; do not invent missing Restore.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/memory-screen.test.tsx tests/memory-contract.test.ts && bun run typecheck && git diff --check`

Expected: PASS; reviewer exercises all list states and semantic rule sections.

- [ ] **Step 5: Commit**

```bash
git add src/screens/MemoryScreen.tsx src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/memory-screen.test.tsx tests/memory-contract.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild memory rulebook"
```

### Task 8: Rebuild Memory review/editor/history/confirm overlays

**Files:**
- Modify: `src/screens/MemoryScreen.tsx`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/memory-screen.test.tsx`

**Interfaces:** Consumes existing memory mutations and feedback-body rules. Produces registered editor/history/confirm overlays.

- [ ] **Step 1: Write mutation/focus/conflict tests**

```tsx
await openMemoryEditor();
expect(screen.getByRole("dialog", { name: "Edit memory rule" })).toHaveFocus();
await user.clear(screen.getByLabelText("Does NOT apply to"));
expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
await user.keyboard("{Escape}");
expect(openEditorButton).toHaveFocus();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/memory-screen.test.tsx -t 'editor|history|review|confirm'`

Expected: FAIL on registered overlay roots, validation, and focus return.

- [ ] **Step 3: Implement overlay behavior**

```tsx
<Dialog.Content data-instrument-root="memory-editor"><MemoryRuleFields requiredNegativeScope /></Dialog.Content>
```

Preserve approve/reject/retire mutations, destructive red semantics, exact body validation, error alerts, and stale-request fencing.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/memory-screen.test.tsx tests/memory-contract.test.ts && bun run typecheck && git diff --check`

Expected: PASS; reviewer checks editor/history/confirm keyboard journeys and unavailable actions.

- [ ] **Step 5: Commit**

```bash
git add src/screens/MemoryScreen.tsx src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/memory-screen.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild memory workflows"
```

### Task 9: Rebuild Calendar views, filters, and list states

**Files:**
- Modify: `src/screens/CalendarScreen.tsx`
- Modify: `src/screens/calendar-presentation.ts`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/calendar-screen.test.tsx`
- Test: `tests/calendar-presentation.test.ts`

**Interfaces:** Consumes current month/week/agenda presentation and filters. Produces behavioral view switching and ready/empty/partial/error account/publication states.

- [ ] **Step 1: Write view/filter/partial tests**

```tsx
await user.click(screen.getByRole("button", { name: "Week" }));
expect(controller.setView).toHaveBeenCalledWith("week");
await user.click(screen.getByRole("button", { name: "Open filters" }));
expect(screen.getByRole("dialog", { name: "Calendar filters" })).toBeVisible();
expect(renderInstrumentScenario("calendar.agenda.partial").getByRole("status")).toHaveTextContent(/partially published/i);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/calendar-screen.test.tsx tests/calendar-presentation.test.ts`

Expected: FAIL on Instrument filter overlay, semantics, and focus behavior, even though legacy view labels exist.

- [ ] **Step 3: Implement views/filter state**

```tsx
<main data-instrument-root="calendar"><InstrumentScreenHeader filters={<CalendarViewPills value={view} onChange={setView} />} />{calendarBody}</main>
```

Preserve projection/grouping/order/account facts. Register filter overlay, use one desk scroller, and keep unsupported facts unavailable rather than zero.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/calendar-screen.test.tsx tests/calendar-presentation.test.ts && bun run typecheck && git diff --check`

Expected: PASS; reviewer exercises all views/states and keyboard filter dismissal.

- [ ] **Step 5: Commit**

```bash
git add src/screens/CalendarScreen.tsx src/screens/calendar-presentation.ts src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/calendar-screen.test.tsx tests/calendar-presentation.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild calendar views"
```

### Task 10: Rebuild Calendar inspector, drawers, and scheduling

**Files:**
- Modify: `src/screens/CalendarScreen.tsx`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/calendar-screen.test.tsx`
- Test: `tests/calendar-contract.test.ts`

**Interfaces:** Consumes existing inspector/drawer/schedule/platform/account callbacks. Produces rail inspector and registered overlays.

- [ ] **Step 1: Write rail/schedule/preflight tests**

```tsx
await selectCalendarItem();
expect(screen.getByRole("complementary", { name: "Calendar inspector" })).toBeVisible();
await openAt1100();
expect(screen.getByRole("dialog", { name: "Calendar inspector" })).toBeVisible();
await submitSchedule();
expect(scheduleMutation).toHaveBeenCalledWith(validScheduleInput);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/calendar-screen.test.tsx tests/calendar-contract.test.ts -t 'inspector|drawer|schedule|platform|account'`

Expected: FAIL on shared rail ownership, overlay focus, and Instrument schedule workflow.

- [ ] **Step 3: Implement existing contracts in shared surfaces**

```tsx
<InstrumentRightRailPortal owner="calendar-inspector" label="Calendar inspector"><CalendarInspector item={selected} /></InstrumentRightRailPortal>
```

Use registered drawer/schedule/platform/account overlays; preserve drag/drop, validation, mutation, partial/error states, selection, and focus restoration. No new scheduling path.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/calendar-screen.test.tsx tests/calendar-contract.test.ts && bun run typecheck && git diff --check`

Expected: PASS; reviewer checks every overlay at docked/1100 overlay and verifies no bypass.

- [ ] **Step 5: Commit**

```bash
git add src/screens/CalendarScreen.tsx src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/calendar-screen.test.tsx tests/calendar-contract.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild calendar workflows"
```

### Task 11: Rebuild Documents list, search, and viewers

**Files:**
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/screens/project/DocumentsPanel.tsx`
- Modify: `src/components/MarkdownView.tsx`
- Modify: `src/components/JsonDocumentView.tsx`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/documents-panel.test.tsx`
- Test: `tests/markdown-view.test.tsx`

**Interfaces:** Consumes current document paging/search/detail and safe renderers. Produces list/search/loading/append-error/empty plus Markdown/JSON/text viewer.

- [ ] **Step 1: Write search/viewer/focus tests**

```tsx
await user.type(screen.getByRole("searchbox"), "brief");
expect(controller.searchDocuments).toHaveBeenCalledWith("brief");
await user.click(screen.getByRole("button", { name: /Open document/ }));
expect(screen.getByRole("dialog", { name: "Document viewer" })).toBeVisible();
expect(renderInstrumentScenario("documents.viewer.json").getByRole("tree")).toBeVisible();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/documents-panel.test.tsx tests/markdown-view.test.tsx -t 'list|search|viewer|json|markdown'`

Expected: FAIL on registered viewer behavior, Instrument roots, and focus return.

- [ ] **Step 3: Implement list/viewers**

```tsx
<main data-instrument-root="project-documents"><DocumentSearch /><DocumentList /><DocumentViewerDialog /></main>
```

Keep sanitization, JSON validation/display, paging, guarded links, and viewer-local scroller marker; no editor/conflict changes yet.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/documents-panel.test.tsx tests/markdown-view.test.tsx tests/protocol-access.test.ts && bun run typecheck && git diff --check`

Expected: PASS; reviewer checks list states/viewer formats/focus and no nested desk scroll.

- [ ] **Step 5: Commit**

```bash
git add src/screens/ProjectScreen.tsx src/screens/project/DocumentsPanel.tsx src/components/MarkdownView.tsx src/components/JsonDocumentView.tsx src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/documents-panel.test.tsx tests/markdown-view.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild document browsing"
```

### Task 12: Rebuild Documents editor, revisions, and conflicts

**Files:**
- Modify: `src/screens/project/DocumentsPanel.tsx`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/documents-panel.test.tsx`
- Test: `tests/project-screen-behavior.test.tsx`

**Interfaces:** Consumes existing save/CAS/revision/navigation guard. Produces editor/revisions/conflict overlays and dirty-state focus flow.

- [ ] **Step 1: Write edit/save/conflict tests**

```tsx
await openDocumentEditor();
await user.type(screen.getByRole("textbox", { name: "Document body" }), " revised");
await attemptNavigate();
expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeVisible();
await resolveSaveConflict();
expect(screen.getByRole("dialog", { name: "Document conflict" })).toHaveFocus();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/documents-panel.test.tsx tests/project-screen-behavior.test.tsx -t 'edit|save|revision|conflict|dirty'`

Expected: FAIL on registered Instrument overlays and focus/guard behavior.

- [ ] **Step 3: Reskin existing mutation state**

```tsx
<Dialog.Content data-instrument-root="document-conflict"><ConflictReview local={draft} remote={latest} /></Dialog.Content>
```

Preserve exact CAS, JSON validation, stale-root fencing, navigation guard, revision selection, error recovery, and focus restoration.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/documents-panel.test.tsx tests/project-screen-behavior.test.tsx && bun run typecheck && git diff --check`

Expected: PASS; reviewer exercises save success/error/conflict/cancel and dirty navigation.

- [ ] **Step 5: Commit**

```bash
git add src/screens/project/DocumentsPanel.tsx src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/documents-panel.test.tsx tests/project-screen-behavior.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild document editing"
```

### Task 13: Present truthful read-only production Media review status

**Files:**
- Create: `src/screens/project/media-review-presentation.ts`
- Create: `src/screens/project/MediaReviewConsole.tsx`
- Modify: `src/screens/project/MediaPanel.tsx`
- Modify: `src/styles/work-surfaces.css`
- Test: `tests/project-media-review-presentation.test.tsx`
- Test: `tests/project-screen-behavior.test.tsx`

**Interfaces:** Consumes only the existing `ArtifactMediaCardDto.selectedState` after narrowing `MediaCardDto.ref.type === "artifact"`; produces a validated `ArtifactRevisionState` read-only status and unsupported controls. Run-object/object cards and unknown strings are explicitly unavailable. No Electron/IPC/controller files.

- [ ] **Step 1: Write read-only status and disabled-action tests**

```tsx
expect(productionMediaReviewStatus(approvedCard)).toEqual({ status: "ready", value: "approved" });
expect(productionMediaReviewStatus(candidateCard)).toEqual({ status: "ready", value: "candidate" });
expect(productionMediaReviewStatus(cardWithoutState)).toEqual({ status: "unavailable", reason: "Review status is unavailable for this media item." });
expect(productionMediaReviewStatus(runObjectCard)).toEqual({ status: "unavailable", reason: "Review status is unavailable for this media item." });
for (const name of ["Approve", "Needs Work", "Reject"]) {
  expect(screen.getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("button", { name })).toHaveAccessibleDescription(MEDIA_REVIEW_UNSUPPORTED_REASON);
}
expect(recordedBridgeCalls()).toEqual([]);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/project-media-review-presentation.test.tsx tests/project-screen-behavior.test.tsx -t 'read-only|unsupported review'`

Expected: FAIL because production console neither projects exact read-only truth nor exposes the required disabled explanation.

- [ ] **Step 3: Implement pure read-only presentation**

```tsx
<button type="button" aria-disabled="true" aria-describedby="media-review-unsupported" onClick={(event) => event.preventDefault()}>Approve</button>
<p id="media-review-unsupported">{MEDIA_REVIEW_UNSUPPORTED_REASON}</p>
```

Recognize only the existing `working | candidate | approved | rejected | superseded | archived` `ArtifactRevisionState` values after the artifact discriminant; otherwise return unavailable. Do not add event mutations, controller methods, bridge calls, Core types, sessions, or reconciliation.

- [ ] **Step 4: Run GREEN and architecture gate**

Run: `bun run test -- tests/project-media-review-presentation.test.tsx tests/project-screen-behavior.test.tsx tests/ipc-security.test.ts tests/ralphy-current-core.test.ts && bun run typecheck && ! git diff --name-only "$NOTHING_WORK_BASE" | rg 'electron/|src/lib/ipc|project-reader|ralphy/types' && git diff --check`

Expected: PASS. Reviewer confirms Media review production path is read-only and no Core/Desktop contract work exists.

- [ ] **Step 5: Commit**

```bash
git add src/screens/project/media-review-presentation.ts src/screens/project/MediaReviewConsole.tsx src/screens/project/MediaPanel.tsx src/styles/work-surfaces.css tests/project-media-review-presentation.test.tsx tests/project-screen-behavior.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: present read-only media review status"
```

### Task 14: Add the renderer-only UX test review session and safe shortcuts

**Files:**
- Create: `src/screens/project/mock-review-session.ts`
- Create: `src/screens/project/review-shortcuts.ts`
- Modify: `src/screens/project/MediaReviewConsole.tsx`
- Modify: `src/screens/project/MediaPanel.tsx`
- Modify: `src/instrument/test-fixtures.ts`
- Modify: `src/styles/work-surfaces.css`
- Test: `tests/mock-review-session.test.ts`
- Test: `tests/media-review-shortcuts.test.tsx`
- Test: `tests/project-media-review-presentation.test.tsx`

**Interfaces:** Consumes locked mock review interfaces and exact mock gate. Produces local reducer, Needs Work dialog, and `isReviewShortcutEligible(event, uiState)`.

- [ ] **Step 1: Write reducer/feedback/gating/reset tests**

```ts
expect(reduceMockReviewSession(initial, { type: "approve", artifactId: "art_1" }).reviews.art_1.verdict).toBe("approved");
expect(() => reduceMockReviewSession(emptyFeedback, { type: "submit-needs-work" })).toThrow(/Feedback is required/);
expect(resetAfterWorkspaceChange.reviews).toEqual({});
expect(isReviewShortcutEligible(keyEvent("a"), { mockSession: true, selected: true, overlayOpen: false })).toBe(true);
expect(isReviewShortcutEligible(keyEvent("a", { target: button }), safeState)).toBe(false);
```

Cover input/textarea/select/contenteditable/link/button/role controls, modal/menu/viewer, modifiers, `isComposing`, repeat, no selection, non-UX, false string, inactive iteration, Escape/focus return.

- [ ] **Step 2: Run RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/mock-review-session.test.ts tests/media-review-shortcuts.test.tsx tests/project-media-review-presentation.test.tsx`

Expected: FAIL because no isolated test review reducer/dialog/shortcut policy exists.

- [ ] **Step 3: Implement renderer-local session**

```ts
if (import.meta.env.VITE_RALPHY_ENABLE_MOCKS === "true" && workspace.name === "UX Testing Lab") {
  const { createMockReviewSession } = await import("./mock-review-session");
  setMockSession(createMockReviewSession(rootEpoch, workspace.id, project?.projectId ?? null));
}
```

Render `TEST REVIEW SESSION · NOT SAVED`; Approve/Reject record local verdict, Needs Work opens labelled dialog and requires trimmed feedback plus active fixture iteration. Keep state in component/reducer memory only; reset on root/workspace. Global shortcuts run only from the explicit non-interactive review shortcut region and call no controller/bridge.

- [ ] **Step 4: Run GREEN, production exclusion, and review**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/mock-review-session.test.ts tests/media-review-shortcuts.test.tsx tests/project-media-review-presentation.test.tsx && VITE_RALPHY_ENABLE_MOCKS=false bun run build:renderer && ! rg -a 'TEST REVIEW SESSION|mock-review-session|mock-iteration-1' dist && git diff --check`

Expected: PASS and false build contains no test-review strings/chunk. Reviewer verifies label, feedback/iteration semantics, reset, focus, and zero IPC/storage/files.

- [ ] **Step 5: Commit**

```bash
git add src/screens/project/mock-review-session.ts src/screens/project/review-shortcuts.ts src/screens/project/MediaReviewConsole.tsx src/screens/project/MediaPanel.tsx src/instrument/test-fixtures.ts src/styles/work-surfaces.css tests/mock-review-session.test.ts tests/media-review-shortcuts.test.tsx tests/project-media-review-presentation.test.tsx
gitleaks protect --staged --redact
git commit -m "test: add local media review session"
```

### Task 15: Rebuild high-fidelity Media grid, viewer, and external virtualization

**Files:**
- Modify: `src/screens/project/MediaPanel.tsx`
- Modify: `src/screens/project/MediaViewer.tsx`
- Modify: `src/components/VirtualAssetGrid.tsx`
- Modify: `src/components/media/ImageViewport.tsx`
- Modify: `src/components/media/VideoPlayer.tsx`
- Modify: `src/components/media/AudioWaveform.tsx`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/project-media-presentation.test.tsx`
- Test: `tests/media-grid.test.ts`
- Test: `tests/media-viewer.test.tsx`

**Interfaces:** Consumes shell scroll context, read-only/mock console, current paging/preview/viewer/generation/revision behavior. Produces 3a/3b geometry markers and external-scroll virtualizer.

- [ ] **Step 1: Write geometry/virtualizer/viewer interaction tests**

```ts
expect(mediaGeometry1440()).toMatchObject({ filterRow: 38, lanes: 4, laneGap: 10, rail: 292, selectedRing: 3 });
expect(virtualizer.getScrollElement()).toBe(instrumentScroll.element);
expect(document.querySelectorAll('[data-scroll-owner="route"]')).toHaveLength(0);
await user.hover(videoCard); expect(video).toHaveProperty("muted", true);
await user.tab(); expect(videoPreview).toBeVisible();
```

Cover filters/view/zoom, natural aspect ratios, selected badge, previous/next, generation/revision/failure, viewer/context menu, focus/Escape, no sound autoplay, dock/rail clearance, 1280/1100 column changes.

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/project-media-presentation.test.tsx tests/media-grid.test.ts tests/media-viewer.test.tsx`

Expected: FAIL on exact geometry markers, external scroll element, and focus-parity preview behavior.

- [ ] **Step 3: Implement iteration-3 geometry**

```tsx
const scroll = useInstrumentScroll();
const virtualizer = useVirtualizer({ count: cards.length, getScrollElement: () => scroll.element, estimateSize });
```

At 1440: 38px filter row, four masonry lanes/10px gaps, `#060606` media frames, captions outside, 3px selection ring/`IN CONSOLE`, 292px rail stack, dock clear. Use container thresholds for 1280/1100 and overlay rail. Preserve preview cache/scheduler, URL guards, media lifecycle, and actual callbacks.

- [ ] **Step 4: Run GREEN and Media reviewer gate**

Run: `bun run test -- tests/project-media-presentation.test.tsx tests/media-grid.test.ts tests/media-viewer.test.tsx tests/protocol-access.test.ts && bun run typecheck && bun run build && git diff --check`

Expected: PASS. Reviewer records bounding boxes at all viewports and validates selected/viewer/video/chat/dock states against stable 3a/3b reference; automated pixel diff is Plan 3.

- [ ] **Step 5: Commit**

```bash
git add src/screens/project/MediaPanel.tsx src/screens/project/MediaViewer.tsx src/components/VirtualAssetGrid.tsx src/components/media/ImageViewport.tsx src/components/media/VideoPlayer.tsx src/components/media/AudioWaveform.tsx src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/project-media-presentation.test.tsx tests/media-grid.test.ts tests/media-viewer.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild project media presentation"
```

### Task 16: Rebuild Units collection and selection states

**Files:**
- Modify: `src/screens/project/UnitsPanel.tsx`
- Modify: `src/screens/project/CompositionsPanel.tsx`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/units-panel.test.tsx`
- Test: `tests/composition-view.test.tsx`

**Interfaces:** Consumes current Unit/Composition list/filter/paging. Produces ready/loading/empty/partial/error/selected collection, with Compositions folded under Units.

- [ ] **Step 1: Write filter/paging/selection tests**

```tsx
await user.click(screen.getByRole("button", { name: "Ready" }));
expect(controller.setUnitFilter).toHaveBeenCalledWith("ready");
await user.click(screen.getByRole("button", { name: /Open unit/ }));
expect(selectedUnitId()).toBe(realUnit.id);
expect(renderInstrumentScenario("units.collection.partial").getByRole("status")).toHaveAccessibleDescription();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/units-panel.test.tsx tests/composition-view.test.tsx -t 'collection|filter|paging|selection'`

Expected: FAIL on Instrument collection interactions and state roots.

- [ ] **Step 3: Implement collection only**

```tsx
<main data-instrument-root="project-units"><UnitFilters /><UnitCollection items={page.items} /></main>
```

Preserve paging, selection, Composition entry, unavailable reasons, and one desk scroll owner. Detail/playback remain unchanged until Task 17.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/units-panel.test.tsx tests/composition-view.test.tsx && bun run typecheck && git diff --check`

Expected: PASS; reviewer checks all collection states and no fake counts/actions.

- [ ] **Step 5: Commit**

```bash
git add src/screens/project/UnitsPanel.tsx src/screens/project/CompositionsPanel.tsx src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/units-panel.test.tsx tests/composition-view.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild project unit collection"
```

### Task 17: Rebuild Unit detail, revisions, presentations, previews, and playback

**Files:**
- Modify: `src/screens/project/UnitViewer.tsx`
- Modify: `src/screens/project/UnitSocialPreview.tsx`
- Modify: `src/screens/project/ArtifactPreview.tsx`
- Modify: `src/components/ui/IPhoneMockup.tsx`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/unit-previews.test.ts`
- Test: `tests/unit-lifecycle.test.ts`
- Test: `tests/units-panel.test.tsx`

**Interfaces:** Consumes existing unit detail/revisions/presentations/preview/playback contracts. Produces focus-managed Unit viewer states.

- [ ] **Step 1: Write revision/presentation/playback tests**

```tsx
await openUnitViewer();
await user.click(screen.getByRole("button", { name: "Revision 2" }));
expect(controller.selectUnitRevision).toHaveBeenCalledWith(revision2.id);
await user.click(screen.getByRole("button", { name: "Play preview" }));
expect(player).toHaveProperty("muted", true);
await user.keyboard("{Escape}"); expect(unitCard).toHaveFocus();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/unit-previews.test.ts tests/unit-lifecycle.test.ts tests/units-panel.test.tsx -t 'detail|revision|presentation|preview|playback'`

Expected: FAIL on Instrument viewer hierarchy/focus and playback parity.

- [ ] **Step 3: Implement detail/viewer**

```tsx
<Dialog.Content data-instrument-root="unit-viewer"><UnitRevisionPicker /><UnitPresentation /><UnitPreview /></Dialog.Content>
```

Preserve current DTO truth, sealed/draft/build/evaluation states, media guards, preview aspect ratios, audio safety, and opener restoration.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/unit-previews.test.ts tests/unit-lifecycle.test.ts tests/units-panel.test.tsx tests/composition-view.test.tsx && bun run typecheck && git diff --check`

Expected: PASS; reviewer drives every registered Unit overlay/state at three widths.

- [ ] **Step 5: Commit**

```bash
git add src/screens/project/UnitViewer.tsx src/screens/project/UnitSocialPreview.tsx src/screens/project/ArtifactPreview.tsx src/components/ui/IPhoneMockup.tsx src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/unit-previews.test.ts tests/unit-lifecycle.test.ts tests/units-panel.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild unit detail and playback"
```

### Task 18: Rebuild Activity search/filter list on shell scrolling

**Files:**
- Modify: `src/screens/project/ActivityTimeline.tsx`
- Create: `src/screens/project/ActivityVirtualList.tsx`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/activity-timeline.test.tsx`
- Test: `tests/activity-sync.test.ts`

**Interfaces:** Consumes current activity sync/catch-up/order/search/filter. Produces external-scroll virtual list and list state roots.

- [ ] **Step 1: Write search/filter/virtual restore tests**

```tsx
await user.type(screen.getByRole("searchbox"), "render");
expect(controller.setActivityQuery).toHaveBeenCalledWith("render");
expect(activityVirtualizer.getScrollElement()).toBe(instrumentScroll.element);
navigateAwayAndBack();
expect(instrumentScroll.getOffset()).toBe(732);
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/activity-timeline.test.tsx tests/activity-sync.test.ts -t 'search|filter|virtual|restore|catch-up'`

Expected: FAIL on external shell-scroll virtualization and Instrument state roots.

- [ ] **Step 3: Implement list migration**

```tsx
const { element } = useInstrumentScroll();
const rows = useVirtualizer({ count: activities.length, getScrollElement: () => element, estimateSize: () => 52 });
```

Keep stable order/catch-up and technical availability; remove route-level vertical overflow.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/activity-timeline.test.tsx tests/activity-sync.test.ts && bun run typecheck && git diff --check`

Expected: PASS; reviewer checks all list states, catch-up, and restoration without nested scrollers.

- [ ] **Step 5: Commit**

```bash
git add src/screens/project/ActivityTimeline.tsx src/screens/project/ActivityVirtualList.tsx src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/activity-timeline.test.tsx tests/activity-sync.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild activity timeline"
```

### Task 19: Rebuild Activity run inspector and unavailable technical states

**Files:**
- Modify: `src/screens/project/ActivityTimeline.tsx`
- Modify: `src/screens/project/ActivityInspector.tsx`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/activity-timeline.test.tsx`
- Test: `tests/project-screen.test.tsx`

**Interfaces:** Consumes selected run/attempt details. Produces rail-owned inspector in docked/overlay modes.

- [ ] **Step 1: Write inspector rail/focus/unavailable tests**

```tsx
await selectRun();
expect(screen.getByRole("complementary", { name: "Run inspector" })).toBeVisible();
await openAt1100(); expect(screen.getByRole("dialog", { name: "Run inspector" })).toBeVisible();
expect(renderInstrumentScenario("activity.inspector.unavailable").getByRole("status")).toHaveTextContent("Unavailable");
await user.keyboard("{Escape}"); expect(runRow).toHaveFocus();
```

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/activity-timeline.test.tsx tests/project-screen.test.tsx -t 'run inspector|technical'`

Expected: FAIL on shared rail ownership and focus contract.

- [ ] **Step 3: Implement inspector portal**

```tsx
<InstrumentRightRailPortal owner="activity-inspector" label="Run inspector"><ActivityInspector detail={detail} /></InstrumentRightRailPortal>
```

Render only returned technical facts; missing attempts/cost/model become unavailable reasons. Preserve selected run through rail mode changes.

- [ ] **Step 4: Run GREEN and review**

Run: `bun run test -- tests/activity-timeline.test.tsx tests/project-screen.test.tsx && bun run typecheck && git diff --check`

Expected: PASS; reviewer checks docked/overlay/unavailable/error and selection retention.

- [ ] **Step 5: Commit**

```bash
git add src/screens/project/ActivityTimeline.tsx src/screens/project/ActivityInspector.tsx src/styles/work-surfaces.css src/instrument/test-fixtures.ts tests/activity-timeline.test.tsx tests/project-screen.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild activity inspection"
```

### Task 20: Close the rendered Work route/state/overlay matrix

**Files:**
- Modify: `src/instrument/scenarios.ts`
- Modify: `src/instrument/test-fixtures.ts`
- Test: `tests/work-scenario-completeness.test.tsx`
- Test: `tests/instrument-scroll-owners.test.tsx`
- Test: `tests/instrument-accessibility-journeys.test.tsx`

**Interfaces:** Consumes all Plan 2 surfaces and Plan 1 manifest. Produces complete rendered Work scenario coverage ready for real Electron audit.

- [ ] **Step 1: Write failing exhaustive rendered checks**

```ts
for (const scenario of workScenarios()) {
  const view = renderInstrumentScenario(scenario.id);
  expect(view.container.querySelector(`[data-instrument-root="${scenario.rootMarker}"]`)).not.toBeNull();
  expectVisibleLandmarks(view, scenario.landmarks);
  expectRailOwner(view, scenario.railOwner);
  expectScrollOwner(view, scenario.scrollOwner);
}
expect(missingRegisteredOverlays()).toEqual([]);
```

Run keyboard, reduced-motion, and live-region journeys named by each scenario, including all dialogs/sheets/viewers/context menus and focus return.

- [ ] **Step 2: Run RED**

Run: `bun run test -- tests/work-scenario-completeness.test.tsx tests/instrument-scroll-owners.test.tsx tests/instrument-accessibility-journeys.test.tsx`

Expected: FAIL with exact missing route/state/overlay IDs or interaction journeys, never a copy-only failure.

- [ ] **Step 3: Complete manifest fixtures and markers**

```ts
export const WORK_SCENARIO_IDS = INSTRUMENT_SCENARIOS.filter(({ routeKey }) => routeKey.startsWith("startup.") || routeKey.startsWith("workspace.") || routeKey.startsWith("project.") || routeKey.startsWith("settings."));
```

Add only missing deterministic payloads/landmarks/markers; do not weaken expectations. Ensure modal-local scrollers are explicitly marked and all route virtualizers use the desk owner.

- [ ] **Step 4: Run GREEN and final Work review**

Run: `bun run test -- tests/work-scenario-completeness.test.tsx tests/instrument-scroll-owners.test.tsx tests/instrument-accessibility-journeys.test.tsx tests/project-media-presentation.test.tsx tests/mock-review-session.test.ts && bun run typecheck && VITE_RALPHY_ENABLE_MOCKS=false bun run build && ! rg -a 'TEST REVIEW SESSION|mock-review-session|instrument-test-fixture' dist && git diff --check`

Expected: PASS; production excludes fixtures; independent reviewer signs every Work scenario and explicitly confirms no `media.review`/session/Core/DB change.

- [ ] **Step 5: Commit**

```bash
git add src/instrument/scenarios.ts src/instrument/test-fixtures.ts tests/work-scenario-completeness.test.tsx tests/instrument-scroll-owners.test.tsx tests/instrument-accessibility-journeys.test.tsx
gitleaks protect --staged --redact
git commit -m "test: close work scenario coverage"
```

## Work Surfaces Completion Gate

Run: `bun run test && bun run typecheck && VITE_RALPHY_ENABLE_MOCKS=false bun run build && ! git diff --name-only "$NOTHING_WORK_BASE" | rg 'electron/|src/lib/ipc|project-reader|ralphy/types' && git diff --check && git log --oneline "$NOTHING_WORK_BASE..HEAD"`

Expected: all checks pass or only a pre-recorded baseline remains; 20 scoped commits exist; all Work routes/states/overlays render through Instrument contracts; production Media is read-only; mock review is excluded from production; Plan 3 may begin.
