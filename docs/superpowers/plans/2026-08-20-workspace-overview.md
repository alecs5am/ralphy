# Workspace Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible project Overview with the complete workspace-level command center described by the approved design handoff, while rendering honest unavailable and partial states for data the current Core contract does not expose.

**Architecture:** Keep `workspace.overview` as the only data source and add one pure presentation mapper between its bounded DTO and the React sections. Split the page by product responsibility—shell, performance, planning/outcomes, insights, and operations—without introducing a dashboard framework. Existing data renders normally; unsupported backend additions render the exact handoff states and never fabricated metrics.

**Tech Stack:** Electron, React 19, TypeScript, Vitest, Lucide, existing Radix Dialog, existing Ralphy CSS tokens.

**Spec:** `docs/design/workspace-overview-ui-handoff.md`

## Global Constraints

- Implement every component and state in the approved handoff; unavailable Core data changes the state, not the component inventory.
- Use only `workspace.overview`; do not issue one `project.overview` request per project and do not change a sibling repository contract.
- Preserve the internal `project.overview` bridge contract while removing only its visible project tab.
- Default new workspace preferences to Overview; preserve any existing valid saved workspace page.
- Fall removed or invalid saved project Overview state back to Units.
- Show unknown metrics as `—` or an explicit reason; never convert missing values to zero.
- Do not show raw activity IDs, a full Projects grid, Documents, or Shared Media on Overview.
- Keep the handoff reading order at all widths and use one column without horizontal card scrolling at narrow desktop widths.
- Reuse `src/styles/tokens.css`; add no dependency and no new typeface or dashboard palette.
- Every status uses text in addition to color; every chart has a text summary and table alternative.
- Refresh in place; keep the current page visible and mark sections busy instead of blanking the screen.
- Use Bun for all scripts.

## File Structure

- Create `src/screens/workspace/overview-presentation.ts`: pure mapping from `WorkspaceOverviewDto` and catalog summaries into render-ready sections and explicit availability states.
- Create `src/screens/workspace/WorkspaceOverviewHeader.tsx`: workspace identity, period/freshness, refresh, degraded state, and compact attention summary.
- Create `src/screens/workspace/WorkspacePerformance.tsx`: momentum, accessible trend state, account portfolio, and account drawer.
- Create `src/screens/workspace/WorkspacePlanAndOutcomes.tsx`: content plan, upcoming publishing, Unit outcome groups, and Unit outcome drawer.
- Create `src/screens/workspace/WorkspaceInsights.tsx`: What works, learned evidence, review drawer, and production efficiency.
- Create `src/screens/workspace/WorkspaceOperations.tsx`: attention, pulse, in-progress, active projects, recent changes, and onboarding/empty states.
- Rewrite `src/screens/WorkspaceScreen.tsx`: compose the approved page sections and own drawers without embedding derivation logic.
- Create `src/styles/workspace-overview.css`: page-specific layout and states using existing tokens.
- Modify `src/main.tsx`: import the page stylesheet.
- Modify `src/state/workspace-screen-controller.ts`: retain ready data during refresh and expose `refreshing`.
- Modify `electron/ralphy/workspace-reader.ts`: request useful bounded page sizes without adding contracts.
- Modify `src/state/workbench.ts`, `src/components/ContextSidebar.tsx`, and `src/App.tsx`: add and route the workspace Overview page.
- Modify `src/components/ProjectControls.tsx`, `src/state/project-screen-controller.ts`, and `src/screens/ProjectScreen.tsx`: remove the visible project Overview and default to Units while retaining internal overview loading.
- Create `tests/workspace-overview-presentation.test.ts` and `tests/workspace-overview-screen.test.tsx`.
- Modify `tests/workspace-domain.test.tsx`, `tests/workspace-navigation.test.tsx`, `tests/project-screen.test.tsx`, and `tests/project-screen-behavior.test.tsx` for routing and migration behavior.

---

### Task 1: Build the honest presentation model

