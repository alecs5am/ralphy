import { describe, expect, test, vi } from "vitest";

import { createWorkspaceReader, mergeMetricTotals } from "../electron/ralphy/workspace-reader";

const NOTHING = { publicationCount: 0, views: null, likes: null, comments: null, shares: null, watchTimeMs: null };

describe("the workspace overview", () => {
  test("adds totals without inventing a zero", () => {
    // Two nothings stay nothing; a number plus nothing is that number.
    expect(mergeMetricTotals([NOTHING, NOTHING])).toEqual(NOTHING);
    expect(mergeMetricTotals([
      NOTHING,
      { publicationCount: 1, views: 10, likes: null, comments: 2, shares: null, watchTimeMs: 500 },
      { publicationCount: 2, views: 5, likes: 3, comments: null, shares: null, watchTimeMs: null },
    ])).toEqual({
      publicationCount: 3,
      views: 15,
      likes: 3,
      comments: 2,
      shares: null,
      watchTimeMs: 500,
    });
  });

  test("reads the workspace's projects, because Core's workspace scope is workspace-*owned*", async () => {
    const request = vi.fn(async (method: string, params: { projectId?: string }) => {
      if (method === "workspace.overview") {
        return {
          workspace: { id: "w", slug: "w", name: "W", rowVersion: 1, createdAt: 0, updatedAt: 0 },
          units: { items: [], nextCursor: null },
          projects: { items: [{ id: "p1", slug: "one" }, { id: "p2", slug: "two" }], nextCursor: null },
          accounts: { items: [{ id: "a" }], nextCursor: null },
          publications: { items: [], nextCursor: null },
          metrics: NOTHING,
        };
      }
      if (params.projectId === "p2") throw new Error("Project unavailable");
      return {
        project: { id: "p1" },
        spendUsd: 0,
        units: { items: [{ id: "u1" }, { id: "u2" }], nextCursor: null },
        publications: { items: [{ id: "pub1" }], nextCursor: null },
        metrics: { publicationCount: 1, views: 42, likes: null, comments: null, shares: null, watchTimeMs: null },
      };
    });
    const reader = createWorkspaceReader({ request: request as never });
    const overview = await reader.loadOverview("w");

    expect(overview.units!.items.map((unit) => unit.id)).toEqual(["u1", "u2"]);
    expect(overview.publications!.items.map((row) => row.id)).toEqual(["pub1"]);
    expect(overview.metrics).toEqual({ publicationCount: 1, views: 42, likes: null, comments: null, shares: null, watchTimeMs: null });
    // A project that does not answer is skipped rather than failing the whole reading.
    expect(overview.projects!.items.map((project) => project.id)).toEqual(["p1", "p2"]);
    expect(request).toHaveBeenCalledTimes(3);
  });
});
