# Nothing Work Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every startup, My Work, and Project presentation state inside the Instrument shell, including the high-fidelity Media 3a/3b experience and real Core-backed A/N/R review.

**Architecture:** Preserve the existing route reducers, scoped controllers, readers, bridge DTOs, media protocol, and domain mutations. Route components keep their current state machines but emit Instrument headers/widgets; the sole contract adapter added here exposes Core v3's already-released `media.review` through the current guarded Project reader and controller.

**Tech Stack:** Electron 43.2.0 with embedded Node 24.18.0, React 19, resolved TypeScript 5.9.3 (declared `^5.7.3`), Bun 1.3, Vitest 0.34.6, Motion, Radix Dialog/Select, Lucide React, `@tanstack/react-virtual` 3.5.0, existing media viewers, CSS container queries.

**Spec:** `docs/superpowers/specs/2026-08-20-nothing-os-redesign-design.md`

**Prerequisite:** Complete `docs/superpowers/plans/2026-08-20-nothing-foundation-shell.md` and verify its Stable Interface Lock before Task 1.

**Visual evidence:** `/tmp/ralphy-nothing-os.SYlRcI/design_handoff_instrument/README.md`, `/tmp/ralphy-nothing-os.SYlRcI/design_handoff_instrument/design-v2.md`, final sections `3a` / `3b` of the HTML handoff, and the current route-specific documents under `docs/design/` for functional state/layout evidence only.

## Global Constraints

- Work only in `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/.worktrees/nothing-os-redesign` on `codex/nothing-os-redesign`; start after the reviewed Plan 1 acceptance gate.
- This is a presentation rewrite. Reuse the current Core v3 contract, Electron security boundary, readers, controllers, workbench/Marketplace reducers, media protocol, root fencing, MIME allowlists, clipboard bounds, and fixed Marketplace origins.
- Do not add a Core method, database migration, direct SQLite access, renderer filesystem access, renderer network access, sibling checkout import, prototype runtime, remote asset/font, or new package.
- Import `Availability<T>`, `InstrumentScreenHeader`, `InstrumentEmptyState`, `InstrumentPill`, `InstrumentWidget`, `InstrumentCounter`, `StatusDot`, `InstrumentRightRailPortal`, and `ProjectDock` from Plan 1. Do not define route-local substitutes.
- Theme preference remains exactly `system | dark | light`; screens read the resolved palette and never own local theme state. Light desk is `#E2E4EA`; dark desk is `#050505`; alert red is `#E0362C`.
- App chrome remains flat: no elevation shadow, blur, glass, inset highlight, decorative border, depth gradient, legacy purple accent, or route-specific palette. Content canvases use explicit media/content tokens.
- Geometry remains 8px outer padding/gap, 24px widgets, 999px pills/circles, 240px left stack, 292px right rail, 1440x900 fidelity anchor, 1280x800 adaptive state, and 1100x720 minimum with no horizontal body overflow.
- Each route owns at most one vertical desk scroller. Grids respond to measured desk width; detail columns stack at 760px desk width. Portal content fits inside the viewport.
- Every screen state is truthful. Missing, partial, unavailable, offline, loading, empty, and error states expose exact reasons; absence never becomes a zero, fake progress, fake notification, enabled no-op, or invented action.
- Project/workspace controller snapshots remain fenced by root epoch and selected IDs. Clear selection, inspector, island, and screen snapshots when root/workspace/project changes; stale completions cannot repaint a new scope.
- Icon controls have accessible names/tooltips/visible 2px focus. Dialog/drawer/viewer focus is visible, Escape closes, and opener focus returns with `{ preventScroll: true }`. Status is never color-only.
- A/N/R shortcuts run only for a selected reviewable Artifact, never while an input, textarea, select, contenteditable, or dialog control has focus. Hover-only media behavior has focus parity; video never autoplays with sound.
- The UX Testing Lab Dynamic Island fixture remains renderer-only under `VITE_RALPHY_ENABLE_MOCKS=true`; no route task may import it or write the database.
- Use Bun. Every task follows RED to GREEN, receives an independent task review, runs `git diff --check`, stages only its files, runs `gitleaks protect --staged --redact`, and commits before the next task.

---

Before Task 1, record `NOTHING_WORK_BASE=$(git rev-parse HEAD)` in the executor's progress notes. Do not commit those notes.

## Consumed Plan 1 Interfaces

These signatures are locked and must be imported verbatim:

```ts
export type Availability<T> =
  | { status: "ready"; value: T }
  | { status: "partial"; value: T; reason: string }
  | { status: "empty"; reason: string }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };

export interface InstrumentScreenHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  filters?: React.ReactNode;
  counters?: React.ReactNode;
  actions?: React.ReactNode;
}

export function InstrumentRightRailPortal(props: { children: React.ReactNode }): React.ReactPortal | null;
export function ProjectDock<Id extends string>(props: {
  active: Id;
  items: readonly ProjectDockItem<Id>[];
  onSelect(id: Id): void;
}): React.ReactElement;
```

## File Map

- `src/styles/work-surfaces.css` — shared route widget/grid/detail geometry only; palette comes from Plan 1 tokens.
- `src/screens/LibraryScreen.tsx`, `WelcomeScreen.tsx`, and `MigrationRecoveryScreen.tsx` — startup/global truth states.
- `src/screens/workspace/*` and `WorkspaceProjectsScreen.tsx` — workspace overview/project collection instruments.
- `src/screens/SharedLibraryScreen.tsx` and `src/screens/shared-library/*` — results, inspector, viewer, revision, failure, and workflow states.
- `src/screens/MemoryScreen.tsx` — list, rulebook detail, proposal review, recall/history, and capability states.
- `src/screens/CalendarScreen.tsx` — month/week/agenda, drawer, inspector, schedule/platform/account states.
- `electron/ralphy/project-reader.ts` plus existing IPC layers — guarded adapter to released Core `media.review`; no Core source change.
- `src/state/project-screen-controller.ts` — existing Project state plus review request/error/evaluation reconciliation.
- `src/screens/project/*` — Documents, Media, Units, Activity, viewers, and inspectors.

