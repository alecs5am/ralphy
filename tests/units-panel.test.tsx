import { act, useSyncExternalStore } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

import type { UnitDto, UnitRevisionDto } from "../electron/ralphy/types";
import type { ProjectSummary } from "../src/lib/ipc";
import * as screen from "../src/screens/ProjectScreen";
import { createReactHost, type HostNode } from "./react-host";

const project: ProjectSummary = {
  id: "project-1", workspaceId: "workspace-1", projectId: "project-1", name: "Launch", brief: "Brief",
  status: "active", phase: "production", finalState: "working", platform: null, aspectRatio: null,
  spendUsd: null, finalCount: 0, sharedCount: 0, unitCount: 60, recentActivity: "2026-08-11T00:00:00.000Z",
};

const unit = (index: number): UnitDto => ({
  id: `unit-${index}`, workspaceId: "workspace-1", projectId: "project-1", slug: `Unit ${index}`,
  format: "9:16", selectedRevisionId: `revision-${index}-2`, latestRevisionId: `revision-${index}-3`,
  createdAt: 1, updatedAt: 2,
});
const revision = (id: string, revisionNo: number, sealedAt: number | null = 2): UnitRevisionDto => ({
  id, unitId: "unit-1", revisionNo, parentRevisionId: revisionNo > 1 ? `revision-1-${revisionNo - 1}` : null,
  iterationId: "iteration-1", note: null, authoredBySessionId: "session-1", createdAt: revisionNo, sealedAt,
});

function createApi() {
  const units = Array.from({ length: 60 }, (_, index) => unit(index));
  return {
    loadProjectPage: vi.fn(async ({ cursor }: { cursor?: string }) => cursor
      ? { items: [unit(60)], nextCursor: null }
      : { items: units, nextCursor: "units-next" }),
    loadProjectUnit: vi.fn(async (_project: unknown, unitId: string) => units.find(({ id }) => id === unitId)!),
    loadProjectUnitRevision: vi.fn(async (_project: unknown, _unitId: string, revisionId: string) => {
      const no = Number(revisionId.at(-1));
      return revision(revisionId, no, no === 4 ? null : no);
    }),
    loadProjectUnitPage: vi.fn(async (_project: unknown, request: { kind: string; cursor?: string }) => {
      if (request.kind === "revisions") return request.cursor
        ? { items: [revision("revision-1-1", 1)], nextCursor: null }
        : { items: [revision("revision-1-4", 4, null), revision("revision-1-3", 3)], nextCursor: "revisions-next" };
      if (request.kind === "items") return request.cursor
        ? { items: [{ id: "item-2", unitRevisionId: "revision-1-2", artifactRevisionId: null, documentRevisionId: "document-revision-2", role: "caption", position: 2, config: { trim: true }, createdAt: 2 }], nextCursor: null }
        : { items: [{ id: "item-1", unitRevisionId: "revision-1-2", artifactRevisionId: "artifact-revision-1", documentRevisionId: null, role: "visual", position: 1, config: null, createdAt: 1 }], nextCursor: "items-next" };
      return request.cursor
        ? { items: [{ id: "presentation-2", unitRevisionId: "revision-1-2", platform: "youtube", position: 2, effectiveCaptionRevisionId: null, coverArtifactRevisionId: null, crop: null, safeArea: null, options: {}, createdAt: 2 }], nextCursor: null }
        : { items: [{ id: "presentation-1", unitRevisionId: "revision-1-2", platform: "tiktok", position: 1, effectiveCaptionRevisionId: "caption-1", coverArtifactRevisionId: "cover-1", crop: { x: 0 }, safeArea: { top: 10 }, options: { loop: false }, createdAt: 1 }], nextCursor: "presentations-next" };
    }),
    selectProjectUnitRevision: vi.fn(async (_project: unknown, _unitId: string, revisionId: string) => ({ ...unit(1), selectedRevisionId: revisionId })),
    loadProjectUnitPreview: vi.fn(),
    reviseProjectUnit: vi.fn(),
  };
}

function MountedProject({ controller, memory }: { controller: any; memory: Map<string, number> }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const View = screen.ProjectScreenView as React.ComponentType<any>;
  return <View project={project} rootEpoch={1} controller={controller} snapshot={snapshot} unitsScrollMemory={memory} />;
}