**Files:**
- Create: `src/screens/workspace/overview-presentation.ts`
- Create: `tests/workspace-overview-presentation.test.ts`

**Interfaces:**
- Consumes: `WorkspaceOverviewDto`, `ProjectSummary[]`, workspace description, and a deterministic `now` timestamp.
- Produces: `presentWorkspaceOverview(input: WorkspaceOverviewInput): WorkspaceOverviewPresentation`.
- Produces: `Availability<T> = { status: "ready"; value: T } | { status: "empty" | "unavailable" | "partial"; reason: string; value?: T }`.

- [ ] **Step 1: Write failing tests for current, partial, and unsupported data**

```ts
import { describe, expect, test } from "vitest";
import type { WorkspaceOverviewDto } from "../electron/ralphy/types";
import { presentWorkspaceOverview } from "../src/screens/workspace/overview-presentation";

const populatedOverview = {
  workspace: { id: "workspace-1", slug: "launch", name: "Launch Studio", rowVersion: 1, createdAt: 1, updatedAt: 2 },
  accounts: { items: [{ id: "account-1", workspaceId: "workspace-1", platform: "tiktok", externalId: "external-1", username: "launch", displayName: "Launch", credentialConfigured: true, credentialSource: "encrypted", relinkRequired: true, rowVersion: 1, createdAt: 1, updatedAt: 2 }], nextCursor: null },
  projects: { items: [], nextCursor: null },
  units: { items: [], nextCursor: null },
  publications: { items: [{ id: "publication-1", unitId: "unit-1", presentationId: "presentation-1", platform: "tiktok", socialAccountId: "account-1", rail: "postiz", state: "failed", url: null, scheduledAt: null, submittedAt: null, publishedAt: null, createdAt: 1, updatedAt: 2 }], nextCursor: null },
  metrics: { publicationCount: 1, views: 100, likes: 10, comments: 2, shares: 1, watchTimeMs: 60_000 },
} satisfies WorkspaceOverviewDto;

describe("workspace overview presentation", () => {
  test("derives only facts available in the current contract", () => {
    const value = presentWorkspaceOverview({
      overview: populatedOverview,
      catalogProjects: [],
      description: "Short-form launches",
      now: Date.UTC(2026, 7, 20),
    });

    expect(value.header.description).toBe("Short-form launches");
    expect(value.momentum.totals.publications).toBe(populatedOverview.metrics?.publicationCount);
    expect(value.momentum.trend).toMatchObject({ status: "unavailable" });
    expect(value.outcomes).toMatchObject({ status: "unavailable" });
    expect(value.insights).toMatchObject({ status: "unavailable" });
    expect(value.attention.items.map((item) => item.kind)).toContain("account-relink");
    expect(value.recentChanges.status).toBe("unavailable");
  });

  test("groups failed publications by root account issue", () => {
    const value = presentWorkspaceOverview({
      overview: {
        ...populatedOverview,
        publications: { items: [
          { ...populatedOverview.publications!.items[0]!, id: "p1", socialAccountId: "account-1", state: "failed" },
          { ...populatedOverview.publications!.items[0]!, id: "p2", socialAccountId: "account-1", state: "failed" },
        ], nextCursor: null },
      },
      catalogProjects: [], description: "", now: 1,
    });
    expect(value.attention.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "publication-failure", affectedCount: 2 }),
    ]));
  });

  test("does not infer cadence gaps or top performers from bounded totals", () => {
    const value = presentWorkspaceOverview({ overview: populatedOverview, catalogProjects: [], description: "", now: 1 });
    expect(value.plan.coverage).toMatchObject({ status: "unavailable", reason: expect.stringContaining("cadence") });
    expect(value.outcomes).toMatchObject({ status: "unavailable", reason: expect.stringContaining("benchmark") });
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `bun test tests/workspace-overview-presentation.test.ts`

Expected: FAIL because `overview-presentation.ts` does not exist.

- [ ] **Step 3: Implement the presentation types and pure mapper**

```ts
export type Availability<T> =
  | { status: "ready"; value: T }
  | { status: "partial"; reason: string; value: T }
  | { status: "empty" | "unavailable"; reason: string };