### Task 1: Rebuild startup, Home Library, migration, and app-level states

**Files:**
- Create: `src/styles/work-surfaces.css`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/WelcomeScreen.tsx`
- Modify: `src/screens/LibraryScreen.tsx`
- Modify: `src/screens/MigrationRecoveryScreen.tsx`
- Test: `tests/instrument-global-states.test.tsx`
- Test: `tests/migration-recovery.test.tsx`
- Test: `tests/workbench-state.test.ts`

**Interfaces:**
- Consumes: Plan 1 shell/primitives, existing `restoreHomeLibrary`, `CatalogResult | null`, `MigrationRecovery`, workbench restoration, root-selection callback, and app error dismissal.
- Produces: Instrument states for welcome/restoring, Home Library loading/unavailable/error, empty library/root selection, migration recovery, catalog refresh failure, and app alerts. No new state source or bridge method.

- [ ] **Step 1: Write failing startup/global state tests**

```tsx
expect(renderWelcome({ restoring: true })).toContain('aria-busy="true"');
expect(renderLibrary({ catalog: null, restoring: false, error: "Core unavailable" })).toContain("Core unavailable");
expect(renderLibrary({ catalog: emptyCatalog })).toContain("Choose a Ralphy root");
expect(renderMigration()).toContain("Migration recovery");
expect(renderMigration()).toContain("Copy recovery command");
expect(renderAppAlert("Refresh failed")).toContain('role="alert"');
expect(globalCss).not.toMatch(/box-shadow|backdrop-filter|linear-gradient|#8b7cf6/i);
```

Exercise Retry/Dismiss/Copy callbacks and assert unavailable actions remain focusable with `aria-describedby` reasons.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `bun run test -- tests/instrument-global-states.test.tsx tests/migration-recovery.test.tsx tests/workbench-state.test.ts`

Expected: FAIL because startup/global routes still render legacy chrome and lack Instrument semantics.

- [ ] **Step 3: Implement the truthful global surfaces**

```tsx
<InstrumentEmptyState
  title={error ? "Home Library unavailable" : "Choose a Ralphy root"}
  reason={error ?? "Select a local Ralphy root to load workspaces and projects."}
  action={error ? <InstrumentPill onClick={onRetry}>Retry</InstrumentPill> : undefined}
  busy={restoring}
  error={Boolean(error)}
/>
```

Keep the existing welcome minimum/exit timing and restoration flow. Use a local mascot/dither mark after verifying the SVG has a useful title/hidden treatment. Migration Recovery remains a blocking screen and invokes only the current bounded clipboard callback. App alerts stay above the desk, use red only for failure/destructive meaning, and never duplicate the same message in a live region.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/instrument-global-states.test.tsx tests/migration-recovery.test.tsx tests/workbench-state.test.ts && bun run typecheck && git diff --check`

Expected: suites pass; reviewer verifies every startup branch in `App.tsx` maps to an explicit Instrument state and navigation/restoration behavior is unchanged.

- [ ] **Step 5: Commit global surfaces**

```bash
git add src/styles/work-surfaces.css src/main.tsx src/App.tsx src/components/WelcomeScreen.tsx src/screens/LibraryScreen.tsx src/screens/MigrationRecoveryScreen.tsx tests/instrument-global-states.test.tsx tests/migration-recovery.test.tsx tests/workbench-state.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild instrument startup states"
```

### Task 2: Rebuild Workspace Overview, Projects, and honest Units placeholder

**Files:**
- Modify: `src/screens/WorkspaceScreen.tsx`
- Modify: `src/screens/WorkspaceProjectsScreen.tsx`
- Modify: `src/screens/workspace/WorkspaceOverviewHeader.tsx`
- Modify: `src/screens/workspace/WorkspacePerformance.tsx`
- Modify: `src/screens/workspace/WorkspacePlanAndOutcomes.tsx`
- Modify: `src/screens/workspace/WorkspaceInsights.tsx`
- Modify: `src/screens/workspace/WorkspaceOperations.tsx`
- Modify: `src/screens/workspace/overview-presentation.ts`
- Modify: `src/styles/work-surfaces.css`
- Test: `tests/workspace-overview-screen.test.tsx`
- Test: `tests/workspace-overview-presentation.test.ts`
- Test: `tests/workspace-overview-navigation.test.tsx`
- Test: `tests/workspace-domain.test.tsx`

**Interfaces:**
- Consumes: unchanged `WorkspaceScreenController`, `WorkspaceOverviewPresentation`, Plan 1 `Availability<T>`, catalog `ProjectSummary[]`, current navigation/return-state callbacks, and truthful summary counts.
- Produces: Instrument performance, plan/outcomes, insights, operations, attention, project cards, and `WorkspacePagePlaceholder` for Units with an explicit missing-contract reason.

- [ ] **Step 1: Add failing overview/project/placeholder tests**

```tsx
expect(populated).toContain("Performance");
expect(populated).toContain("Plan and outcomes");
expect(populated).toContain("What works");
expect(populated).toContain("Operations");
expect(populated).toContain("Attention");
expect(partial).toContain("Calendar status unavailable");
expect(projects).toContain('class="instrument-project-card"');
expect(unitsPlaceholder).toContain("Workspace Units are unavailable from the current contract");
expect(unitsPlaceholder).not.toMatch(/Create unit|0 units available/i);
```

Verify overview destination Back restores the recorded scroll/expanded state and opener focus.

- [ ] **Step 2: Run Workspace tests and verify RED**

Run: `bun run test -- tests/workspace-overview-screen.test.tsx tests/workspace-overview-presentation.test.ts tests/workspace-overview-navigation.test.tsx tests/workspace-domain.test.tsx`

Expected: FAIL because route composition and cards retain legacy continuous panels.

- [ ] **Step 3: Compose the existing presentation into Instrument widgets**

```tsx
<InstrumentScreenHeader
  eyebrow="My Work"
  title={workspaceName}
  counters={<InstrumentCounter value={catalogProjects.length} label="Projects" />}
  actions={refreshing ? <span role="status">Refreshing</span> : undefined}
/>
```

In `overview-presentation.ts`, delete its narrower local `Availability<T>` declaration and import the exact Plan 1 type from `../../instrument/types`; do not change projection math or availability decisions. Each major overview section becomes a separate widget with its existing empty/partial/error reason. Projects render adaptive cards and real status/count facts only. Workspace Units remains the existing placeholder surfaced as unavailable until a workspace-unit contract exists; it has no enabled fake creation/list action.

- [ ] **Step 4: Run GREEN checks and independent route review**

Run: `bun run test -- tests/workspace-overview-screen.test.tsx tests/workspace-overview-presentation.test.ts tests/workspace-overview-navigation.test.tsx tests/workspace-domain.test.tsx tests/workspace-navigation.test.tsx && bun run typecheck && git diff --check`

Expected: suites pass; reviewer traces every `Availability` branch and confirms no unavailable value renders as an empty metric/card.

- [ ] **Step 5: Commit Workspace surfaces**

```bash
git add src/screens/WorkspaceScreen.tsx src/screens/WorkspaceProjectsScreen.tsx src/screens/workspace/WorkspaceOverviewHeader.tsx src/screens/workspace/WorkspacePerformance.tsx src/screens/workspace/WorkspacePlanAndOutcomes.tsx src/screens/workspace/WorkspaceInsights.tsx src/screens/workspace/WorkspaceOperations.tsx src/screens/workspace/overview-presentation.ts src/styles/work-surfaces.css tests/workspace-overview-screen.test.tsx tests/workspace-overview-presentation.test.ts tests/workspace-overview-navigation.test.tsx tests/workspace-domain.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild workspace instruments"
```

### Task 3: Rebuild Shared Library results, inspector, viewer, and workflows

**Files:**
- Modify: `src/screens/SharedLibraryScreen.tsx`
- Modify: `src/screens/shared-library/SharedLibraryToolbar.tsx`
- Modify: `src/screens/shared-library/SharedArtifactInspector.tsx`
- Modify: `src/screens/shared-library/SharedArtifactPreview.tsx`
- Modify: `src/screens/shared-library/SharedArtifactViewer.tsx`
- Modify: `src/screens/shared-library/SharedLibraryWorkflows.tsx`
- Modify: `src/screens/shared-library/presentation.ts`
- Modify: `src/styles/shared-library.css`
- Modify: `src/styles/work-surfaces.css`
- Test: `tests/shared-library-screen.test.tsx`
- Test: `tests/shared-library-inspector.test.tsx`
- Test: `tests/shared-library-viewer.test.tsx`
- Test: `tests/shared-library-workflows.test.tsx`
- Test: `tests/shared-library-presentation.test.ts`

**Interfaces:**
- Consumes: unchanged `SharedLibraryController`, current guarded preview/actions, revision selection, workflow capability reasons, and Plan 1 `Availability<T>`.
- Produces: Instrument results/grid-list, selected inspector in `InstrumentRightRailPortal` at wide widths, bounded viewer, revision/history, workflow dialogs, and explicit missing/failed preview states.

- [ ] **Step 1: Add failing Shared Library Instrument tests**

```tsx
expect(ready).toContain("Shared Library");
expect(ready).toContain('class="instrument-screen-header"');
expect(selected).toContain('data-right-rail-kind="shared-library"');
expect(noTarget).toContain("Preview unavailable because this artifact has no selected target");
expect(failedPreview).toContain('role="alert"');
expect(workflow).toContain('role="dialog"');
expect(workflow).toContain("Unavailable from this Core version");
```

Assert selected artifact/query/scroll survive inspector open/close and focus returns to the exact card.

- [ ] **Step 2: Run Shared Library tests and verify RED**

Run: `bun run test -- tests/shared-library-screen.test.tsx tests/shared-library-inspector.test.tsx tests/shared-library-viewer.test.tsx tests/shared-library-workflows.test.tsx tests/shared-library-presentation.test.ts`

Expected: FAIL because Shared Library still uses its legacy palette/layout and local availability type.

- [ ] **Step 3: Migrate presentation and surfaces without changing controller truth**

```ts
import type { Availability } from "../../instrument/types";
```

Delete the route-local `Availability` declaration and import the locked superset. Use Instrument filter pills/header/counters. Portal the existing inspector only when selected and wide; at desk width <=760px use the existing full sheet/route treatment. Keep all current non-mutating workflow reasons, guarded media tokens, revision CAS, loading-more/page error/refresh error states, and missing-media fallbacks.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/shared-library-controller.test.ts tests/shared-library-screen.test.tsx tests/shared-library-inspector.test.tsx tests/shared-library-viewer.test.tsx tests/shared-library-workflows.test.tsx tests/shared-library-presentation.test.ts tests/protocol-access.test.ts && bun run typecheck && git diff --check`

Expected: suites pass; reviewer confirms no path/locator enters React and all unsupported workflows remain explanatory, not enabled no-ops.

- [ ] **Step 5: Commit Shared Library presentation**

```bash
git add src/screens/SharedLibraryScreen.tsx src/screens/shared-library/SharedLibraryToolbar.tsx src/screens/shared-library/SharedArtifactInspector.tsx src/screens/shared-library/SharedArtifactPreview.tsx src/screens/shared-library/SharedArtifactViewer.tsx src/screens/shared-library/SharedLibraryWorkflows.tsx src/screens/shared-library/presentation.ts src/styles/shared-library.css src/styles/work-surfaces.css tests/shared-library-screen.test.tsx tests/shared-library-inspector.test.tsx tests/shared-library-viewer.test.tsx tests/shared-library-workflows.test.tsx tests/shared-library-presentation.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild shared library instruments"
```

### Task 4: Rebuild Memory list, rulebook, reviews, history, and unavailable states

**Files:**
- Modify: `src/screens/MemoryScreen.tsx`
- Modify: `src/styles/work-surfaces.css`
- Test: `tests/memory-screen.test.tsx`
- Test: `tests/memory-contract.test.ts`

**Interfaces:**
- Consumes: current Memory bridge calls, exact `MemoryDetailDto`/health/recall/history data, existing mutation/retry/focus behavior, and Plan 1 primitives.
- Produces: Instrument Memory header/filter/list, rulebook detail, proposed review, add/revise/retire confirmations, recall/history drawers, health/unavailable states, and exact mutation errors.

- [ ] **Step 1: Add failing Memory state tests**

```tsx
expect(list).toContain("Memory");
expect(list).toContain("Rulebook");
expect(proposed).toContain("Approve");
expect(proposed).toContain("Reject");
expect(missingNegativeScope).toContain("Does NOT apply to");
expect(unavailable).toContain("Recall unavailable");
expect(error).toContain('role="alert"');
```

Cover active/proposed/rejected/archived filtering, add/revise, version history, recall preview, curation health, empty, loading, error, selection preservation, and focus restoration.

- [ ] **Step 2: Run Memory tests and verify RED**

Run: `bun run test -- tests/memory-screen.test.tsx tests/memory-contract.test.ts`

Expected: FAIL on Instrument class/state expectations.

- [ ] **Step 3: Implement Memory Instrument composition**

```tsx
<InstrumentScreenHeader
  eyebrow="My Work"
  title="Memory"
  description={`${workspaceName} rulebook and review queue`}
  filters={memoryFilters}
  actions={recallAction}
/>
```

Keep the current Core mutation contracts and feedback body rules. Status filters and list stay in the desk; existing detail/review uses the right rail only where an inspector already exists. Render the mandatory rule/Why/How to apply/Does NOT apply to body structure distinctly without inventing content. Retire remains destructive red; Approve is the dominant inversion action; unavailable Restore remains absent because Core does not support it.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/memory-screen.test.tsx tests/memory-contract.test.ts tests/design-system.test.ts && bun run typecheck && git diff --check`

Expected: suites pass; reviewer confirms mutation semantics and trust-boundary validation are unchanged.

- [ ] **Step 5: Commit Memory presentation**

```bash
git add src/screens/MemoryScreen.tsx src/styles/work-surfaces.css tests/memory-screen.test.tsx tests/memory-contract.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild memory instruments"
```

### Task 5: Rebuild Calendar views, inspector, drawers, and scheduling

**Files:**
- Modify: `src/screens/CalendarScreen.tsx`
- Modify: `src/screens/calendar-presentation.ts`
- Modify: `src/styles/work-surfaces.css`
- Test: `tests/calendar-screen.test.tsx`
- Test: `tests/calendar-presentation.test.ts`
- Test: `tests/calendar-contract.test.ts`

**Interfaces:**
- Consumes: unchanged Calendar range/presentation helpers, `CalendarWorkspaceDto`, existing load/mutate/reconnect/preview bridge calls, navigation context, and project-open callback.
- Produces: Instrument month/week/agenda, event inspector, ready-to-schedule drawer, scheduling flow, platform settings, account/disconnected/partial/error states.

- [ ] **Step 1: Add failing Calendar surface/state tests**

```tsx
expect(month).toContain("Month");
expect(month).toContain("Week");
expect(month).toContain("Agenda");
expect(readyDrawer).toContain("Ready to schedule");
expect(scheduleDialog).toContain("Platform settings");
expect(partial).toContain("Partially published");
expect(disconnected).toContain("Reconnect");
expect(accountUnavailable).toContain("Account data unavailable");
```

Cover draft/scheduled/uploading/published/partial/failed cards, inspector actions, schedule preflight, drag-to-prefilled-schedule (never immediate publish), modal focus, Escape, and opener restoration.

- [ ] **Step 2: Run Calendar tests and verify RED**

Run: `bun run test -- tests/calendar-screen.test.tsx tests/calendar-presentation.test.ts tests/calendar-contract.test.ts`

Expected: FAIL because Calendar retains legacy screen/modal presentation.

- [ ] **Step 3: Implement adaptive Calendar instruments**

```tsx
<InstrumentScreenHeader
  eyebrow="My Work"
  title="Calendar"
  filters={viewAndFilterPills}
  counters={<InstrumentCounter value={visibleEvents.length} label="Events" />}
  actions={<InstrumentPill dominant onClick={openReadyDrawer}>Ready to schedule</InstrumentPill>}
/>
```

Use one desk scroller, adaptive month/week/agenda layout, existing event inspector and schedule dialog semantics, per-channel status text/icons, and explicit platform/account capability reasons. Move the existing inspector into `InstrumentRightRailPortal` only on wide layouts. Preserve successful channel results on partial failure and retry only failed channels.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/calendar-screen.test.tsx tests/calendar-presentation.test.ts tests/calendar-contract.test.ts tests/workspace-overview-navigation.test.tsx && bun run typecheck && git diff --check`

Expected: suites pass; reviewer confirms no drag/drop or schedule control bypasses the current mutation/preflight contract.

- [ ] **Step 5: Commit Calendar presentation**

```bash
git add src/screens/CalendarScreen.tsx src/screens/calendar-presentation.ts src/styles/work-surfaces.css tests/calendar-screen.test.tsx tests/calendar-presentation.test.ts tests/calendar-contract.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild calendar instruments"
```

### Task 6: Expose the released Core media.review contract through Desktop

**Files:**
- Modify: `electron/ralphy/project-reader.ts`
- Modify: `electron/media/types.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/state/project-screen-controller.ts`
- Test: `tests/project-reader.test.ts`
- Test: `tests/ipc-security.test.ts`
- Test: `tests/ralphy-current-core.test.ts`
- Test: `tests/project-screen-behavior.test.tsx`

**Interfaces:**
- Consumes: already-declared Core `ParamsFor<"media.review">` / `ResultFor<"media.review">`, existing Project context/root fencing, DTO validators, controller stale-request handling, and selected Artifact CAS.
- Produces:

```ts
export type ProjectMediaVerdict = "approved" | "needs-work" | "rejected";
export interface ProjectMediaReviewInput {
  artifactId: string;
  expectedSelectedRevisionId: string;
  verdict: ProjectMediaVerdict;
}

// MediaWorkbenchBridge
reviewProjectMedia(project: ProjectReference, input: ProjectMediaReviewInput): Promise<MediaReviewResult>;

// ProjectScreenSnapshot additions
mediaReview: {
  status: "idle" | "saving" | "error";
  artifactId: string | null;
  error: string | null;
};
mediaEvaluations: Record<string, EvaluationDto>;

// ProjectScreenController addition
reviewSelectedMedia(verdict: ProjectMediaVerdict): Promise<void>;

// electron/ralphy/project-reader.ts internal trust-boundary validator
function validateMediaReviewResult(
  value: unknown,
  context: ProjectRef,
  artifactId: string,
  expectedSelectedRevisionId: string,
  expectedVerdict: ProjectMediaVerdict,
): MediaReviewResult;
```

- [ ] **Step 1: Write failing reader/IPC/controller tests**

```ts
await reader.reviewMedia(project, {
  artifactId: "art_1",
  expectedSelectedRevisionId: "arev_1",
  verdict: "needs-work",
});
expect(request).toHaveBeenCalledWith("media.review", {
  context: project,
  ref: { type: "artifact", id: "art_1" },
  expectedSelectedRevisionId: "arev_1",
  verdict: "needs-work",
});
await expect(reader.reviewMedia(project, { artifactId: "", expectedSelectedRevisionId: "arev_1", verdict: "approved" })).rejects.toThrow(/review/i);
```

Assert IPC rejects unknown keys/verdicts/IDs, untrusted/stale senders, wrong-scope result cards/evaluations/revisions, and mismatched selected revision. Assert controller disables non-Artifact/unselected review, suppresses double submit, reconciles returned card/evaluation into the selected item and current page, exposes errors, and ignores late results after dispose/root change.

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `bun run test -- tests/project-reader.test.ts tests/ipc-security.test.ts tests/ralphy-current-core.test.ts tests/project-screen-behavior.test.tsx`

Expected: FAIL because Desktop does not expose `media.review` and the controller lacks review state/methods.

- [ ] **Step 3: Implement the narrow existing-contract adapter**

```ts
async reviewMedia(project: ProjectRef, input: ProjectMediaReviewInput): Promise<MediaReviewResult> {
  const context = projectContext(project);
  if (!validGenerationId(input.artifactId)) throw new Error("Invalid Artifact identifier");
  if (!validGenerationId(input.expectedSelectedRevisionId)) throw new Error("Invalid selected revision identifier");
  if (!["approved", "needs-work", "rejected"].includes(input.verdict)) throw new Error("Invalid Media review verdict");
  const value = await request("media.review", {
    context,
    ref: { type: "artifact", id: input.artifactId },
    expectedSelectedRevisionId: input.expectedSelectedRevisionId,
    verdict: input.verdict,
  });
  return validateMediaReviewResult(value, context, input.artifactId, input.expectedSelectedRevisionId, input.verdict);
}
```

Register one IPC channel, validate exact input keys in main, unwrap only the validated DTO in preload, and add an explicit mock-mode unavailable rejection rather than a fake success. `validateMediaReviewResult` must accept exact result keys only, then prove: `card.ref` is the requested Artifact and card scope is the current project; `card.selectedRevisionId` is the expected selected revision; `revision.id` equals that selected revision and `revision.artifactId` equals the requested Artifact; `evaluation` is current-project scoped, targets `{ type: "artifact_revision", id: revision.id }`, and has the requested verdict; `feedback` is null or has `projectId === context.projectId`. Reuse existing field-level DTO validators and root checks. Do not change Core source/schema or write SQLite directly.

- [ ] **Step 4: Run GREEN security/controller checks and reviewer gate**

Run: `bun run test -- tests/project-reader.test.ts tests/ipc-security.test.ts tests/ralphy-current-core.test.ts tests/project-screen-behavior.test.tsx && bun run typecheck && git diff --check`

Expected: suites pass; security reviewer confirms renderer inputs are IDs/enums only, Core remains the sole mutation authority, and stale-root/result checks wrap the whole request.

- [ ] **Step 5: Commit the review adapter**

```bash
git add electron/ralphy/project-reader.ts electron/media/types.ts electron/preload.ts electron/main.ts src/lib/ipc.ts src/state/project-screen-controller.ts tests/project-reader.test.ts tests/ipc-security.test.ts tests/ralphy-current-core.test.ts tests/project-screen-behavior.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: expose project media review"
```

### Task 7: Rebuild Project Documents list, search, editor, viewer, and conflicts

**Files:**
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/screens/project/DocumentsPanel.tsx`
- Modify: `src/components/MarkdownView.tsx`
- Modify: `src/components/JsonDocumentView.tsx`
- Modify: `src/styles/work-surfaces.css`
- Test: `tests/documents-panel.test.tsx`
- Test: `tests/markdown-view.test.tsx`
- Test: `tests/project-screen-behavior.test.tsx`

**Interfaces:**
- Consumes: unchanged document controller methods/snapshot, guarded preview text, exact `DocumentDraft`, search paging, save conflict state, and Plan 1 project dock/header/primitives.
- Produces: Instrument Documents list/search, Markdown/JSON/text viewer, editor, revision/conflict UI, loading/error/empty states, and document-saving navigation guard.

- [ ] **Step 1: Add failing Documents presentation tests**

```tsx
expect(list).toContain("Documents");
expect(list).toContain('aria-label="Search project documents"');
expect(markdown).toContain('class="instrument-document-viewer"');
expect(json).toContain("JSON");
expect(conflict).toContain("Document changed since editing began");
expect(conflict).toContain("Review latest");
expect(empty).toContain("No documents yet");
```

Exercise search loading/append error, select/view/edit/cancel/save, JSON validation, dirty navigation confirmation, conflict review, revisions, and focus restoration.

- [ ] **Step 2: Run Documents tests and verify RED**

Run: `bun run test -- tests/documents-panel.test.tsx tests/markdown-view.test.tsx tests/project-screen-behavior.test.tsx -t "document|Documents"`

Expected: FAIL on new Instrument selectors/semantics.

- [ ] **Step 3: Implement Documents Instrument layout**

```tsx
<InstrumentScreenHeader
  eyebrow={projectName}
  title="Documents"
  filters={searchControl}
  counters={<InstrumentCounter value={page.items.length} label="Loaded" />}
  actions={documentActions}
/>
```

Keep search/editor/controller logic unchanged. Use a desk list plus detail widget above 760px and stacked layout at/below 760px. Viewer content keeps content contrast and bounded line length. Save is the single dominant pill only in edit mode; conflict/error uses alert red and explicit recovery. No document path or untrusted raw HTML is rendered.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/documents-panel.test.tsx tests/markdown-view.test.tsx tests/project-screen-behavior.test.tsx tests/project-screen.test.tsx && bun run typecheck && git diff --check`

Expected: suites pass; reviewer confirms dirty/conflict/data-loss protections remain intact.

- [ ] **Step 5: Commit Documents presentation**

```bash
git add src/screens/ProjectScreen.tsx src/screens/project/DocumentsPanel.tsx src/components/MarkdownView.tsx src/components/JsonDocumentView.tsx src/styles/work-surfaces.css tests/documents-panel.test.tsx tests/markdown-view.test.tsx tests/project-screen-behavior.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild project documents"
```

### Task 8: Implement the high-fidelity Media 3a/3b surface and review console

**Files:**
- Create: `src/screens/project/MediaReviewConsole.tsx`
- Modify: `src/screens/project/MediaPanel.tsx`
- Modify: `src/screens/project/MediaViewer.tsx`
- Modify: `src/components/VirtualAssetGrid.tsx`
- Modify: `src/components/media/ImageViewport.tsx`
- Modify: `src/components/media/VideoPlayer.tsx`
- Modify: `src/components/media/AudioWaveform.tsx`
- Modify: `src/state/project-screen-controller.ts`
- Modify: `src/styles/work-surfaces.css`
- Test: `tests/project-media-presentation.test.tsx`
- Test: `tests/media-grid.test.ts`
- Test: `tests/project-screen-behavior.test.tsx`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: Task 6 `reviewSelectedMedia`, `mediaReview`, and `mediaEvaluations`; existing Media query/paging/preview/viewer/generation/revision actions; Plan 1 rail portal/status primitives; exact 3a/3b visual evidence.
- Produces:

```ts
export function mediaReviewTone(card: MediaCardDto, evaluation?: EvaluationDto): "approved" | "needs-work" | "rejected" | "unreviewed";
export function editableTarget(target: EventTarget | null): boolean;
export function MediaReviewConsole(props: {
  card: MediaCardDto;
  evaluation?: EvaluationDto;
  saving: boolean;
  error: string | null;
  onReview(verdict: ProjectMediaVerdict): void;
  onPrevious(): void;
  onNextUnreviewed(): void;
}): React.ReactElement;
```

- [ ] **Step 1: Add failing high-fidelity and keyboard review tests**

```tsx
expect(media).toContain("Source");
expect(media).toContain("Type");
expect(media).toContain("Generation");
expect(media).toContain("ITEMS");
expect(selected).toContain("IN CONSOLE");
expect(consoleMarkup).toContain("APPROVE");
expect(consoleMarkup).toContain("NEEDS WORK");
expect(consoleMarkup).toContain("REJECT");
expect(mediaReviewTone(approvedCard)).toBe("approved");
expect(mediaReviewTone(candidateCard, needsWorkEvaluation)).toBe("needs-work");
```

Mount the panel and dispatch A/N/R with a selected Artifact; assert exact verdict calls. Repeat from input/textarea/select/contenteditable and with no selection/non-Artifact/unselected Artifact; assert no call. Cover Escape deselection, focus-visible card actions, hover/focus muted video preview, no sound autoplay, previous/next-unreviewed, viewer focus, generation/revision/failure states, and review errors.

- [ ] **Step 2: Run Media tests and verify RED**

Run: `bun run test -- tests/project-media-presentation.test.tsx tests/media-grid.test.ts tests/project-screen-behavior.test.tsx tests/design-system.test.ts`

Expected: FAIL because the Media console/keyboard review and final Instrument 3a/3b selectors do not exist.

- [ ] **Step 3: Implement exact Media geometry and truthful status**

```ts
export function editableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') !== null;
}
export function mediaReviewTone(card: MediaCardDto, evaluation?: EvaluationDto) {
  if (evaluation?.verdict === "needs-work") return "needs-work";
  if (evaluation?.verdict === "approved" || ("selectedState" in card && card.selectedState === "approved")) return "approved";
  if (evaluation?.verdict === "rejected" || ("selectedState" in card && card.selectedState === "rejected")) return "rejected";
  return "unreviewed";
}
```

At 1440px reproduce handoff 3a/3b: 38px desk header; filters; Doto count; view/zoom; four adaptive virtual masonry lanes with 10px gap; natural-ratio frame at `#060606`; captions outside; selected 3px ring and `IN CONSOLE`; 292px review console above chat; flat Approve/Needs Work/Reject pills/keycaps; dock clear of rail. Reduce columns at explicit desk-container thresholds. Keep current virtualizer/preview cache/scheduler and guarded URLs. Review is enabled only for an Artifact with a selected revision; other media show a focusable disabled reason. A/N/R remain available from non-editable controls inside the review dialog; suppress them only when the event target itself is editable.

