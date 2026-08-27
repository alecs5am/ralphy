import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { WorkspaceOverviewDto } from "../electron/ralphy/types";
import type { ProjectSummary } from "@/shared/api/ipc";
import {
  WorkspaceScreenView,
  createWorkspaceScreenController,
} from "@/pages/workspace/ui/WorkspaceScreen";
import type { WorkspaceMomentumPresentation, WorkspaceOverviewPresentation } from "@/pages/workspace/lib/overview-presentation";
import { AccessibleTrendChart, WorkspaceMomentum } from "@/pages/workspace/ui/WorkspacePerformance";
import { WorkspacePlanAndOutcomes } from "@/pages/workspace/ui/WorkspacePlanAndOutcomes";
import { WorkspaceInsights } from "@/pages/workspace/ui/WorkspaceInsights";
import { WorkspaceOperations } from "@/pages/workspace/ui/WorkspaceOperations";
import { WorkspaceOverviewHeader } from "@/pages/workspace/ui/WorkspaceOverviewHeader";
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

const catalogProject: ProjectSummary = {
  id: "project-1", workspaceId: "workspace-1", projectId: "project-1", name: "Launch campaign",
  brief: "Launch the new product line", status: "active", phase: "production", finalState: "working",
  platform: "tiktok", aspectRatio: "9:16", spendUsd: null, finalCount: 1, sharedCount: 2,
  unitCount: 3, recentActivity: "2026-08-20T09:00:00.000Z",
};