export interface WorkspaceOverviewInput {
  overview: WorkspaceOverviewDto;
  catalogProjects: ProjectSummary[];
  description: string;
  now?: number;
}

export interface WorkspaceOverviewPresentation {
  header: WorkspaceHeaderPresentation;
  momentum: WorkspaceMomentumPresentation;
  accounts: AccountPresentation[];
  plan: WorkspacePlanPresentation;
  outcomes: Availability<UnitOutcomeGroups>;
  insights: Availability<WorkspaceInsightPresentation[]>;
  efficiency: Availability<ProductionEfficiencyPresentation>;
  attention: { items: AttentionPresentation[]; criticalCount: number };
  pulse: Availability<ProductionPulsePresentation>;
  projects: ActiveProjectPresentation[];
  recentChanges: Availability<RecentChangePresentation[]>;
  onboarding: boolean;
}

export function presentWorkspaceOverview({
  overview, catalogProjects, description, now = Date.now(),
}: WorkspaceOverviewInput): WorkspaceOverviewPresentation {
  const publications = overview.publications?.items ?? [];
  const accounts = overview.accounts?.items ?? [];
  return {
    header: presentHeader(overview, description),
    momentum: presentMomentum(overview.metrics),
    accounts: accounts.map((account) => presentAccount(account, publications)),
    plan: presentPlan(publications, now),
    outcomes: unavailable("Performance benchmarks and observation windows are not available from Core yet."),
    insights: unavailable("Evidence samples and counterexamples are not available from Core yet."),
    efficiency: unavailable("Production timing and reuse evidence are not available from Core yet."),
    attention: presentAttention(accounts, publications),
    pulse: unavailable("Workspace run and build progress is not available from Core yet."),
    projects: presentProjects(overview.projects?.items ?? [], catalogProjects),
    recentChanges: unavailable("Core currently returns technical activity without display names."),
    onboarding: (overview.projects?.items.length ?? 0) === 0 && publications.length === 0,
  };
}
```

Implement the private helpers in the same file. Sort attention by publishing/data-integrity failures, blocked work, review, account actions, then governance. Group publication failures by `socialAccountId ?? "unknown"`; never derive trends, cadence completion, benchmarks, insights, or efficiency from aggregate totals.

- [ ] **Step 4: Run presentation tests**

Run: `bun test tests/workspace-overview-presentation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the presentation boundary**

```bash
git add src/screens/workspace/overview-presentation.ts tests/workspace-overview-presentation.test.ts
git commit -m "feat: model workspace overview presentation"
```

### Task 2: Land workspace and project navigation migration

**Files:**
- Modify: `src/state/workbench.ts`
- Modify: `src/components/ContextSidebar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/ProjectControls.tsx`
- Modify: `src/state/project-screen-controller.ts`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `tests/workspace-navigation.test.tsx`
- Modify: `tests/project-screen.test.tsx`
- Modify: `tests/project-screen-behavior.test.tsx`

**Interfaces:**
- Produces: `WorkspacePage = "overview" | "projects" | "units" | "shared" | "memory" | "calendar"`.
- Produces: visible project tabs `"units" | "documents" | "media" | "activity"`.
- Preserves: internal `loadProjectOverview()` and `project.overview` contract.

- [ ] **Step 1: Write failing navigation and migration assertions**

```ts
expect(WORKSPACE_PAGES).toEqual(["overview", "projects", "units", "shared", "memory", "calendar"]);
expect(readWorkbenchPreferences({ getItem: () => null, setItem: () => undefined }).workspacePage).toBe("overview");

const sidebar = renderToStaticMarkup(<ContextSidebar {...props} page="overview" />);
expect(sidebar).toContain("Overview");
expect(sidebar.indexOf("Overview")).toBeLessThan(sidebar.indexOf("Projects"));

const projectTabs = renderToStaticMarkup(<ProjectControls activeTab="units" onSelect={() => undefined} />);
expect(projectTabs).not.toContain("Overview");
expect(projectTabs).toContain("Units");
expect(moveProjectTab("units", "Home")).toBe("units");
expect(moveProjectTab("units", "End")).toBe("activity");
```