- [ ] **Step 4: Run GREEN checks and pixel-review gate**

Run: `bun run test -- tests/project-media-presentation.test.tsx tests/media-grid.test.ts tests/project-screen-behavior.test.tsx tests/protocol-access.test.ts tests/design-system.test.ts && bun run typecheck && bun run build && git diff --check`

Expected: suites/build pass. Independent visual reviewer compares forced light/dark 1440x900 screenshots against 3a/3b for geometry, colors, typography, copy, selection, console, chat, and dock; interaction reviewer checks 1280/1100 columns and all keyboard guards.

- [ ] **Step 5: Commit Media presentation**

```bash
git add src/screens/project/MediaReviewConsole.tsx src/screens/project/MediaPanel.tsx src/screens/project/MediaViewer.tsx src/components/VirtualAssetGrid.tsx src/components/media/ImageViewport.tsx src/components/media/VideoPlayer.tsx src/components/media/AudioWaveform.tsx src/state/project-screen-controller.ts src/styles/work-surfaces.css tests/project-media-presentation.test.tsx tests/media-grid.test.ts tests/project-screen-behavior.test.tsx tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild project media console"
```

### Task 9: Rebuild Units collection, detail, revisions, presentations, and playback

**Files:**
- Modify: `src/screens/project/UnitsPanel.tsx`
- Modify: `src/screens/project/UnitViewer.tsx`
- Modify: `src/screens/project/UnitSocialPreview.tsx`
- Modify: `src/screens/project/CompositionsPanel.tsx`
- Modify: `src/screens/project/ArtifactPreview.tsx`
- Modify: `src/components/ui/IPhoneMockup.tsx`
- Modify: `src/styles/work-surfaces.css`
- Test: `tests/units-panel.test.tsx`
- Test: `tests/composition-view.test.tsx`
- Test: `tests/unit-previews.test.ts`
- Test: `tests/unit-lifecycle.test.ts`