function button(root: HostNode, text: string): HostNode {
  const found = root.findAll((node) => node.tagName === "BUTTON" && node.textContent.includes(text))[0];
  if (!found) throw new Error(`Missing ${text} button`);
  return found;
}

async function click(node: HostNode): Promise<void> {
  await act(async () => {
    node.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("units workbench", () => {
  test("mounts the bounded master/detail workbench and pages each visible tail", async () => {
    const api = createApi();
    const controller = screen.createProjectScreenController(api as any, project);
    await controller.selectTab("units");
    const memory = new Map<string, number>();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => { root.render(<MountedProject controller={controller} memory={memory} />); await Promise.resolve(); });
      const master = host.container.querySelector(".units-master")!;
      const detail = host.container.querySelector(".units-detail")!;
      expect(master.getAttribute("role")).toBe("region");
      expect(detail.getAttribute("aria-label")).toBe("Unit detail");
      expect(master.querySelectorAll(".unit-row").length).toBeLessThan(60);

      master.scrollTop = 280;
      detail.scrollTop = 75;
      await act(async () => { master.dispatchEvent(new Event("scroll")); detail.dispatchEvent(new Event("scroll")); });
      await click(button(master, "Unit 1"));
      expect(master.scrollTop).toBe(280);
      expect(detail.scrollTop).toBe(75);
      expect(globalThis.document.activeElement).toBe(host.container.querySelector(".unit-detail-heading"));
      expect(memory).toEqual(new Map([["units-master", 280], ["units-detail", 75]]));

      expect(host.container.textContent).toContain("R4Draft");
      expect(host.container.textContent).toContain("R3SealedLatest");
      expect(host.container.textContent).toContain("R2SealedSelected");
      expect(host.container.querySelectorAll(".unit-item button")).toHaveLength(0);
      expect(host.container.querySelectorAll(".unit-presentation button")).toHaveLength(0);
      expect(host.container.querySelector(".unit-technical")?.textContent).toContain("artifact-revision-1");
      expect(host.container.querySelector(".unit-technical")?.textContent).toContain('"top": 10');
      expect(host.container.querySelector('[data-platform="tiktok"]')).not.toBeNull();

      await click(button(host.container, "R3"));
      await click(button(host.container, "Make selected"));
      expect(api.selectProjectUnitRevision).toHaveBeenCalledWith(
        { workspaceId: "workspace-1", projectId: "project-1" }, "unit-1", "revision-1-3", "revision-1-2",
      );
      await click(button(host.container, "R4"));
      expect(button(host.container, "Make selected").disabled).toBe(true);

      for (const selector of [".units-master", ".unit-revision-rail", ".unit-items", ".unit-presentations"] as const) {
        const section = host.container.querySelector(selector)!;
        const sentinel = section.querySelector(".auto-cursor-tail")!;
        const observer = host.intersectionObservers.find(({ targets }) => targets.has(sentinel as unknown as Element))!;
        act(() => observer.deliver(sentinel as unknown as Element, true));
      }
      await vi.waitFor(() => {
        expect(api.loadProjectPage).toHaveBeenLastCalledWith(expect.objectContaining({ tab: "units", cursor: "units-next" }));
        expect(api.loadProjectUnitPage.mock.calls.some(([, request]) => request.kind === "revisions" && request.cursor === "revisions-next")).toBe(true);
        expect(api.loadProjectUnitPage.mock.calls.some(([, request]) => request.kind === "items" && request.cursor === "items-next")).toBe(true);
        expect(api.loadProjectUnitPage.mock.calls.some(([, request]) => request.kind === "presentations" && request.cursor === "presentations-next")).toBe(true);
      });
      expect(api.loadProjectUnitPreview).not.toHaveBeenCalled();
      expect(api.reviseProjectUnit).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("locks the outer body and stacks only below the approved container breakpoint", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/workbench.css"), "utf8");
    expect(css).toMatch(/\.project-domain-body\.is-units\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.units-workbench\s*\{[^}]*grid-template-columns:\s*minmax\(280px,\s*340px\)\s+minmax\(0,\s*1fr\)/s);
    expect(css).toMatch(/\.units-master,[\s\S]*\.units-detail\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
  });
});
