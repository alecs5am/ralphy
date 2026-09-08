import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { presentWorkspaceOverview, previewWorkspaceOverview, WorkspacePlanAndOutcomes } from "@/pages/workspace";
import { createReactHost } from "./react-host";
import type { PublishingEventPresentation } from "@/pages/workspace";

const live = presentWorkspaceOverview({
  overview: { workspace: { id: "lab", slug: "lab", name: "UX Testing Lab", rowVersion: 1, createdAt: 0, updatedAt: 0 } },
  catalogProjects: [], description: "Design review", now: 0,
});
const preview = previewWorkspaceOverview(live, true);

describe("workspace demo Unit comparisons", () => {
  test("keeps samples opt-in and computes distinct gains and losses from each channel's own baseline", () => {
    expect(previewWorkspaceOverview(live, false)).toBe(live);
    expect(live.outcomes.status).toBe("unavailable");
    expect(preview.plan).toBe(live.plan);
    expect(preview.accounts).toBe(live.accounts);
    expect(preview.projects).toBe(live.projects);
    const markup = renderToStaticMarkup(<WorkspacePlanAndOutcomes value={preview} onOpenPage={vi.fn()} onOpenUnit={vi.fn()} />);
    expect(markup).toContain("Demo · Sample analytics");
    expect(markup).toContain("Morning ritual");
    expect(markup).toContain("Closer look");
    expect(markup).toContain("73.2K");
    expect(markup).toContain("28.8K");
    for (const percent of ["+46%", "−23%", "+82%", "+42%", "−16%", "−46%", "−18%", "+12%"]) expect(markup).toContain(percent);
    for (const platform of ["Instagram", "TikTok", "YouTube"]) expect(markup).toContain(platform);
    expect(markup.match(/class="workspace-change-meter"/g)).toHaveLength(6);
    expect(markup).toContain("Last 7 days versus previous 7 days");
  });

  test("opens exact sample results without navigating to invented Unit records", async () => {
    const openUnit = vi.fn();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<WorkspacePlanAndOutcomes value={preview} onOpenPage={vi.fn()} onOpenUnit={openUnit} />));
      const review = host.container.querySelector("#workspace-outcome-demo-morning-ritual")!;
      await act(async () => review.dispatchEvent(new Event("click", { bubbles: true })));
      const dialog = document.body.querySelector("[role=dialog]");
      expect(dialog?.textContent).toContain("36,400");
      expect(dialog?.textContent).toContain("from 20,000");
      expect(dialog?.textContent).toContain("Sample analytics for UX Testing Lab");
      expect(dialog?.textContent).not.toContain("Open Unit");
      expect(dialog?.getAttribute("class")).toContain("h-fit w-workspace-outcome-detail");
      expect(dialog?.getAttribute("class")).not.toContain("h-workspace-detail-height");
      expect(openUnit).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); host.restore(); }
  });

  test("uses actual Unit and project identity when the preview can resolve an unambiguous Unit", async () => {
    const event: PublishingEventPresentation = {
      unitId: "existing-unit", scheduledAt: 1, publications: [], accounts: [],
      unit: { id: "existing-unit", workspaceId: "lab", projectId: "existing-project", slug: "morning-ritual", format: "video", compositionId: null, selectedRevisionId: null, latestRevisionId: null, createdAt: 0, updatedAt: 0 },
      project: { id: "existing-project", workspaceId: "lab", name: "Morning ritual campaign", slug: "actual-campaign", state: "active", rowVersion: 1, createdAt: 0, updatedAt: 0 },
    };
    const source = { ...live, plan: { ...live.plan, upcoming: { status: "ready" as const, value: [event, { ...event, scheduledAt: 2 }] } } };
    const resolved = previewWorkspaceOverview(source, true);
    expect(resolved.outcomes).toMatchObject({ value: { top: [{ unitId: "existing-unit", projectId: "existing-project", projectTitle: "Morning ritual campaign", revisionLabel: "No selected revision" }] } });
    const ambiguous = previewWorkspaceOverview({ ...source, plan: { ...source.plan, upcoming: { status: "ready", value: [event, { ...event, unitId: "different-unit", unit: { ...event.unit!, id: "different-unit" } }] } } }, true);
    expect(ambiguous.outcomes).toMatchObject({ value: { top: [{ unitId: "", projectId: "" }] } });
    const openUnit = vi.fn();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<WorkspacePlanAndOutcomes value={resolved} onOpenPage={vi.fn()} onOpenUnit={openUnit} />));
      const review = host.container.querySelector("#workspace-outcome-demo-morning-ritual")!;
      await act(async () => review.dispatchEvent(new Event("click", { bubbles: true })));
      const open = [...document.body.querySelector("[role=dialog]")!.querySelectorAll("button")].find((button) => button.textContent === "Open Unit")!;
      await act(async () => open.dispatchEvent(new Event("click", { bubbles: true })));
      expect(openUnit).toHaveBeenCalledWith("existing-project", "existing-unit", "morning-ritual", "workspace-outcome-demo-morning-ritual");
    } finally { await act(async () => root.unmount()); host.restore(); }
  });

  test("zero baselines never produce a fictitious percentage or an invalid meter", () => {
    if (preview.outcomes.status !== "ready") throw new Error("Missing demo outcomes");
    const original = preview.outcomes.value.top[0]!;
    const value = { ...preview, outcomes: { status: "ready" as const, value: { top: [{ ...original, performance: {
      ...original.performance!, channels: [
        { platform: "instagram", views: 20, previousViews: 0, engagementRate: 2, completionRate: 10 },
        { platform: "tiktok", views: 0, previousViews: 0, engagementRate: 0, completionRate: 0 },
      ],
    } }], emerging: [], learningOpportunities: [] } } };
    const markup = renderToStaticMarkup(<WorkspacePlanAndOutcomes value={value} onOpenPage={vi.fn()} onOpenUnit={vi.fn()} />);
    expect(markup).toContain(">New<");
    expect(markup).toContain(">0%<");
    expect(markup).not.toMatch(/NaN|Infinity/);
  });
});