**Interfaces:**
- Consumes: unchanged unit/composition controller methods, lifecycle helper, current preview/presentation DTOs, project dock, and content tokens.
- Produces: Instrument Unit collection/detail, revision/build/source/input/evaluation states, presentation target previews, mobile/desktop playback, mutation conflict/error/loading/empty states.

- [ ] **Step 1: Add failing Units state tests**

```tsx
expect(collection).toContain("Units");
expect(detail).toContain("Revisions");
expect(detail).toContain("Presentations");
expect(detail).toContain("Items");
expect(video).toContain('aria-label="Play preview"');
expect(conflict).toContain("Unit changed");
expect(unavailablePreview).toContain("Preview unavailable");
```

Cover collection/detail, select revision, compositions/revisions/builds, preview loading/error, social presentation choices, mobile/desktop frames, playback controls, pagination, conflict, and target-unit deep link.

- [ ] **Step 2: Run Units tests and verify RED**

Run: `bun run test -- tests/units-panel.test.tsx tests/composition-view.test.tsx tests/unit-previews.test.ts tests/unit-lifecycle.test.ts`

Expected: FAIL on Instrument presentation expectations.

- [ ] **Step 3: Implement responsive Unit instruments**

```tsx
<InstrumentScreenHeader
  eyebrow={projectName}
  title="Units"
  counters={<InstrumentCounter value={page.items.length} label="Loaded" />}
  actions={lifecycleAction}
/>
```

