import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { WorkspaceOverviewDto } from "../electron/ralphy/types";
import {
  WorkspaceScreenView,
  createWorkspaceScreenController,
} from "../src/screens/WorkspaceScreen";
import type { WorkspaceMomentumPresentation } from "../src/screens/workspace/overview-presentation";
import { AccessibleTrendChart, WorkspaceMomentum } from "../src/screens/workspace/WorkspacePerformance";
import { WorkspacePlanAndOutcomes } from "../src/screens/workspace/WorkspacePlanAndOutcomes";
import { WorkspaceInsights } from "../src/screens/workspace/WorkspaceInsights";
import { createReactHost } from "./react-host";

const populatedOverview = {
  workspace: {
    id: "workspace-1", slug: "launch", name: "Launch Studio",
    rowVersion: 1, createdAt: 1, updatedAt: 2,
  },
  accounts: { items: [{
    id: "account-1", workspaceId: "workspace-1", platform: "tiktok",
    externalId: "external-1", username: "launch", displayName: "Launch",
    credentialConfigured: true, credentialSource: "encrypted", relinkRequired: false,
    rowVersion: 1, createdAt: 1, updatedAt: 2,
  }], nextCursor: null },
  projects: { items: [], nextCursor: null },
  units: { items: [], nextCursor: null },
  publications: { items: [{
    id: "publication-1", unitId: "unit-1", presentationId: "presentation-1",
    platform: "tiktok", socialAccountId: "account-1", rail: "postiz",
    state: "failed", url: null, scheduledAt: null, submittedAt: null,
    publishedAt: null, createdAt: 1, updatedAt: 2,
  }], nextCursor: null },
  metrics: {
    publicationCount: 1, views: 100, likes: 10, comments: 2,
    shares: 1, watchTimeMs: 60_000,
  },
} satisfies WorkspaceOverviewDto;

const planDays = Array.from({ length: 14 }, (_, index) => new Date(2026, 7, 20 + index).getTime());

async function renderWorkspace(
  value: WorkspaceOverviewDto,
  snapshotPatch: { error?: string | null; refreshing?: boolean } = {},
): Promise<string> {
  const controller = createWorkspaceScreenController(
    { loadWorkspaceOverview: vi.fn(async () => value) },
    "workspace-1",
  );
  await controller.start();
  return renderToStaticMarkup(
    <WorkspaceScreenView
      controller={controller}
      snapshot={{ ...controller.getSnapshot(), ...snapshotPatch }}
      catalogProjects={[]}
      workspaceDescription="Short-form launches"
      onOpenPage={() => undefined}
      onOpenUnit={() => undefined}
      onOpenProject={() => undefined}
    />,
  );
}

