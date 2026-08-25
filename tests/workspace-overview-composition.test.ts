import { describe, expect, test, vi } from "vitest";

import { createWorkspaceReader } from "../electron/ralphy/workspace-reader";

const NOTHING = { publicationCount: 0, views: null, likes: null, comments: null, shares: null, watchTimeMs: null };

describe("the workspace overview", () => {
  test("asks Core for the whole workspace tree in one request", async () => {
    const request = vi.fn(async () => ({
      workspace: { id: "w", slug: "w", name: "W", rowVersion: 1, createdAt: 0, updatedAt: 0 },
      units: { items: [{ id: "u1" }, { id: "u2" }], nextCursor: null },
      projects: { items: [{ id: "p1", slug: "one" }, { id: "p2", slug: "two" }], nextCursor: null },
      accounts: { items: [{ id: "a" }], nextCursor: null },
      publications: { items: [{ id: "pub1" }], nextCursor: null },
      metrics: { publicationCount: 1, views: 42, likes: null, comments: null, shares: null, watchTimeMs: null },
    }));
    const reader = createWorkspaceReader({ request: request as never });
    const overview = await reader.loadOverview("w");

    // One query, not one per Project: the scope is the query's to widen, not this reader's.
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![1]).toMatchObject({ workspaceId: "w", include: "tree" });
    expect(overview.units!.items.map((unit) => unit.id)).toEqual(["u1", "u2"]);
    expect(overview.publications!.items.map((row) => row.id)).toEqual(["pub1"]);
    expect(overview.metrics).toEqual({ publicationCount: 1, views: 42, likes: null, comments: null, shares: null, watchTimeMs: null });
  });

  test("drops a legacy catalog ghost from the projects it shows", async () => {
    const request = vi.fn(async () => ({
      workspace: { id: "w", slug: "w", name: "W", rowVersion: 1, createdAt: 0, updatedAt: 0 },
      projects: {
        items: [{ id: "p1", slug: "one", name: "One" }, { id: "p2", slug: ".DS_Store", name: ".DS Store" }],
        nextCursor: null,
      },
      metrics: NOTHING,
    }));
    const reader = createWorkspaceReader({ request: request as never });
    const overview = await reader.loadOverview("w");

    expect(overview.projects!.items.map((project) => project.slug)).toEqual(["one"]);
  });
});