Add a controller assertion that a new project screen starts on Units while `loadProjectOverview` is still called once.

- [ ] **Step 2: Run focused navigation tests**

Run: `bun test tests/workspace-navigation.test.tsx tests/project-screen.test.tsx tests/project-screen-behavior.test.tsx`

Expected: FAIL on the old page list, old project tabs, and old default tab.

- [ ] **Step 3: Implement the smallest navigation change**

```ts
export type WorkspacePage = "overview" | "projects" | "units" | "shared" | "memory" | "calendar";
export const WORKSPACE_PAGES: WorkspacePage[] = ["overview", "projects", "units", "shared", "memory", "calendar"];
export const WORKSPACE_PAGE_LABELS = { overview: "Overview", /* existing labels */ } satisfies Record<WorkspacePage, string>;
```

Use `ChartNoAxesCombined` for the Overview sidebar icon. Set only the new-preference fallback to `overview`; keep any value passing `WORKSPACE_PAGES.includes(...)`. In `App.tsx`, render `WorkspaceScreen` for `workspacePage === "overview"` and keep Projects as its own route.

Change project controls to:

```ts
export type ProjectView = Exclude<ProjectTab, "compositions">;
const tabs = [
  { value: "units", label: "Units", id: "project-tab-units", controlsId: "project-panel-units" },
  { value: "documents", label: "Documents", id: "project-tab-documents", controlsId: "project-panel-documents" },
  { value: "media", label: "Media", id: "project-tab-media", controlsId: "project-panel-media", focusFallback: true },
  { value: "activity", label: "Activity", id: "project-tab-activity", controlsId: "project-panel-activity" },
];
```

Initialize `activeTab: "units"`. Start with `await Promise.all([loadOverview(), loadPage("units")])` so the existing overview contract remains loaded for lifecycle facts while Units becomes visible immediately. Remove only the unreachable Overview panel branch and its scroll binding from `ProjectScreen.tsx`.

- [ ] **Step 4: Run navigation tests**

Run: `bun test tests/workspace-navigation.test.tsx tests/project-screen.test.tsx tests/project-screen-behavior.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit navigation migration**

```bash
git add src/state/workbench.ts src/components/ContextSidebar.tsx src/App.tsx src/components/ProjectControls.tsx src/state/project-screen-controller.ts src/screens/ProjectScreen.tsx tests/workspace-navigation.test.tsx tests/project-screen.test.tsx tests/project-screen-behavior.test.tsx
git commit -m "feat: move overview to workspace navigation"
```

### Task 3: Build the live page shell and refresh behavior

**Files:**
- Create: `src/screens/workspace/WorkspaceOverviewHeader.tsx`
- Rewrite: `src/screens/WorkspaceScreen.tsx`
- Modify: `src/state/workspace-screen-controller.ts`
- Modify: `electron/ralphy/workspace-reader.ts`
- Create: `tests/workspace-overview-screen.test.tsx`
- Modify: `tests/workspace-domain.test.tsx`

**Interfaces:**
- `WorkspaceScreen` additionally consumes `workspaceDescription`, `onOpenPage(page)`, and `onOpenUnit(projectId, unitId)`.
- `WorkspaceScreenSnapshot` adds `refreshing: boolean` while preserving the last ready `value`.
- `WorkspaceOverviewHeader` consumes `header`, `criticalCount`, `refreshing`, and `onRefresh`.

- [ ] **Step 1: Write failing shell and refresh-in-place tests**

```tsx
test("keeps ready content visible during refresh", async () => {
  const next = deferred<WorkspaceOverviewDto>();
  const api = { loadWorkspaceOverview: vi.fn()
    .mockResolvedValueOnce(populatedOverview)
    .mockReturnValueOnce(next.promise) };
  const controller = createWorkspaceScreenController(api, "workspace-1", 1);
  await controller.start();
  const refreshing = controller.refresh(2);
  expect(controller.getSnapshot()).toMatchObject({ status: "ready", refreshing: true, value: populatedOverview });
  next.resolve(populatedOverview);
  await refreshing;
  expect(controller.getSnapshot()).toMatchObject({ status: "ready", refreshing: false });
});