Keep existing composition/unit grouping and lifecycle decisions. Use adaptive collection widgets, detail columns above 760px, stacked details below it, and explicit content tokens for image/video/social canvases. Controls never imply render/select capability unless the current lifecycle helper returns it. Preserve selected revision CAS/conflict and playback accessibility.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/units-panel.test.tsx tests/composition-view.test.tsx tests/unit-previews.test.ts tests/unit-lifecycle.test.ts tests/project-screen-behavior.test.tsx && bun run typecheck && git diff --check`

Expected: suites pass; reviewer confirms all enabled actions route through existing controller methods and media never autoplays with sound.

- [ ] **Step 5: Commit Units presentation**

```bash
git add src/screens/project/UnitsPanel.tsx src/screens/project/UnitViewer.tsx src/screens/project/UnitSocialPreview.tsx src/screens/project/CompositionsPanel.tsx src/screens/project/ArtifactPreview.tsx src/components/ui/IPhoneMockup.tsx src/styles/work-surfaces.css tests/units-panel.test.tsx tests/composition-view.test.tsx tests/unit-previews.test.ts tests/unit-lifecycle.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild project units"
```

### Task 10: Rebuild Activity timeline/inspector and close the Work-surface gate

**Files:**
- Modify: `src/screens/project/ActivityTimeline.tsx`
- Modify: `src/screens/project/ActivityInspector.tsx`
- Modify: `src/screens/project/activity-presentation.ts`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/styles/work-surfaces.css`
- Test: `tests/activity-timeline.test.tsx`
- Test: `tests/activity-sync.test.ts`
- Test: `tests/project-screen.test.tsx`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: unchanged virtual Activity page/catch-up controller, `loadActivityRun`, presentation formatting, root-epoch sequencing, project dock, and Plan 1 primitives.
- Produces: Instrument Activity header/filter/search, virtual list, technical/run inspector, loading/empty/error/unavailable states, and a complete My Work/Project route-state review.

