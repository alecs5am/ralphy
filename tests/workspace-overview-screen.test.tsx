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
});