test("renders the approved section order", async () => {
  const markup = await renderWorkspace(populatedOverview);
  const headings = ["Workspace momentum", "Accounts", "Content plan", "Top and emerging Units", "What works", "Production efficiency", "Attention", "Active projects"];
  expect(headings.map((heading) => markup.indexOf(heading))).toEqual([...headings.map((heading) => markup.indexOf(heading))].sort((a, b) => a - b));
  expect(markup).not.toContain("Documents");
  expect(markup).not.toContain("Shared Media");
});
```

- [ ] **Step 2: Run focused shell tests**

Run: `bun test tests/workspace-domain.test.tsx tests/workspace-overview-screen.test.tsx`

Expected: FAIL because refresh clears `value` and the composed page is absent.

- [ ] **Step 3: Preserve ready data and request bounded overview pages**

Use this snapshot shape:

```ts
export interface WorkspaceScreenSnapshot {
  status: "idle" | "loading" | "ready" | "error";
  value: WorkspaceOverviewDto | null;
  error: string | null;
  refreshing: boolean;
}
```

On initial load, emit loading with no value. On subsequent load with a ready value, emit the same value with `refreshing: true`; a refresh error returns to ready with the old value plus a local error banner. Update `workspace-reader.ts` limits to accounts 20, projects 8, units 20, publications 30, and activity 10; continue requesting metrics, documents, and shared media only if another current consumer still needs them, otherwise remove those two unused sections from this reader request.

- [ ] **Step 4: Compose the page shell and header**

```tsx
const presentation = presentWorkspaceOverview({ overview: snapshot.value, catalogProjects, description: workspaceDescription });
return <main className="main-region workspace-overview" aria-busy={snapshot.refreshing || undefined}>
  <WorkspaceOverviewHeader
    value={presentation.header}
    criticalCount={presentation.attention.criticalCount}
    refreshing={snapshot.refreshing}
    onRefresh={() => void controller.retry()}
  />
  <div className="workspace-overview-scroll">
    <WorkspacePerformance value={presentation} />
    <WorkspacePlanAndOutcomes value={presentation} />
    <WorkspaceInsights value={presentation} />
    <WorkspaceOperations value={presentation} />
  </div>
</main>;
```

Header copy uses workspace name and description, `Updated <time>`, current data scope, timezone only when available, explicit partial-data text, and no dead New project button.

- [ ] **Step 5: Run shell tests**

Run: `bun test tests/workspace-domain.test.tsx tests/workspace-overview-screen.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the page shell**

```bash
git add src/screens/workspace/WorkspaceOverviewHeader.tsx src/screens/WorkspaceScreen.tsx src/state/workspace-screen-controller.ts electron/ralphy/workspace-reader.ts tests/workspace-overview-screen.test.tsx tests/workspace-domain.test.tsx
git commit -m "feat: add workspace overview shell"
```

### Task 4: Implement momentum, trend states, accounts, and account detail

**Files:**
- Create: `src/screens/workspace/WorkspacePerformance.tsx`
- Create: `src/styles/workspace-overview.css`
- Modify: `src/main.tsx`
- Modify: `tests/workspace-overview-screen.test.tsx`

**Interfaces:**
- Consumes: `momentum`, `accounts`, and account selection from `WorkspaceOverviewPresentation`.
- Produces: accessible `WorkspaceMomentum`, `AccountPortfolio`, and `AccountDetailDialog` components.

- [ ] **Step 1: Add failing populated and degraded-state tests**

