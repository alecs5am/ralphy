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
    expect(value.attention).toMatchObject({ status: "ready" });
    if (value.attention.status === "ready") {
      expect(value.attention.value.items.map((item) => item.kind)).toContain("account-relink");
    }
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
    expect(value.attention).toMatchObject({ status: "ready" });
    if (value.attention.status === "ready") {
      expect(value.attention.value.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "publication-failure", affectedCount: { status: "ready", value: 2 } }),
      ]));
    }
  });

  test("does not infer cadence gaps or top performers from bounded totals", () => {
    const value = presentWorkspaceOverview({ overview: populatedOverview, catalogProjects: [], description: "", now: 1 });
    expect(value.plan.coverage).toMatchObject({ status: "unavailable", reason: expect.stringContaining("cadence") });
    expect(value.outcomes).toMatchObject({ status: "unavailable", reason: expect.stringContaining("benchmark") });
  });

  test("marks truncated account, project, and publication pages as partial", () => {
    const now = Date.UTC(2026, 7, 20);
    const value = presentWorkspaceOverview({
      overview: {
        ...populatedOverview,
        accounts: { ...populatedOverview.accounts!, nextCursor: "account-more" },
        projects: { items: [], nextCursor: "project-more" },
        publications: {
          items: [{
            ...populatedOverview.publications!.items[0]!,
            scheduledAt: now + 60 * 60 * 1000,
          }],
          nextCursor: "publication-more",
        },
      },
      catalogProjects: [], description: "", now,
    });

    expect(value.header.accountCount).toMatchObject({ status: "partial", value: 1 });
    expect(value.accounts).toMatchObject({ status: "partial" });
    expect(value.projects).toMatchObject({ status: "partial", value: [] });
    expect(value.plan.upcoming).toMatchObject({ status: "partial" });
    expect(value.attention).toMatchObject({ status: "partial" });
    expect(value.onboarding).toEqual({ status: "ready", value: false });
    if (value.accounts.status === "partial") {
      expect(value.accounts.value[0]!.publicationCount).toMatchObject({ status: "partial", value: 1 });
    }
    if (value.attention.status === "partial") {
      expect(value.attention.value.items[0]!.affectedCount).toMatchObject({ status: "partial", value: 1 });
    }
  });

  test("marks omitted account, project, and publication pages as unavailable", () => {
    const value = presentWorkspaceOverview({
      overview: { workspace: populatedOverview.workspace, metrics: populatedOverview.metrics },
      catalogProjects: [], description: "", now: 1,
    });

    expect(value.header.accountCount).toMatchObject({ status: "unavailable" });
    expect(value.accounts).toMatchObject({ status: "unavailable" });
    expect(value.projects).toMatchObject({ status: "unavailable" });
    expect(value.plan.upcoming).toMatchObject({ status: "unavailable" });
    expect(value.attention).toMatchObject({ status: "unavailable" });
    expect(value.onboarding).toMatchObject({ status: "unavailable" });
  });
});
