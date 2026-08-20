import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { WorkspaceOverviewDto } from "../electron/ralphy/types";
import {
  WorkspaceScreenView,
  createWorkspaceScreenController,
} from "../src/screens/WorkspaceScreen";

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
});