- [ ] **Step 1: Add failing Activity and route-matrix tests**

```tsx
expect(timeline).toContain("Activity");
expect(timeline).toContain('aria-label="Search activity"');
expect(runInspector).toContain("Run details");
expect(runInspector).toContain("Attempts");
expect(technicalUnavailable).toContain("Technical details unavailable");
expect(empty).toContain("No activity yet");
expect(error).toContain('role="alert"');
```

Add a route-matrix assertion that enumerates startup/global, Workspace Overview/Projects/Units placeholder/Shared Library/Memory/Calendar, and Project Documents/Media/Units/Activity test fixtures with loading, ready, empty, partial/unavailable, and error coverage.

- [ ] **Step 2: Run Activity/matrix tests and verify RED**

Run: `bun run test -- tests/activity-timeline.test.tsx tests/activity-sync.test.ts tests/project-screen.test.tsx tests/design-system.test.ts`

Expected: FAIL because Activity and the route matrix do not yet assert complete Instrument coverage.

- [ ] **Step 3: Implement Activity instruments and exact matrix guard**

```ts
export const WORK_ROUTE_STATE_MATRIX = {
  startup: ["restoring", "library-unavailable", "library-empty", "migration", "alert"],
  workspace: ["overview", "projects", "units-unavailable", "shared", "memory", "calendar"],
  project: ["documents", "media", "units", "activity"],
} as const;
```

