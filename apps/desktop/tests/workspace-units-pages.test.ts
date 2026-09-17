import { describe, expect, test, vi } from "vitest";
import type { MediaWorkbenchBridge } from "../electron/media/types";
import { createWorkspaceReader } from "../electron/ralphy/workspace-reader";
import { loadWorkspaceUnits } from "../src/pages/workspace-units/api/load-workspace-units";

describe("workspace Unit pagination", () => {
  test("reads the full tree and follows Unit and publication cursors independently", async () => {
    const units = Array.from({ length: 105 }, (_, i) => ({ id: `u${i}`, projectId: i ? "p" : null, updatedAt: i }));
    const page = vi.fn()
      .mockResolvedValueOnce({ units: { items: units.slice(0, 50), nextCursor: "u50" }, publications: { items: [], nextCursor: "pub50" } })
      .mockResolvedValueOnce({ units: { items: units.slice(50), nextCursor: null }, publications: { items: [], nextCursor: "pub100" } })
      .mockResolvedValueOnce({ publications: { items: [{ id: "pub101", unitId: "u104", state: "published" }], nextCursor: null } });
    const result = await loadWorkspaceUnits("w", page as MediaWorkbenchBridge["loadWorkspaceUnitPage"]);
    expect(result.units).toHaveLength(105);
    expect(result.units[0].projectId).toBeNull();
    expect(result.publications[0].unitId).toBe("u104");
    expect(result.warning).toBeNull();
    expect(page.mock.calls.map((call) => call[1])).toEqual([
      { units: null, publications: null }, { units: "u50", publications: "pub50" }, { publications: "pub100" },
    ]);
    const request = vi.fn().mockResolvedValue({ units: { items: units, nextCursor: null } });
    await createWorkspaceReader({ request: request as never }).loadUnitPage("w", { units: "u50" });
    expect(request).toHaveBeenCalledWith("workspace.overview", {
      context: { workspaceId: "w" }, workspaceId: "w", include: "tree", sections: { units: { after: "u50", limit: 50 } },
    });
  });

  test("preserves partial results and exposes failures instead of claiming an empty library", async () => {
    const page = vi.fn()
      .mockResolvedValueOnce({ units: { items: [{ id: "u" }], nextCursor: "next" }, publications: { items: [], nextCursor: null } })
      .mockRejectedValueOnce(new Error("Library disconnected"));
    const result = await loadWorkspaceUnits("w", page);
    expect(result.units).toHaveLength(1);
    expect(result.warning).toContain("Library disconnected");
    const repeating = vi.fn().mockResolvedValue({ units: { items: [{ id: "u" }], nextCursor: "same" }, publications: { items: [], nextCursor: null } });
    const stopped = await loadWorkspaceUnits("w", repeating);
    expect(repeating).toHaveBeenCalledTimes(2);
    expect(stopped.units).toHaveLength(1);
    expect(stopped.warning).toContain("repeated");
  });
});