```tsx
expect(markup).toContain("Workspace momentum");
expect(markup).toContain("Publications");
expect(markup).toContain("Watch time");
expect(markup).toContain("Trend unavailable");
expect(markup).toContain("Account metrics are not available from the current Core contract");
expect(markup).toContain("Relink required");
expect(markup).toContain('aria-label="Account portfolio"');
expect(markup).not.toContain("0 views");
```

Mount with the React host, click an account, and assert that the dialog contains `Performance`, `Top Units`, `Upcoming`, `Data freshness`, and a disabled/unavailable explanation for each unsupported block.

- [ ] **Step 2: Run the screen test**

Run: `bun test tests/workspace-overview-screen.test.tsx`

Expected: FAIL on missing performance components.

- [ ] **Step 3: Implement performance components using native SVG and existing Dialog**

```tsx
function WorkspaceMomentum({ value }: { value: WorkspaceMomentumPresentation }) {
  return <section className="workspace-overview-section workspace-momentum" aria-labelledby="workspace-momentum-title">
    <SectionHeading id="workspace-momentum-title" title="Workspace momentum" meta={value.periodLabel} />
    <MetricStrip values={value.totals} />
    {value.trend.status === "ready"
      ? <AccessibleTrendChart value={value.trend.value} />
      : <UnavailablePanel title="Trend unavailable" reason={value.trend.reason} />}
  </section>;
}
```

The chart is an inline SVG `<polyline>` with `<title>` and `<desc>`, followed by a visually compact `<table>` containing the same points. Do not add a chart dependency. Account cards show platform text, handle, link health, last Core update, publication count, and explicit provider-metric unavailability. Use Radix Dialog for the 480px account drawer and keep its header/footer fixed with a scrollable body.

- [ ] **Step 4: Implement the initial stylesheet**

Use existing tokens only. Define the full-page scroll container, section rhythm, mono metrics, account grid, status pills, dialog layout, focus-visible outlines, and `@media (prefers-reduced-motion: reduce)`. Use container queries to change the account grid from four columns to two and then one without changing DOM order.

- [ ] **Step 5: Run component tests**

Run: `bun test tests/workspace-overview-screen.test.tsx tests/design-system.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit workspace performance**

```bash
git add src/screens/workspace/WorkspacePerformance.tsx src/styles/workspace-overview.css src/main.tsx tests/workspace-overview-screen.test.tsx
git commit -m "feat: add workspace performance sections"
```

### Task 5: Implement content planning and Unit outcome components

**Files:**
- Create: `src/screens/workspace/WorkspacePlanAndOutcomes.tsx`
- Modify: `src/styles/workspace-overview.css`
- Modify: `tests/workspace-overview-screen.test.tsx`

**Interfaces:**
- Consumes: `plan`, `outcomes`, and `onOpenPage("calendar" | "units")`.
- Produces: plan coverage, 14-day publishing rows, ready/unscheduled state, outcome groups, and Unit outcome detail dialog.

- [ ] **Step 1: Add failing tests for every approved state**

```tsx
expect(markup).toContain("Content plan");
expect(markup).toContain("Next 14 days");
expect(markup).toContain("Cadence targets are not configured in the current Core contract");
expect(markup).toContain("Top and emerging Units");
expect(markup).toContain("Comparable performance data is not available yet");
expect(markup).not.toContain("Content gap");
```

Add fixtures for scheduled, failed, empty, and partial publication pages. Assert that several child publications sharing Unit/time are rendered as one content event, failed channels remain visible with text, and an empty page shows `Nothing scheduled in the next 14 days` plus `Open Calendar`.

- [ ] **Step 2: Run the screen test**

Run: `bun test tests/workspace-overview-screen.test.tsx`

Expected: FAIL on missing plan/outcome components.

- [ ] **Step 3: Implement plan and outcome components**

```tsx
export function WorkspacePlanAndOutcomes({ value, onOpenPage, onOpenUnit }: Props) {
  return <>
    <ContentPlan value={value.plan} onOpenCalendar={() => onOpenPage("calendar")} onOpenUnit={onOpenUnit} />
    <UnitOutcomes value={value.outcomes} onOpenUnit={onOpenUnit} />
  </>;
}
```

Render a 14-column day strip only from scheduled timestamps in the current window; group children by `unitId + scheduledAt`. Coverage, ready-unscheduled counts, outcome rankings, normalized multipliers, and benchmark explanations use their unavailable states until Core returns those fields. The Unit detail dialog still renders its complete shell—result, benchmark method, child publications, observation window, and destination—with each unsupported subsection explaining its missing contract field.

- [ ] **Step 4: Add responsive and accessible styles**

Keep publishing events as a vertical list under the day strip at narrow widths. Add full date labels, account/platform text, and status text; never rely on icons alone. Unit media placeholders use stable glyphs rather than stock imagery.

- [ ] **Step 5: Run plan/outcome tests**

Run: `bun test tests/workspace-overview-screen.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit planning and outcomes**