async function renderWorkspace(
  value: WorkspaceOverviewDto,
  snapshotPatch: { error?: string | null; refreshing?: boolean } = {},
  catalogProjects: ProjectSummary[] = [],
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
      catalogProjects={catalogProjects}
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
    expect(markup).toContain("Refreshed");
    expect(markup).toContain("Current Core totals");
    expect(markup).toContain("1 connected account");
    expect(markup).toContain("1 critical");
    expect(markup).toContain("Refreshing");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain("Timezone");
    expect(markup).not.toContain("New project");
  });

  test("labels actual refresh freshness instead of the workspace record timestamp", () => {
    const controller = createWorkspaceScreenController({ loadWorkspaceOverview: vi.fn(async () => populatedOverview) }, "workspace-1");
    const markup = renderToStaticMarkup(<WorkspaceScreenView
      controller={controller}
      snapshot={{ status: "ready", value: populatedOverview, error: null, refreshing: false, lastSuccessfulRefreshAt: Date.UTC(2026, 7, 20, 10, 42) }}
      catalogProjects={[]}
      workspaceDescription="Short-form launches"
      onOpenPage={() => undefined}
      onOpenUnit={() => undefined}
      onOpenProject={() => undefined}
    />);

    expect(markup).toContain("Refreshed");
    expect(markup).toContain("2026-08-20T10:42:00.000Z");
    expect(markup.slice(0, markup.indexOf("workspace-overview-scroll"))).not.toContain("1970-01-01T00:00:02.000Z");
  });

  test("announces successful and failed retained-data refreshes without a false success", async () => {
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    const value = {
      id: "workspace-1", name: "Launch Studio", description: "Short-form launches",
      updatedAt: 2, accountCount: { status: "ready" as const, value: 1 },
    };
    try {
      await act(async () => root.render(<WorkspaceOverviewHeader
        value={value}
        criticalCount={{ status: "ready", value: 2 }}
        refreshing
        lastSuccessfulRefreshAt={1_000}
        error={null}
        onRefresh={() => undefined}
      />));
      await act(async () => root.render(<WorkspaceOverviewHeader
        value={value}
        criticalCount={{ status: "ready", value: 2 }}
        refreshing={false}
        lastSuccessfulRefreshAt={2_000}
        error={null}
        onRefresh={() => undefined}
      />));

      const live = host.container.querySelector("[aria-live=polite]");
      expect(live?.getAttribute("aria-atomic")).toBe("true");
      expect(live?.textContent).toBe("Workspace refreshed. 2 critical issues.");

      await act(async () => root.render(<WorkspaceOverviewHeader
        value={value}
        criticalCount={{ status: "ready", value: 2 }}
        refreshing
        lastSuccessfulRefreshAt={2_000}
        error={null}
        onRefresh={() => undefined}
      />));
      await act(async () => root.render(<WorkspaceOverviewHeader
        value={value}
        criticalCount={{ status: "ready", value: 2 }}
        refreshing={false}
        lastSuccessfulRefreshAt={2_000}
        error="Refresh unavailable"
        onRefresh={() => undefined}
      />));

      expect(live?.textContent).toBe("Refresh failed. Refresh unavailable");
      expect(live?.textContent).not.toContain("Workspace refreshed");

      await act(async () => root.render(<WorkspaceOverviewHeader
        value={value}
        criticalCount={{ status: "ready", value: 2 }}
        refreshing
        lastSuccessfulRefreshAt={2_000}
        error={null}
        onRefresh={() => undefined}
      />));
      await act(async () => root.render(<WorkspaceOverviewHeader
        value={value}
        criticalCount={{ status: "ready", value: 2 }}
        refreshing={false}
        lastSuccessfulRefreshAt={1_500}
        error="System clock moved backward"
        onRefresh={() => undefined}
      />));

      expect(live?.textContent).toBe("Refresh failed. System clock moved backward");
      expect(live?.textContent).not.toContain("Workspace refreshed");

      await act(async () => root.render(<WorkspaceOverviewHeader
        value={value}
        criticalCount={{ status: "ready", value: 2 }}
        refreshing
        lastSuccessfulRefreshAt={null}
        error={null}
        onRefresh={() => undefined}
      />));
      await act(async () => root.render(<WorkspaceOverviewHeader
        value={value}
        criticalCount={{ status: "ready", value: 2 }}
        refreshing={false}
        lastSuccessfulRefreshAt={3_000}
        error={null}
        onRefresh={() => undefined}
      />));

      expect(live?.textContent).toBe("Workspace refreshed. 2 critical issues.");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
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

  test("prefixes only real usernames and labels missing handles without exposing external IDs", async () => {
    const account = populatedOverview.accounts.items[0];
    const markup = await renderWorkspace({
      ...populatedOverview,
      accounts: { items: [
        { ...account, id: "username", username: "launch", displayName: "Launch Studio", externalId: "private-username-id" },
        { ...account, id: "display", username: null, displayName: "Studio Team", externalId: "private-display-id" },
        { ...account, id: "missing", username: null, displayName: null, externalId: "private-missing-id" },
      ], nextCursor: null },
    });

    expect(markup).toContain("@launch");
    expect(markup).toContain("Launch Studio");
    expect(markup).toContain("Studio Team");
    expect(markup.match(/Handle unavailable/g)).toHaveLength(2);
    expect(markup).not.toContain("@Launch Studio");
    expect(markup).not.toContain("@Studio Team");
    expect(markup).not.toContain("private-");
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

      const openCalendar = [...drawer!.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Open Calendar"));
      await act(async () => openCalendar!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(openPage).toHaveBeenCalledWith("calendar", "workspace-account-account-1");
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
      expect(openPage).toHaveBeenCalledWith("calendar", "workspace-empty-calendar");
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
      expect(openUnit).toHaveBeenCalledWith("project-1", "unit-1", "Product reveal", `workspace-open-unit-unit-1-${event.scheduledAt}`);

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
      expect(openPage).toHaveBeenCalledWith("units", `workspace-open-unit-unit-1-${event.scheduledAt}`);
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
      expect(openPage).toHaveBeenCalledWith("memory", "workspace-insight-insight-1");

      const openShared = [...host.container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Open Shared library"));
      await act(async () => openShared!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(openPage).toHaveBeenCalledWith("shared", "workspace-open-shared");
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

  test("restores focus to the exact Learned review trigger after Memory unmounts and remounts insights", async () => {
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
        counterexamples: [],
        caveats: [],
        memoryAction: { status: "ready" as const, value: { label: "Save as proposed Memory" } },
      }] },
      efficiency: { status: "unavailable" as const, reason: "Efficiency unavailable." },
    };
    function Harness() {
      const [page, setPage] = useState<"overview" | "memory">("overview");
      const [returnFocusId, setReturnFocusId] = useState<string | null>(null);
      useEffect(() => {
        if (page === "overview" && returnFocusId) document.getElementById(returnFocusId)?.focus();
      }, [page, returnFocusId]);
      return page === "memory"
        ? <main><h1>Memory</h1><button type="button" onClick={() => setPage("overview")}>Back to Overview</button></main>
        : <WorkspaceInsights value={value} onOpenPage={(destination, focusId) => {
          if (destination !== "memory") return;
          setReturnFocusId(focusId);
          setPage("memory");
        }} />;
    }

    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<Harness />));
      const learnedReview = [...host.container.querySelectorAll(".workspace-learning-list button")]
        .find((button) => button.textContent === "Review evidence")!;
      expect(learnedReview.getAttribute("id")).toBe("workspace-learning-review-insight-1");
      await act(async () => learnedReview.dispatchEvent(new Event("click", { bubbles: true })));
      const saveMemory = [...document.body.querySelectorAll("[role=dialog] button")]
        .find((button) => button.textContent === "Save as proposed Memory")!;
      await act(async () => saveMemory.dispatchEvent(new Event("click", { bubbles: true })));
      expect(host.container.textContent).toContain("Memory");

      const back = [...host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "Back to Overview")!;
      await act(async () => back.dispatchEvent(new Event("click", { bubbles: true })));
      expect(document.activeElement?.getAttribute("id")).toBe("workspace-learning-review-insight-1");
      expect(document.activeElement?.getAttribute("id")).not.toBe("workspace-insight-insight-1");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("renders the complete operations inventory in priority order without raw activity vocabulary", async () => {
    const project = {
      id: "project-1", workspaceId: "workspace-1", slug: "launch-campaign", name: "Launch campaign",
      state: "active" as const, rowVersion: 1, createdAt: 1, updatedAt: 2,
    };
    const publication = populatedOverview.publications.items[0];
    const markup = await renderWorkspace({
      ...populatedOverview,
      accounts: { items: [{ ...populatedOverview.accounts.items[0], relinkRequired: true }], nextCursor: null },
      projects: { items: [project], nextCursor: null },
      publications: { items: [publication, { ...publication, id: "publication-2" }], nextCursor: null },
    }, {}, [catalogProject]);
    const headings = ["Attention", "Production pulse", "In progress", "Active projects", "Recent changes"];
    const positions = headings.map((heading) => markup.indexOf(heading));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(markup).toContain('<ul class="workspace-attention-list');
    expect(markup).toContain("Affects 2 publications");
    expect(markup).toContain("Review publications");
    expect(markup).toContain("Workspace run and build progress is not available from Core yet");
    expect(markup).toContain("Core currently returns technical activity without display names");
    expect(markup).toContain("Launch the new product line");
    expect(markup).toContain("Open project");
    expect(markup).toContain("View all projects");
    expect(markup).not.toMatch(/#\d+ · [a-z]+\.[a-z]+/);
    expect(markup).not.toContain(">Fix<");
  });

  test("distinguishes grouped account failures in row text and primary action names", async () => {
    const account = populatedOverview.accounts.items[0];
    const publication = populatedOverview.publications.items[0];
    const markup = await renderWorkspace({
      ...populatedOverview,
      accounts: { items: [
        account,
        { ...account, id: "account-2", externalId: "external-2", username: "studio", displayName: "Studio" },
      ], nextCursor: null },
      projects: { items: [{
        id: "project-1", workspaceId: "workspace-1", slug: "launch-campaign", name: "Launch campaign",
        state: "active", rowVersion: 1, createdAt: 1, updatedAt: 2,
      }], nextCursor: null },
      publications: { items: [
        { ...publication, id: "publication-launch", socialAccountId: account.id },
        { ...publication, id: "publication-studio", socialAccountId: "account-2" },
      ], nextCursor: null },
    });

    expect(markup).toContain("Publication failed · Launch");
    expect(markup).toContain("Publication failed · Studio");
    expect(markup).toContain('aria-label="Review publications for Publication failed · Launch"');
    expect(markup).toContain('aria-label="Review publications for Publication failed · Studio"');
  });

  test("distinguishes no attention and no active work from unavailable production data", () => {
    const base = {
      attention: { status: "ready", value: { items: [], criticalCount: { status: "ready", value: 0 } } },
      projects: { status: "ready", value: [] },
      recentChanges: { status: "unavailable", reason: "Human-readable changes are unavailable." },
      onboarding: { status: "ready", value: false },
    } satisfies Pick<WorkspaceOverviewPresentation, "attention" | "projects" | "recentChanges" | "onboarding">;
    const empty = renderToStaticMarkup(<WorkspaceOperations
      value={{ ...base, pulse: { status: "ready", value: { stages: [] } } }}
      onOpenProject={() => undefined}
      onOpenPage={() => undefined}
      onRetry={() => undefined}
    />);
    const unavailable = renderToStaticMarkup(<WorkspaceOperations
      value={{ ...base, pulse: { status: "unavailable", reason: "Production data is unavailable." } }}
      onOpenProject={() => undefined}
      onOpenPage={() => undefined}
      onRetry={() => undefined}
    />);

    expect(empty).toContain("Nothing needs attention");
    expect(empty).toContain("No Units are currently in production");
    expect(empty).not.toContain("Active production work is unavailable");
    expect(unavailable).toContain("Active production work is unavailable");
    expect(unavailable).not.toContain("No Units are currently in production");
  });

  test("renders ordered new-workspace onboarding with only supported destinations", async () => {
    const openPage = vi.fn();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<WorkspaceOperations
        value={{
          attention: { status: "ready", value: { items: [], criticalCount: { status: "ready", value: 0 } } },
          pulse: { status: "unavailable", reason: "Production data is unavailable." },
          projects: { status: "ready", value: [] },
          recentChanges: { status: "unavailable", reason: "Changes are unavailable." },
          onboarding: { status: "ready", value: true },
        }}
        onOpenProject={() => undefined}
        onOpenPage={openPage}
        onRetry={() => undefined}
      />));
      const text = host.container.textContent ?? "";
      const steps = ["Create or import a project", "Add reusable brand assets", "Plan publishing"];
      const positions = steps.map((step) => text.indexOf(step));
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
      expect(text).toContain("Start producing in this workspace");
      expect(text).not.toContain("Connect account");

      for (const [label, page] of [["Open Projects", "projects"], ["Open Shared library", "shared"], ["Open Calendar", "calendar"]] as const) {
        const button = [...host.container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
        await act(async () => button!.dispatchEvent(new Event("click", { bubbles: true })));
        expect(openPage).toHaveBeenCalledWith(page, `workspace-onboarding-${page}`);
      }
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("keeps Attention ahead of onboarding when workspace setup is empty but account action is required", () => {
    const markup = renderToStaticMarkup(<WorkspaceOperations
      value={{
        attention: { status: "ready", value: { items: [{
          kind: "account-relink", severity: "warning", accountId: "account-1",
          affectedCount: { status: "unavailable", reason: "Affected references unavailable." },
          title: "Launch needs relinking",
        }], criticalCount: { status: "ready", value: 0 } } },
        pulse: { status: "unavailable", reason: "Production data is unavailable." },
        projects: { status: "ready", value: [] },
        recentChanges: { status: "unavailable", reason: "Changes are unavailable." },
        onboarding: { status: "ready", value: true },
      }}
      onOpenProject={() => undefined}
      onOpenPage={() => undefined}
      onRetry={() => undefined}
    />);

    expect(markup).toContain("Launch needs relinking");
    expect(markup).toContain("Start producing in this workspace");
    expect(markup.indexOf("Attention")).toBeLessThan(markup.indexOf("Start producing in this workspace"));
  });

  test("treats bounded operations as informational and routes to complete destination pages", async () => {
    const retry = vi.fn();
    const openPage = vi.fn();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<WorkspaceOperations
        value={{
          attention: { status: "partial", reason: "Attention is limited.", value: { items: [], criticalCount: { status: "partial", reason: "Limited.", value: 0 } } },
          pulse: { status: "unavailable", reason: "Production data is unavailable." },
          projects: { status: "partial", reason: "Projects are limited.", value: [{ id: "project-1", name: "Launch campaign", slug: "launch-campaign", updatedAt: 2, catalog: catalogProject }] },
          recentChanges: { status: "unavailable", reason: "Human-readable changes are unavailable." },
          onboarding: { status: "ready", value: false },
        }}
        onOpenProject={() => undefined}
        onOpenPage={openPage}
        onRetry={retry}
      />));

      expect(host.container.textContent).toContain("Bounded attention data");
      expect(host.container.textContent).toContain("Bounded project data");
      expect(host.container.textContent).not.toContain("Retry attention");
      expect(host.container.textContent).not.toContain("Retry projects");
      expect(host.container.textContent).toContain("Launch campaign");
      expect(host.container.textContent).toContain("Production pulse");

      const viewAll = [...host.container.querySelectorAll("button")]
        .find((button) => button.textContent === "View all projects");
      await act(async () => viewAll!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(openPage).toHaveBeenCalledWith("projects", "workspace-view-all-projects");
      expect(retry).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("gives every attention row one named primary action and caps continuation projects at four", async () => {
    const openPage = vi.fn();
    const openProject = vi.fn();
    const projects = Array.from({ length: 5 }, (_, index) => ({
      id: `project-${index}`, name: `Project ${index}`, slug: `project-${index}`, updatedAt: 10 - index,
      catalog: { ...catalogProject, id: `project-${index}`, projectId: `project-${index}`, name: `Project ${index}` },
    }));
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<WorkspaceOperations
        value={{
          attention: { status: "ready", value: { items: [
            { kind: "publication-failure", severity: "critical", accountId: "account-1", affectedCount: { status: "ready", value: 3 }, title: "Publication failed" },
            { kind: "account-relink", severity: "warning", accountId: "account-1", affectedCount: { status: "ready", value: 3 }, title: "Launch needs relinking" },
          ], criticalCount: { status: "ready", value: 1 } } },
          pulse: { status: "unavailable", reason: "Production data is unavailable." },
          projects: { status: "ready", value: projects },
          recentChanges: { status: "ready", value: [{ id: "#928 · entity.update" }] },
          onboarding: { status: "ready", value: false },
        }}
        onOpenProject={openProject}
        onOpenPage={openPage}
        onRetry={() => undefined}
      />));

      const attentionRows = host.container.querySelector(".workspace-attention-list")!.querySelectorAll("li");
      expect(attentionRows).toHaveLength(2);
      for (const row of attentionRows) {
        expect(row.querySelectorAll("button")).toHaveLength(1);
        expect(row.querySelector("button")?.textContent).toMatch(/Review publications|Review account publications/);
      }
      expect(host.container.querySelector(".workspace-active-project-list")!.querySelectorAll("li")).toHaveLength(4);
      expect(host.container.textContent).not.toContain("Project 4");
      expect(host.container.textContent).not.toContain("#928");

      const open = [...host.container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Open project Project 0");
      await act(async () => open!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(openProject).toHaveBeenCalledWith(projects[0]!.catalog);
      const viewAll = [...host.container.querySelectorAll("button")].find((button) => button.textContent === "View all projects");
      await act(async () => viewAll!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(openPage).toHaveBeenCalledWith("projects", "workspace-view-all-projects");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("preserves the total when attention is initially limited to five rows", async () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      kind: "publication-failure" as const,
      severity: "critical" as const,
      accountId: `account-${index}`,
      affectedCount: { status: "ready" as const, value: 1 },
      title: `Publication group ${index + 1} failed`,
    }));
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<WorkspaceOperations
        value={{
          attention: { status: "ready", value: { items, criticalCount: { status: "ready", value: 6 } } },
          pulse: { status: "unavailable", reason: "Production data is unavailable." },
          projects: { status: "ready", value: [] },
          recentChanges: { status: "unavailable", reason: "Changes are unavailable." },
          onboarding: { status: "ready", value: false },
        }}
        onOpenProject={() => undefined}
        onOpenPage={() => undefined}
        onRetry={() => undefined}
      />));

      expect(host.container.textContent).toContain("Showing 5 of 6 actionable items");
      expect(host.container.querySelector(".workspace-attention-list")!.querySelectorAll("li")).toHaveLength(5);
      const viewAll = [...host.container.querySelectorAll("button")].find((button) => button.textContent === "View all attention");
      await act(async () => viewAll!.dispatchEvent(new Event("click", { bubbles: true })));
      expect(host.container.querySelector(".workspace-attention-list")!.querySelectorAll("li")).toHaveLength(6);
      expect(host.container.textContent).toContain("Showing all 6 actionable items");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("retries Overview focus restoration when the durable Attention target arrives later", async () => {
    const controller = createWorkspaceScreenController({ loadWorkspaceOverview: vi.fn(async () => populatedOverview) }, "workspace-1");
    const withoutAttention: WorkspaceOverviewDto = {
      ...populatedOverview,
      publications: { items: [], nextCursor: null },
      metrics: { ...populatedOverview.metrics, publicationCount: 0 },
    };
    const returnState = {
      originWorkspaceId: "workspace-1",
      scrollTop: 0,
      attentionExpanded: false,
      returnFocusId: "workspace-attention-publication-failure-account-1",
    };
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    const props = {
      controller,
      catalogProjects: [] as ProjectSummary[],
      workspaceDescription: "Short-form launches",
      overviewReturnState: returnState,
      onOpenPage: () => undefined,
      onOpenUnit: () => undefined,
      onOpenProject: () => undefined,
    };
    try {
      await act(async () => root.render(<WorkspaceScreenView {...props} snapshot={{
        status: "ready", value: withoutAttention, error: null, refreshing: false, lastSuccessfulRefreshAt: 1_000,
      }} />));
      expect(document.getElementById(returnState.returnFocusId)).toBeNull();

      await act(async () => root.render(<WorkspaceScreenView {...props} snapshot={{
        status: "ready", value: populatedOverview, error: null, refreshing: false, lastSuccessfulRefreshAt: 2_000,
      }} />));
      expect(document.activeElement?.getAttribute("id")).toBe(returnState.returnFocusId);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("uses stable initial skeletons and a full-page retry surface", () => {
    const controller = createWorkspaceScreenController({ loadWorkspaceOverview: vi.fn(async () => populatedOverview) }, "workspace-1");
    const loading = renderToStaticMarkup(<WorkspaceScreenView
      controller={controller}
      snapshot={{ status: "loading", value: null, error: null, refreshing: false }}
      catalogProjects={[]}
      workspaceDescription="Short-form launches"
      onOpenPage={() => undefined}
      onOpenUnit={() => undefined}
      onOpenProject={() => undefined}
    />);
    const error = renderToStaticMarkup(<WorkspaceScreenView
      controller={controller}
      snapshot={{ status: "error", value: null, error: "Core unavailable", refreshing: false }}
      catalogProjects={[]}
      workspaceDescription="Short-form launches"
      onOpenPage={() => undefined}
      onOpenUnit={() => undefined}
      onOpenProject={() => undefined}
    />);

    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Workspace overview");
    expect(loading.match(/workspace-overview-skeleton-section/g)).toHaveLength(4);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Workspace overview could not be loaded");
    expect(error).toContain("Core unavailable");
    expect(error).toContain(">Retry<");
  });

  test("retains workspace identity in initial loading and error headers", () => {
    const controller = createWorkspaceScreenController({ loadWorkspaceOverview: vi.fn(async () => populatedOverview) }, "workspace-1");
    const props = {
      controller,
      catalogProjects: [],
      workspaceName: "Launch Studio",
      workspaceDescription: "Short-form launches",
      onOpenPage: () => undefined,
      onOpenUnit: () => undefined,
      onOpenProject: () => undefined,
    };
    const loading = renderToStaticMarkup(<WorkspaceScreenView {...props} snapshot={{ status: "loading", value: null, error: null, refreshing: false }} />);
    const error = renderToStaticMarkup(<WorkspaceScreenView {...props} snapshot={{ status: "error", value: null, error: "Core unavailable", refreshing: false }} />);

    for (const markup of [loading, error]) {
      expect(markup).toContain("Launch Studio");
      expect(markup).toContain("Short-form launches");
    }
  });

  test("locks the narrow operations order and account breakpoints", () => {
    // Both decisions moved onto the elements that make them. The authored 1000px query never
    // rendered: the utility on the operations grid always beat it, so this now reads the grid
    // that actually decides, and the theme key that names the width it decides at.
    const operations = readFileSync(join(process.cwd(), "src/pages/workspace/ui/WorkspaceOperations.tsx"), "utf8");
    const performance = readFileSync(join(process.cwd(), "src/pages/workspace/ui/WorkspacePerformance.tsx"), "utf8");
    const theme = readFileSync(join(process.cwd(), "src/app/styles/theme/workspace-overview.css"), "utf8");

    expect(operations).toContain("grid-cols-1 gap-2 bg-transparent p-0 @min-workspace-section/instrument-desk:grid-cols-2");
    expect(theme).toContain("--container-workspace-section: 860px");
    expect(performance).toContain("@container/account-portfolio");
    expect(performance).toContain("grid-cols-4 gap-3 @max-workspace-portfolio/account-portfolio:grid-cols-2 @max-workspace-portfolio-narrow/account-portfolio:grid-cols-1");
    expect(theme).toContain("--container-workspace-portfolio: 900px");
    expect(theme).toContain("--container-workspace-portfolio-narrow: 520px");
  });
});
