import { describe, expect, test, vi } from "vitest";
import { parseProjectMediaQuery } from "../electron/media/project-query";
import { createProjectReader } from "../electron/ralphy/project-reader";
import { toIpcResult } from "../electron/ipc-security";
import type { RalphyBridgeClient } from "../electron/ralphy/client";

describe("project media IPC query", () => {
  test("accepts search and every supported sort before forwarding the request to the bridge", async () => {
    const request = vi.fn(async () => ({ items: [], nextCursor: null }));
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });
    const project = { workspaceId: "workspace-1", projectId: "project-1" };
    for (const sort of ["oldest", "newest", "name", "size", "selected"] as const) {
      const result = await toIpcResult(() => reader.loadPage({
        tab: "media", project,
        mediaQuery: parseProjectMediaQuery({ filter: "all", search: "source-", sort }),
      }));
      expect(result).toEqual({ ok: true, value: { items: [], nextCursor: null } });
      expect(request).toHaveBeenLastCalledWith("media.list", {
        context: project, types: ["artifact"], projectOnly: true, limit: 50, search: "source-", sort,
      });
    }
  });

  test("retains strict IPC validation for malformed or unknown fields", () => {
    for (const value of [
      null, [], undefined, { filter: "all", search: null }, { filter: "all", search: 42 },
      { filter: "all", search: "x".repeat(257) }, { filter: "all", sort: "random" },
      { filter: "all", extra: true }, { filter: "all", [Symbol("extra")]: true },
    ]) expect(() => parseProjectMediaQuery(value)).toThrow("Invalid Media query");
    expect(parseProjectMediaQuery({ filter: "all" })).toEqual({ filter: "all" });
  });
});
