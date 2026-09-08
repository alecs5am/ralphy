import { describe, expect, test } from "vitest";
import { previewWorkspaceOverview, type WorkspaceOverviewPresentation } from "@/pages/workspace";

describe("workspace analytics preview", () => {
  test("requires explicit selection in the testing workspace and preserves all real records", () => {
    const live = { header: { name: "Production" }, momentum: { totals: { views: null } } } as WorkspaceOverviewPresentation;
    expect(previewWorkspaceOverview(live, true)).toBe(live);
    const lab = { ...live, header: { ...live.header, name: "UX Testing Lab" } };
    expect(previewWorkspaceOverview(lab, false)).toBe(lab);
    const preview = previewWorkspaceOverview(lab, true);
    expect(preview.header).toBe(lab.header);
    expect(preview.momentum.periodLabel).toContain("Demo");
    expect(preview.momentum.trend.status).toBe("ready");
    expect(preview.momentum.totals.views).toBe(128400);
    expect(lab.momentum.totals.views).toBeNull();
  });
});