```bash
git add src/screens/workspace/WorkspacePlanAndOutcomes.tsx src/styles/workspace-overview.css tests/workspace-overview-screen.test.tsx
git commit -m "feat: add workspace plan and outcomes"
```

### Task 6: Implement insights, evidence review, and efficiency

**Files:**
- Create: `src/screens/workspace/WorkspaceInsights.tsx`
- Modify: `src/styles/workspace-overview.css`
- Modify: `tests/workspace-overview-screen.test.tsx`

**Interfaces:**
- Consumes: `insights`, `efficiency`, and `onOpenPage("memory" | "shared")`.
- Produces: strong/weak/insufficient evidence cards, evidence detail dialog, proposed Memory action state, and production efficiency strip.

- [ ] **Step 1: Add failing evidence-honesty tests**

```tsx
expect(markup).toContain("What works");
expect(markup).toContain("What Ralphy learned");
expect(markup).toContain("More comparable publications are needed");
expect(markup).toContain("Production efficiency");
expect(markup).toContain("Production timing and reuse evidence are not available from Core yet");
expect(markup).not.toMatch(/caused|guaranteed|viral score/i);
```

For a synthetic ready presentation, assert each insight renders platform/account scope, reporting window, sample size, baseline, evidence strength, supporting Units, counterexamples, caveats, and `Save as proposed Memory` only when the action is available.

- [ ] **Step 2: Run the screen test**

Run: `bun test tests/workspace-overview-screen.test.tsx`

Expected: FAIL on missing insight components.

- [ ] **Step 3: Implement complete insight and efficiency shells**

```tsx
function EvidenceState({ value }: { value: Availability<WorkspaceInsightPresentation[]> }) {
  if (value.status !== "ready" && value.status !== "partial") {
    return <UnavailablePanel title="More comparable publications are needed" reason={value.reason} />;
  }
  return <ul className="workspace-insight-list">{value.value.map((insight) => <InsightCard key={insight.id} value={insight} />)}</ul>;
}
```

The detail dialog reading order is method/sample, median comparison, supporting Units, counterexamples, caveats, then Memory action. Render counterexamples by default. Efficiency shows six defined metric slots; unavailable slots carry a reason and are not empty cards.

- [ ] **Step 4: Run insight tests**