Use Instrument header/pills/counter and keep the current virtual list/catch-up/order behavior. Portal the run inspector above chat only while a run is selected; technical facts not returned by Core render unavailable reasons. Ensure all project sections use `ProjectDock`, one desk scroller, and the same route header grammar.

- [ ] **Step 4: Run the complete Work gate and independent reviews**

Run: `bun run test -- tests/instrument-global-states.test.tsx tests/workspace-overview-screen.test.tsx tests/workspace-overview-presentation.test.ts tests/workspace-overview-navigation.test.tsx tests/workspace-domain.test.tsx tests/shared-library-controller.test.ts tests/shared-library-screen.test.tsx tests/shared-library-inspector.test.tsx tests/shared-library-viewer.test.tsx tests/shared-library-workflows.test.tsx tests/shared-library-presentation.test.ts tests/memory-screen.test.tsx tests/memory-contract.test.ts tests/calendar-screen.test.tsx tests/calendar-presentation.test.ts tests/calendar-contract.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts tests/ralphy-current-core.test.ts tests/documents-panel.test.tsx tests/project-media-presentation.test.tsx tests/media-grid.test.ts tests/units-panel.test.tsx tests/composition-view.test.tsx tests/activity-timeline.test.tsx tests/activity-sync.test.ts tests/project-screen.test.tsx tests/project-screen-behavior.test.tsx tests/design-system.test.ts && bun run typecheck && bun run build && git diff --check`

