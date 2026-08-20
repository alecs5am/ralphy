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

  test("labels grouped publication failures with distinct bounded account names", () => {
    const account = populatedOverview.accounts!.items[0]!;
    const publication = populatedOverview.publications!.items[0]!;
    const value = presentWorkspaceOverview({
      overview: {
        ...populatedOverview,
        accounts: { items: [
          account,
          { ...account, id: "account-2", externalId: "external-2", username: "studio", displayName: "Studio" },
        ], nextCursor: null },
        publications: { items: [
          { ...publication, id: "p1", socialAccountId: account.id },
          { ...publication, id: "p2", socialAccountId: "account-2" },
        ], nextCursor: null },
      },
      catalogProjects: [], description: "", now: 1,
    });

    expect(value.attention).toMatchObject({ status: "ready" });
    if (value.attention.status === "ready") {
      expect(value.attention.value.items.filter((item) => item.kind === "publication-failure").map((item) => item.title))
        .toEqual(["Publication failed · Launch", "Publication failed · Studio"]);
    }

    const partial = presentWorkspaceOverview({
      overview: {
        ...populatedOverview,
        accounts: { items: [account], nextCursor: "more-accounts" },
        publications: { items: [{ ...publication, socialAccountId: "account-2" }], nextCursor: null },
      },
      catalogProjects: [], description: "", now: 1,
    });
    expect(partial.attention).toMatchObject({ status: "partial" });
    if (partial.attention.status === "partial") {
      expect(partial.attention.value.items[0]!.title).toBe("Publication failed · Publishing account unavailable");
      expect(partial.attention.value.items[0]!.title).not.toContain("account-2");
    }
  });

  test("does not infer cadence gaps or top performers from bounded totals", () => {
    const value = presentWorkspaceOverview({ overview: populatedOverview, catalogProjects: [], description: "", now: 1 });
    expect(value.plan.coverage).toMatchObject({ status: "unavailable", reason: expect.stringContaining("cadence") });
    expect(value.outcomes).toMatchObject({ status: "unavailable", reason: expect.stringContaining("benchmark") });
  });

  test("marks truncated account, project, and publication pages as partial", () => {
    const now = new Date(2026, 7, 20, 12).getTime();
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
    expect(value.plan.days[0]).toBe(new Date(2026, 7, 20).getTime());
    expect(value.plan.days).toHaveLength(14);

    const finalBoundary = new Date(2026, 8, 3).getTime();
    const publication = populatedOverview.publications!.items[0]!;
    const bounded = presentWorkspaceOverview({
      overview: {
        ...populatedOverview,
        publications: { items: [
          { ...publication, id: "earlier-today", scheduledAt: new Date(2026, 7, 20, 8).getTime() },
          { ...publication, id: "inside", scheduledAt: finalBoundary - 1 },
          { ...publication, id: "outside", scheduledAt: finalBoundary },
        ], nextCursor: null },
      },
      catalogProjects: [], description: "", now,
    });
    expect(bounded.plan.upcoming).toMatchObject({ status: "ready" });
    if (bounded.plan.upcoming.status === "ready") {
      expect(bounded.plan.upcoming.value.flatMap((event) => event.publications.map((item) => item.id))).toEqual(["earlier-today", "inside"]);
    }

    const incompleteLookups = presentWorkspaceOverview({
      overview: {
        ...populatedOverview,
        accounts: undefined,
        units: { items: [], nextCursor: "more-units" },
        projects: undefined,
        publications: { items: [{ ...publication, state: "scheduled", scheduledAt: now }], nextCursor: null },
      },
      catalogProjects: [], description: "", now,
    });
    expect(incompleteLookups.plan.upcoming).toMatchObject({ status: "partial", value: [expect.objectContaining({ unit: null, project: null, accounts: [] })] });
    if (incompleteLookups.plan.upcoming.status === "partial") {
      expect(incompleteLookups.plan.upcoming.reason).toContain("connected accounts were not returned by Core");
      expect(incompleteLookups.plan.upcoming.reason).toContain("returned Core Unit page");
      expect(incompleteLookups.plan.upcoming.reason).toContain("projects were not returned by Core");
    }
    const scheduledOverview = {
      ...populatedOverview,
      publications: { items: [{ ...publication, state: "scheduled" as const, scheduledAt: now }], nextCursor: null },
    };
    const complementaryLookupLimits = [
      [presentWorkspaceOverview({ overview: { ...scheduledOverview, accounts: { ...populatedOverview.accounts!, nextCursor: "more-accounts" } }, catalogProjects: [], description: "", now }).plan.upcoming, "returned Core account page"],
      [presentWorkspaceOverview({ overview: { ...scheduledOverview, units: undefined }, catalogProjects: [], description: "", now }).plan.upcoming, "Units were not returned by Core"],
      [presentWorkspaceOverview({ overview: { ...scheduledOverview, projects: { items: [], nextCursor: "more-projects" } }, catalogProjects: [], description: "", now }).plan.upcoming, "returned Core project page"],
    ] as const;
    for (const [upcoming, reason] of complementaryLookupLimits) {
      expect(upcoming).toMatchObject({ status: "partial" });
      if (upcoming.status === "partial") expect(upcoming.reason).toContain(reason);
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