Run: `bun test tests/workspace-overview-screen.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit insights and efficiency**

```bash
git add src/screens/workspace/WorkspaceInsights.tsx src/styles/workspace-overview.css tests/workspace-overview-screen.test.tsx
git commit -m "feat: add workspace insight sections"
```

### Task 7: Implement operations, onboarding, partial failures, and final responsive behavior

**Files:**
- Create: `src/screens/workspace/WorkspaceOperations.tsx`
- Modify: `src/screens/WorkspaceScreen.tsx`
- Modify: `src/styles/workspace-overview.css`
- Modify: `tests/workspace-overview-screen.test.tsx`

**Interfaces:**
- Consumes: `attention`, `pulse`, `projects`, `recentChanges`, `onOpenProject`, and workspace-page callbacks.
- Produces: grouped attention queue, production pulse, in-progress states, project continuation rows, recent-change state, onboarding steps, per-section retry, and narrow layout.

- [ ] **Step 1: Add failing operations and state tests**

```tsx
expect(markup).toContain("Attention");
expect(markup).toContain("Production pulse");
expect(markup).toContain("In progress");
expect(markup).toContain("Active projects");
expect(markup).toContain("Recent changes");
expect(markup).not.toMatch(/#\d+ · [a-z]+\.[a-z]+/);
```

Add explicit test cases for no attention, no active work, new workspace onboarding, initial loading skeletons, refresh-in-place, full-page error with Retry, and a local partial failure banner that does not hide healthy sections. Assert attention is a semantic list, every row has one named primary action, and repeated account failures are grouped with an affected count.

- [ ] **Step 2: Run the screen test**

Run: `bun test tests/workspace-overview-screen.test.tsx`

Expected: FAIL on missing operations components and states.

- [ ] **Step 3: Implement operations and onboarding**

```tsx
export function WorkspaceOperations({ value, onOpenProject, onOpenPage }: Props) {
  if (value.onboarding) return <WorkspaceOnboarding onOpenProjects={() => onOpenPage("projects")} onOpenCalendar={() => onOpenPage("calendar")} />;
  return <>
    <section className="workspace-operations-grid">
      <AttentionQueue value={value.attention} />
      <ProductionState pulse={value.pulse} />
    </section>
    <ActiveProjects value={value.projects.slice(0, 4)} onOpenProject={onOpenProject} onViewAll={() => onOpenPage("projects")} />
    <RecentChanges value={value.recentChanges} />
  </>;
}
```

Only actionable states appear in Attention. Production pulse and recent changes retain their handoff components but show explicit unavailable states until the workspace contract supplies normalized runs and human-readable activity. Project rows use catalog preview/glyph data where present and never reproduce the full grid controls.

- [ ] **Step 4: Finish loading, failure, and responsive styles**

Use one section-level skeleton per major block with `aria-busy`, retain header height, and avoid per-row screen-reader noise. At 1280-equivalent content width, use one column in the exact priority order; accounts become 2×2 before one column; Attention precedes pulse. Add no horizontal overflow.

- [ ] **Step 5: Run the complete renderer suite**

Run: `bun test tests/workspace-overview-presentation.test.ts tests/workspace-overview-screen.test.tsx tests/workspace-domain.test.tsx tests/workspace-navigation.test.tsx tests/project-screen.test.tsx tests/project-screen-behavior.test.tsx tests/design-system.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit operations and states**

```bash
git add src/screens/workspace/WorkspaceOperations.tsx src/screens/WorkspaceScreen.tsx src/styles/workspace-overview.css tests/workspace-overview-screen.test.tsx
git commit -m "feat: complete workspace overview states"
```

### Task 8: Verify the complete handoff implementation

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Produces: a buildable Workspace Overview whose complete UI inventory matches the handoff and whose unavailable states document the current contract boundary.

- [ ] **Step 1: Run type checking and the full test suite**

Run: `bun run typecheck && bun test`

Expected: both commands exit 0.

- [ ] **Step 2: Run the required desktop build**

Run: `bun run build`

Expected: renderer and Electron builds exit 0.

- [ ] **Step 3: Inspect the final diff and handoff coverage**

Run:

```bash
git diff --check
git status --short
rg -n "Workspace momentum|Accounts|Content plan|Top and emerging Units|What works|What Ralphy learned|Production efficiency|Attention|Production pulse|In progress|Active projects|Recent changes" src/screens/workspace src/screens/WorkspaceScreen.tsx
```

Expected: no whitespace errors; every required section is present; only planned files are changed.

- [ ] **Step 4: Run secret scan if committing the implementation**

Run: `gitleaks protect --staged --redact`

Expected: no leaks.

- [ ] **Step 5: Commit any verification-only fixes**

```bash
git add src tests electron
git commit -m "fix: verify workspace overview handoff"
```

Skip this commit when verification required no changes.