Expected: all named suites pass and typecheck/build exit 0. Product reviewer verifies every spec matrix state; accessibility/visual reviewer verifies focus, scroll ownership, responsive stacking, forced light/dark, reduced motion, and Media 3a/3b; security reviewer verifies Task 6 and all guarded media paths.

- [ ] **Step 5: Commit Activity and Work completion**

```bash
git add src/screens/project/ActivityTimeline.tsx src/screens/project/ActivityInspector.tsx src/screens/project/activity-presentation.ts src/screens/ProjectScreen.tsx src/styles/work-surfaces.css tests/activity-timeline.test.tsx tests/activity-sync.test.ts tests/project-screen.test.tsx tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "feat: complete instrument work surfaces"
```

## Plan 2 Acceptance Gate

Run:

```bash
bun run test
bun run typecheck
bun run build
git diff --check "$NOTHING_WORK_BASE"..HEAD
```

Expected: all repository tests pass or only a baseline failure recorded before Task 1 remains; typecheck/build pass; the range contains no Core source/database/schema edits or new dependency. Inspect every My Work/Project state in forced light/dark at 1440x900, 1280x800, and 1100x720, with special pixel-level comparison of Media against final handoff 3a/3b. Confirm UX Testing Lab launch alone causes no database write before beginning Plan 3.