describe("workspace overview shell", () => {
  test("gives a ready trend an accessible chart and exact table alternative", () => {
    const markup = renderToStaticMarkup(<AccessibleTrendChart value={[
      { label: "Aug 19", value: 80 },
      { label: "Aug 20", value: 100 },
    ]} />);

    expect(markup).toContain('role="img"');
    expect(markup).toContain("Workspace performance trend");
    expect(markup).toContain("<polyline");
    expect(markup).toContain("Aug 19");
    expect(markup).toContain(">80<");
    expect(markup).toContain("Aug 20");
    expect(markup).toContain(">100<");
  });

  test("keeps returned trend points visible when the trend is partial", () => {
    const value = {
      periodLabel: "Last 30 days",
      totals: { publications: 1, views: 100, likes: 10, comments: 2, shares: 1, watchTimeMs: 60_000 },
      trend: { status: "partial", reason: "One provider has not synced.", value: [{ label: "Aug 20", value: 100 }] },
    } as unknown as WorkspaceMomentumPresentation;
    const markup = renderToStaticMarkup(<WorkspaceMomentum value={value} />);

    expect(markup).toContain('role="img"');
    expect(markup).toContain("Partial trend data");
    expect(markup).toContain("One provider has not synced.");
  });

  test("renders the approved section order without legacy resource sections", async () => {
    const markup = await renderWorkspace(populatedOverview);
    const headings = [
      "Workspace momentum",
      "Accounts",
      "Content plan",
      "Top and emerging Units",
      "What works",
      "What Ralphy learned",
      "Production efficiency",
      "Attention",
      "Active projects",
    ];
    const positions = headings.map((heading) => markup.indexOf(heading));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(markup).not.toContain("Documents");
    expect(markup).not.toContain("Shared Media");
  });

  test("renders live identity, scope, attention, and refresh state", async () => {
    const markup = await renderWorkspace(populatedOverview, { refreshing: true });

    expect(markup).toContain("Launch Studio");
    expect(markup).toContain("Short-form launches");
    expect(markup).toContain("Updated");
    expect(markup).toContain("Current Core totals");
    expect(markup).toContain("1 connected account");
    expect(markup).toContain("1 critical");
    expect(markup).toContain("Refreshing");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain("Timezone");
    expect(markup).not.toContain("New project");
  });

  test("labels partial data and keeps a local refresh error beside healthy sections", async () => {
    const markup = await renderWorkspace({
      ...populatedOverview,
      accounts: { ...populatedOverview.accounts, nextCursor: "more-accounts" },
      publications: { ...populatedOverview.publications, nextCursor: "more-publications" },
    }, { error: "Refresh unavailable" });

    expect(markup).toContain("Partial data");
    expect(markup).toContain("Connected accounts are limited to the returned Core page");
    expect(markup).toContain("Refresh unavailable");
    expect(markup).toContain("Workspace momentum");
  });

  test("renders real momentum totals and an honest account portfolio", async () => {
    const markup = await renderWorkspace(populatedOverview);

    expect(markup).toContain("Workspace momentum");
    expect(markup).toContain("Publications");
    expect(markup).toContain("Watch time");
    expect(markup).toContain('aria-label="Views: 100"');
    expect(markup).toContain('aria-label="60 seconds watch time"');
    expect(markup).toContain("Trend unavailable");
    expect(markup).toContain("Account metrics are not available from the current Core contract");
    expect(markup).toContain('aria-label="Account portfolio"');
    expect(markup).toContain("Connected");
    expect(markup).toContain("Last Core update");
    expect(markup).not.toContain("0 views");
  });

  test("preserves partial accounts and identifies accounts that need relinking", async () => {
    const account = populatedOverview.accounts.items[0];
    const markup = await renderWorkspace({
      ...populatedOverview,
      accounts: {
        items: [{ ...account, credentialConfigured: false, relinkRequired: true }],
        nextCursor: "more-accounts",
      },
    });

    expect(markup).toContain("Relink required");
    expect(markup).toContain("Connected accounts are limited to the returned Core page");
    expect(markup).toContain("Account metrics are not available from the current Core contract");
  });

  test("labels a complete account page with no connected accounts", async () => {
    const markup = await renderWorkspace({
      ...populatedOverview,
      accounts: { items: [], nextCursor: null },
    });

    expect(markup).toContain("No connected accounts were returned by Core");
    expect(markup).not.toContain('aria-label="Account portfolio"');
  });

  test("opens a complete account detail drawer without inventing unsupported data", async () => {
    const controller = createWorkspaceScreenController(
      { loadWorkspaceOverview: vi.fn(async () => populatedOverview) },
      "workspace-1",
    );
    await controller.start();
    const openPage = vi.fn();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(
        <WorkspaceScreenView
          controller={controller}
          snapshot={controller.getSnapshot()}
          catalogProjects={[]}
          workspaceDescription="Short-form launches"
          onOpenPage={openPage}
          onOpenUnit={() => undefined}
          onOpenProject={() => undefined}
        />,
      ));
      const accountButton = [...host.container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("@launch"));
      expect(accountButton).toBeTruthy();
      await act(async () => accountButton!.dispatchEvent(new Event("click", { bubbles: true })));

      const drawer = document.body.querySelector("[role=dialog]");
      expect(drawer?.textContent).toContain("Performance");
      expect(drawer?.textContent).toContain("Top Units");
      expect(drawer?.textContent).toContain("Upcoming");
      expect(drawer?.textContent).toContain("Recent publication failures");
      expect(drawer?.textContent).toContain("Data freshness");
      expect(drawer?.textContent).toContain("Account metrics are not available from the current Core contract");
      expect(drawer?.textContent).toContain("Top Units are not available from the current Core contract");
      expect(drawer?.textContent).toContain("Upcoming content is not available by account from the current Core contract");
      expect(drawer?.textContent).toContain("Publication failures are not available by account from the current Core contract");
      expect(drawer?.textContent).toContain("Account management is not available from the current desktop contract");
      const manageAccount = [...document.body.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Manage account"));
      expect(manageAccount?.disabled).toBe(true);

      const openCalendar = [...document.body.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Open Calendar"));
      await act(async () => openCalendar!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(openPage).toHaveBeenCalledWith("calendar");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("renders honest planning and outcome availability without inferring content gaps", async () => {
    const markup = await renderWorkspace(populatedOverview);

    expect(markup).toContain("Content plan");
    expect(markup).toContain("Next 14 days");
    expect(markup).toContain("Dates and times use this device’s timezone");
    expect(markup).toContain("Cadence targets are not configured in the current Core contract");
    expect(markup).toContain("Ready, not scheduled");
    expect(markup.match(/scheduled content events?"/g)).toHaveLength(14);
    expect(markup).toContain("Top and emerging Units");
    expect(markup).toContain("Top performers");
    expect(markup).toContain("Emerging");
    expect(markup).toContain("Learning opportunities");
    expect(markup).toContain("Comparable performance data is not available yet");
    expect(markup).not.toContain("Content gap");

    const unavailableSchedule = renderToStaticMarkup(<WorkspacePlanAndOutcomes
      value={{
        plan: {
          days: planDays,
          coverage: { status: "unavailable", reason: "Cadence unavailable." },
          upcoming: { status: "unavailable", reason: "Schedule unavailable." },
          readyUnscheduled: { status: "unavailable", reason: "Ready Units unavailable." },
        },
        outcomes: { status: "unavailable", reason: "Outcomes unavailable." },
      }}
      onOpenPage={() => undefined}
      onOpenUnit={() => undefined}
    />);
    expect(unavailableSchedule).toContain("Schedule unavailable");
    expect(unavailableSchedule).not.toContain("Next 14 days publishing density");
    expect(unavailableSchedule).not.toContain("scheduled content events");

    const emptyPlanValues = renderToStaticMarkup(<WorkspacePlanAndOutcomes
      value={{
        plan: {
          days: planDays,
          coverage: { status: "empty", reason: "No configured coverage." },
          upcoming: { status: "empty", reason: "Nothing scheduled in the next 14 days." },
          readyUnscheduled: { status: "empty", reason: "No ready Units." },
        },
        outcomes: { status: "unavailable", reason: "Outcomes unavailable." },
      }}
      onOpenPage={() => undefined}
      onOpenUnit={() => undefined}
    />);
    expect(emptyPlanValues).toContain("No plan coverage");
    expect(emptyPlanValues).toContain("No ready Units");

    const plan = {
      days: planDays,
      upcoming: { status: "empty", reason: "Nothing scheduled in the next 14 days." },
      coverage: { status: "ready", value: [{ id: "tiktok", label: "TikTok @launch", planned: 8, target: 10 }] },
      readyUnscheduled: { status: "ready", value: [{ unitId: "unit-ready", projectId: "project-1", title: "Ready reveal", projectTitle: "Launch campaign" }] },
    } as const;
    const ready = renderToStaticMarkup(<WorkspacePlanAndOutcomes value={{ plan, outcomes: { status: "unavailable", reason: "Outcomes unavailable." } }} onOpenPage={() => undefined} onOpenUnit={() => undefined} />);
    const partial = renderToStaticMarkup(<WorkspacePlanAndOutcomes
      value={{
        plan: {
          ...plan,
          coverage: { status: "partial", reason: "Coverage is limited.", value: plan.coverage.value },
          readyUnscheduled: { status: "partial", reason: "Ready Units are limited.", value: plan.readyUnscheduled.value },
        },
        outcomes: { status: "unavailable", reason: "Outcomes unavailable." },
      }}
      onOpenPage={() => undefined}
      onOpenUnit={() => undefined}
    />);
    for (const stateMarkup of [ready, partial]) {
      expect(stateMarkup).toContain("TikTok @launch");
      expect(stateMarkup).toContain("8 of 10 planned");
      expect(stateMarkup).toContain("Ready reveal");
      expect(stateMarkup).toContain("Launch campaign");
    }
    expect(partial).toContain("Coverage is limited");
    expect(partial).toContain("Ready Units are limited");
  });

  test("groups child publications into one event and keeps failed channels visible", async () => {
    const scheduledAt = Date.now() + 24 * 60 * 60 * 1000;
    const publication = populatedOverview.publications.items[0];
    const markup = await renderWorkspace({
      ...populatedOverview,
      projects: { items: [{
        id: "project-1", workspaceId: "workspace-1", slug: "launch-campaign", name: "Launch campaign",
        state: "active", rowVersion: 1, createdAt: 1, updatedAt: 2,
      }], nextCursor: null },
      units: { items: [{
        id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", compositionId: null,
        slug: "product-reveal", format: "video", latestRevisionId: "revision-5",
        selectedRevisionId: "revision-5", createdAt: 1, updatedAt: 2,
      }], nextCursor: null },
      publications: { items: [
        { ...publication, id: "publication-tiktok", state: "scheduled", scheduledAt },
        { ...publication, id: "publication-instagram", platform: "instagram", socialAccountId: null, state: "failed", scheduledAt },
      ], nextCursor: null },
    });

    expect(markup.match(/data-content-event=/g)).toHaveLength(1);
    expect(markup).toContain("product-reveal");
    expect(markup).toContain("Launch campaign");
    expect(markup).toContain("tiktok");
    expect(markup).toContain("Scheduled");
    expect(markup).toContain("instagram");
    expect(markup).toContain("Failed");
    expect(markup).toContain("1 channel needs attention");
    expect(markup).toContain('aria-label="Open product-reveal scheduled');
    expect(markup).toContain('in Calendar"');
    expect(markup).toContain('aria-label="Open Unit product-reveal scheduled');
    expect(markup).toContain('aria-label="Review problem for product-reveal scheduled');
  });

  test("preserves a partial publishing page beside returned events", async () => {
    const publication = populatedOverview.publications.items[0];
    const markup = await renderWorkspace({
      ...populatedOverview,
      publications: { items: [{
        ...publication,
        state: "scheduled",
        scheduledAt: Date.now() + 60 * 60 * 1000,
      }], nextCursor: "more-publications" },
    });

    expect(markup).toContain("Partial publishing data");
    expect(markup).toContain("Upcoming publications are limited to the returned Core page");
    expect(markup).toContain("Scheduled");
  });

  test("renders the empty planning action and routes it to Calendar", async () => {
    const openPage = vi.fn();
    const markup = renderToStaticMarkup(<WorkspacePlanAndOutcomes
      value={{
        plan: {
          days: planDays,
          coverage: { status: "unavailable", reason: "Cadence targets are not configured in the current Core contract." },
          upcoming: { status: "empty", reason: "Nothing scheduled in the next 14 days." },
          readyUnscheduled: { status: "unavailable", reason: "Ready Unit lifecycle state is not available from the current Core contract." },
        },
        outcomes: { status: "unavailable", reason: "Performance benchmarks and observation windows are not available from Core yet." },
      }}
      onOpenPage={openPage}
      onOpenUnit={() => undefined}
    />);

    expect(markup).toContain("Nothing scheduled in the next 14 days");
    expect(markup).toContain("Open Calendar");

    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<WorkspacePlanAndOutcomes
        value={{
          plan: {
            days: planDays,
            coverage: { status: "unavailable", reason: "Cadence unavailable." },
            upcoming: { status: "empty", reason: "Nothing scheduled in the next 14 days." },
            readyUnscheduled: { status: "unavailable", reason: "Ready Units unavailable." },
          },
          outcomes: { status: "unavailable", reason: "Outcomes unavailable." },
        }}
        onOpenPage={openPage}
        onOpenUnit={() => undefined}
      />));
      const openCalendar = [...host.container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Open Calendar"));
      await act(async () => openCalendar!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(openPage).toHaveBeenCalledWith("calendar");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("routes grouped events to their Unit and falls back to the Units page", async () => {
    const openPage = vi.fn();
    const openUnit = vi.fn();
    const event = {
      unitId: "unit-1",
      scheduledAt: Date.now() + 60 * 60 * 1000,
      publications: [{ ...populatedOverview.publications.items[0], state: "scheduled" as const }],
    };
    const incompleteMarkup = renderToStaticMarkup(<WorkspacePlanAndOutcomes
      value={{
        plan: {
          days: planDays,
          coverage: { status: "unavailable", reason: "Cadence unavailable." },
          upcoming: { status: "partial", reason: "Lookup pages are incomplete.", value: [{ ...event, unitId: "unit-raw-id", scheduledAt: planDays[0]!, accounts: [], unit: null, project: null }] },
          readyUnscheduled: { status: "unavailable", reason: "Ready Units unavailable." },
        },
        outcomes: { status: "unavailable", reason: "Outcomes unavailable." },
      }}
      onOpenPage={openPage}
      onOpenUnit={openUnit}
    />);
    expect(incompleteMarkup).toContain("Unit details unavailable");
    expect(incompleteMarkup).toContain("Account details unavailable");
    expect(incompleteMarkup).toContain(">Open Units<");
    expect(incompleteMarkup).toContain('aria-label="Open Units for Unit details unavailable scheduled');
    expect(incompleteMarkup).not.toContain(">unit-raw-id<");
    expect(incompleteMarkup).not.toContain("Account account-1");
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<WorkspacePlanAndOutcomes
        value={{
          plan: {
            days: planDays,
            coverage: { status: "unavailable", reason: "Cadence unavailable." },
            upcoming: { status: "ready", value: [{
              ...event,
              accounts: [],
              unit: {
                id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", compositionId: null,
                slug: "Product reveal", format: "video", latestRevisionId: "revision-5",
                selectedRevisionId: "revision-5", createdAt: 1, updatedAt: 2,
              },
              project: null,
            }] },
            readyUnscheduled: { status: "unavailable", reason: "Ready Units unavailable." },
          },
          outcomes: { status: "unavailable", reason: "Outcomes unavailable." },
        }}
        onOpenPage={openPage}
        onOpenUnit={openUnit}
      />));
      const openUnitButton = [...host.container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Open Unit"));
      await act(async () => openUnitButton!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(openUnit).toHaveBeenCalledWith("project-1", "unit-1");

      await act(async () => root.render(<WorkspacePlanAndOutcomes
        value={{
          plan: {
            days: planDays,
            coverage: { status: "unavailable", reason: "Cadence unavailable." },
            upcoming: { status: "ready", value: [{ ...event, accounts: [], unit: null, project: null }] },
            readyUnscheduled: { status: "unavailable", reason: "Ready Units unavailable." },
          },
          outcomes: { status: "unavailable", reason: "Outcomes unavailable." },
        }}
        onOpenPage={openPage}
        onOpenUnit={openUnit}
      />));
      const fallback = [...host.container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Open Unit"));
      await act(async () => fallback!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(openPage).toHaveBeenCalledWith("units");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("opens the complete Unit outcome detail shell", async () => {
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<WorkspacePlanAndOutcomes
        value={{
          plan: {
            days: planDays,
            coverage: { status: "unavailable", reason: "Cadence unavailable." },
            upcoming: { status: "empty", reason: "Nothing scheduled in the next 14 days." },
            readyUnscheduled: { status: "unavailable", reason: "Ready Units unavailable." },
          },
          outcomes: { status: "ready", value: {
            top: [{ id: "unit-1", unitId: "unit-1", projectId: "project-1", title: "Product reveal", projectTitle: "Launch campaign", revisionLabel: "Revision 5" }],
            emerging: [], learningOpportunities: [],
          } },
        }}
        onOpenPage={() => undefined}
        onOpenUnit={() => undefined}
      />));
      const card = [...host.container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Product reveal"));
      await act(async () => card!.dispatchEvent(new Event("click", { bubbles: true })));

      const dialog = document.body.querySelector("[role=dialog]");
      expect(dialog?.textContent).toContain("Unit outcome detail");
      expect(dialog?.textContent).toContain("Result");
      expect(dialog?.textContent).toContain("Normalized result is not available from the current Core contract");
      expect(dialog?.textContent).toContain("Benchmark method");
      expect(dialog?.textContent).toContain("Benchmark method is not available from the current Core contract");
      expect(dialog?.textContent).toContain("Child publications");
      expect(dialog?.textContent).toContain("Child publication metrics are not available from the current Core contract");
      expect(dialog?.textContent).toContain("Observation window");
      expect(dialog?.textContent).toContain("Observation windows are not available from the current Core contract");
      expect(dialog?.textContent).toContain("Destination");
      expect(dialog?.textContent).toContain("Destination outcomes are not available from the current Core contract");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("renders honest unavailable insight and efficiency states without unsupported claims", async () => {
    const markup = await renderWorkspace(populatedOverview);

    expect(markup).toContain("What works");
    expect(markup).toContain("What Ralphy learned");
    expect(markup).toContain("More comparable publications are needed");
    expect(markup).toContain("Production efficiency");
    expect(markup).toContain("Production timing and reuse evidence are not available from Core yet");
    expect(markup.match(/Production timing and reuse evidence are not available from Core yet/g)).toHaveLength(6);
    expect(markup).not.toMatch(/caused|guaranteed|viral score/i);
  });

  test("renders complete strong, weak, and insufficient evidence cards and six efficiency slots", () => {
    const markup = renderToStaticMarkup(<WorkspaceInsights
      value={{
        insights: { status: "ready", value: [
          {
            id: "insight-strong",
            observation: "Product-first openings are associated with stronger performance.",
            dimension: "Opening hook: product visible in the first two seconds",
            platform: "TikTok",
            account: "@launch",
            reportingWindow: "Last 90 days · first 24 hours",
            sampleSize: 9,
            method: "Comparable short-form Units on the same account and observation window.",
            baseline: "Workspace median: 12,000 views",
            medianComparison: "Observed median: 20,400 views · 1.7× workspace median",
            evidenceStrength: "strong",
            supportingUnits: [{ id: "unit-1", label: "Product reveal" }],
            counterexamples: [{ id: "unit-2", label: "Quiet launch" }],
            caveats: ["Association only; publication timing may differ."],
            memoryAction: { status: "ready", value: { label: "Save as proposed Memory" } },
          },
          {
            id: "insight-weak",
            observation: "The sonic hook frequently appears in stronger Instagram results.",
            dimension: "Audio: approved brand sonic hook",
            platform: "Instagram",
            account: "@studio",
            reportingWindow: "Last 60 days · first 7 days",
            sampleSize: 7,
            method: "Comparable Reels with recorded approved-audio lineage.",
            baseline: "Workspace median: 8,500 views",
            medianComparison: "Observed median: 9,200 views · 1.08× workspace median",
            evidenceStrength: "weak",
            supportingUnits: [{ id: "unit-3", label: "Studio cut" }],
            counterexamples: [{ id: "unit-4", label: "Silent close-up" }],
            caveats: ["The sample is small and audio usage overlaps with format."],
            memoryAction: { status: "unavailable", reason: "The learning is not ready for Memory review." },
          },
          {
            id: "insight-insufficient",
            observation: "No reliable duration pattern is available yet.",
            dimension: "Duration: 18–24 seconds",
            platform: "YouTube",
            account: "@launch-shorts",
            reportingWindow: "Last 30 days · first 7 days",
            sampleSize: 3,
            method: "Same-account Shorts with a complete seven-day observation window.",
            baseline: "Workspace median unavailable for an eligible sample",
            medianComparison: "Median comparison unavailable until more Units qualify",
            evidenceStrength: "insufficient",
            supportingUnits: [{ id: "unit-5", label: "Fast demo" }],
            counterexamples: [{ id: "unit-6", label: "Long demo" }],
            caveats: ["Approximately five more comparable Units are needed."],
            memoryAction: { status: "unavailable", reason: "Insufficient evidence cannot be proposed as Memory." },
          },
        ] },
        efficiency: { status: "ready", value: {
          metrics: [
            { id: "production-time", value: { status: "ready", value: "42m" } },
            { id: "revisions", value: { status: "ready", value: "3" } },
            { id: "cost", value: { status: "ready", value: "$18" } },
            { id: "adaptation", value: { status: "ready", value: "68%" } },
            { id: "asset-reuse", value: { status: "ready", value: "74%" } },
            { id: "conversion", value: { status: "ready", value: "18 of 24 Units" } },
          ],
          sharedAction: { status: "ready", value: { label: "Open Shared library" } },
        } },
      }}
      onOpenPage={() => undefined}
    />);

    for (const text of [
      "TikTok · @launch",
      "Instagram · @studio",
      "YouTube · @launch-shorts",
      "Last 90 days · first 24 hours",
      "Last 60 days · first 7 days",
      "Last 30 days · first 7 days",
      "9 comparable Units",
      "7 comparable Units",
      "3 comparable Units",
      "Workspace median: 12,000 views",
      "Workspace median: 8,500 views",
      "Workspace median unavailable for an eligible sample",
      "Strong evidence",
      "Weak evidence",
      "Insufficient evidence",
      "Supporting Units",
      "Counterexamples",
      "Caveats",
      "Product reveal",
      "Quiet launch",
      "Approximately five more comparable Units are needed.",
      "Median production time",
      "Median revisions before selection",
      "Generation cost per published Unit",
      "Multi-platform adaptation",
      "Approved Shared Library reuse",
      "Production-to-publication conversion",
    ]) expect(markup).toContain(text);
    expect(markup.match(/Save as proposed Memory/g)).toHaveLength(1);
    expect(markup.match(/No reliable duration pattern is available yet\./g)).toHaveLength(1);
    expect(markup.match(/class="workspace-efficiency-metric/g)).toHaveLength(6);
  });

  test("opens evidence in the required reading order and routes only available actions", async () => {
    const openPage = vi.fn();
    const value = {
      insights: { status: "ready" as const, value: [{
        id: "insight-1",
        observation: "Product-first openings are associated with stronger performance.",
        dimension: "Opening hook: product visible in the first two seconds",
        platform: "TikTok",
        account: "@launch",
        reportingWindow: "Last 90 days · first 24 hours",
        sampleSize: 9,
        method: "Comparable short-form Units on the same account and observation window.",
        baseline: "Workspace median: 12,000 views",
        medianComparison: "Observed median: 20,400 views · 1.7× workspace median",
        evidenceStrength: "strong" as const,
        supportingUnits: [{ id: "unit-1", label: "Product reveal" }],
        counterexamples: [{ id: "unit-2", label: "Quiet launch" }],
        caveats: ["Association only; publication timing may differ."],
        memoryAction: { status: "ready" as const, value: { label: "Save as proposed Memory" } },
      }] },
      efficiency: { status: "ready" as const, value: {
        metrics: [
          { id: "production-time" as const, value: { status: "unavailable" as const, reason: "Selection timestamps are unavailable." } },
          { id: "revisions" as const, value: { status: "unavailable" as const, reason: "Revision history is unavailable." } },
          { id: "cost" as const, value: { status: "unavailable" as const, reason: "Generation cost is unavailable." } },
          { id: "adaptation" as const, value: { status: "unavailable" as const, reason: "Adaptation lineage is unavailable." } },
          { id: "asset-reuse" as const, value: { status: "unavailable" as const, reason: "Approved asset lineage is unavailable." } },
          { id: "conversion" as const, value: { status: "unavailable" as const, reason: "Publication conversion is unavailable." } },
        ],
        sharedAction: { status: "ready" as const, value: { label: "Open Shared library" } },
      } },
    };
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<WorkspaceInsights value={value} onOpenPage={openPage} />));
      const review = [...host.container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Review evidence"));
      await act(async () => review!.dispatchEvent(new Event("click", { bubbles: true })));

      const dialog = document.body.querySelector("[role=dialog]");
      const text = dialog?.textContent ?? "";
      const sections = ["Method and sample", "Median comparison", "Supporting Units", "Counterexamples", "Caveats", "Memory action"];
      const positions = sections.map((section) => text.indexOf(section));
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
      expect(text).toContain("Quiet launch");

      const saveMemory = [...dialog!.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Save as proposed Memory"));
      await act(async () => saveMemory!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(openPage).toHaveBeenCalledWith("memory");

      const openShared = [...host.container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Open Shared library"));
      await act(async () => openShared!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(openPage).toHaveBeenCalledWith("shared");
      for (const reason of [
        "Selection timestamps are unavailable.",
        "Revision history is unavailable.",
        "Generation cost is unavailable.",
        "Adaptation lineage is unavailable.",
        "Approved asset lineage is unavailable.",
        "Publication conversion is unavailable.",
      ]) expect(host.container.textContent).toContain(reason);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
