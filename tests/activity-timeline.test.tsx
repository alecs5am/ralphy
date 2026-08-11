import { act, useSyncExternalStore } from "react";
import { describe, expect, test, vi } from "vitest";

import type { ActivityDto } from "../electron/ralphy/types";
import type { ProjectSummary } from "../src/lib/ipc";
import * as screen from "../src/screens/ProjectScreen";
import { createReactHost, type HostNode } from "./react-host";

const project: ProjectSummary = {
  id: "project-1", workspaceId: "workspace-1", projectId: "project-1", name: "Launch", brief: "Brief",
  status: "active", phase: "production", finalState: "working", platform: null, aspectRatio: null,
  spendUsd: null, finalCount: 0, sharedCount: 0, unitCount: 0, recentActivity: "2026-08-11T00:00:00.000Z",
};
const event = (sequence: number, createdAt = 1_767_225_600 + sequence): ActivityDto => ({
  sequence, workspaceId: "workspace-1", projectId: "project-1", entityType: "run",
  entityId: `run-${sequence}`, action: sequence === 1 ? "generation.completed" : "updated", createdAt,
});

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function MountedProject({ controller, memory }: { controller: any; memory: Map<string, number> }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const View = screen.ProjectScreenView as React.ComponentType<any>;
  return <View project={project} rootEpoch={1} controller={controller} snapshot={snapshot} activityScrollMemory={memory} />;
}

async function click(node: HostNode): Promise<void> {
  await act(async () => {
    node.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("activity timeline", () => {
  test("keeps forward visible history separate from live catch-up and mounts one virtual scroll owner", async () => {
    const latest = deferred<{ items: ActivityDto[]; nextCursor: null }>();
    let initialCalls = 0;
    let cursor2Calls = 0;
    let cursor171Calls = 0;
    let cursor181Calls = 0;
    const loadProjectPage = vi.fn(async ({ cursor }: { cursor?: number }) => {
      if (cursor === undefined) {
        initialCalls += 1;
        if (initialCalls === 1) throw new Error("Initial activity unavailable");
        return { items: [event(1), event(2, 1_767_312_000)], nextCursor: 2 };
      }
      if (cursor === 2) {
        cursor2Calls += 1;
        return cursor2Calls === 1
          ? { items: [event(2), event(3)], nextCursor: 2 }
          : { items: [event(2), event(3)], nextCursor: null };
      }
      if (cursor === 100) return { items: Array.from({ length: 50 }, (_, index) => event(101 + index)), nextCursor: 150 };
      if (cursor === 150) return { items: Array.from({ length: 10 }, (_, index) => event(151 + index)), nextCursor: null };
      if (cursor === 160) return { items: [], nextCursor: null };
      if (cursor === 170) return { items: [event(171)], nextCursor: null };
      if (cursor === 171) {
        cursor171Calls += 1;
        if (cursor171Calls === 1) throw new Error("Catch-up unavailable");
        return { items: [event(181)], nextCursor: null };
      }
      if (cursor === 181) {
        cursor181Calls += 1;
        return cursor181Calls === 1
          ? { items: [], nextCursor: 181 }
          : { items: [event(191)], nextCursor: null };
      }
      if (cursor === 191) return latest.promise;
      throw new Error(`Unexpected activity cursor ${cursor}`);
    });
    const api = {
      loadProjectOverview: vi.fn(async () => ({ project: { id: "project-1", workspaceId: "workspace-1", slug: "launch", name: "Launch", state: "active", rowVersion: 1, createdAt: 1, updatedAt: 2 } })),
      loadProjectPage,
    };
    const controller = screen.createProjectScreenController(api as any, project, 100);

    await controller.refresh(160);
    expect(loadProjectPage.mock.calls.map(([request]) => request.cursor)).toEqual([100, 150]);
    await controller.selectTab("activity");
    expect(controller.getSnapshot().domain.pages.activity).toMatchObject({ status: "error", items: [], nextCursor: null });
    await controller.retry();
    expect(controller.getSnapshot().domain.pages.activity).toMatchObject({ status: "ready", nextCursor: 2 });
    expect((controller.getSnapshot().domain.pages.activity.items as ActivityDto[]).map(({ sequence }) => sequence))
      .toEqual([1, 2, ...Array.from({ length: 60 }, (_, index) => 101 + index)]);

    const memory = new Map<string, number>();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} memory={memory} />); await Promise.resolve(); });
      const owner = host.container.querySelector(".activity-scroll")!;
      const outer = host.container.querySelector(".project-domain-body")!;
      expect(owner.getAttribute("role")).toBe("region");
      expect(outer.getAttribute("class")).toContain("is-activity");
      expect(host.container.querySelectorAll(".activity-event").length).toBeLessThan(62);
      expect(host.container.querySelectorAll(".activity-day").length).toBeGreaterThanOrEqual(2);
      expect(host.container.textContent).toContain("Generation completed");
      expect(host.container.textContent).not.toMatch(/\b(?:cost|state)\b/i);
      expect(host.container.querySelectorAll(".activity-event button")).toHaveLength(0);
      expect(host.container.querySelectorAll(".activity-filter, .load-more")).toHaveLength(0);

      owner.scrollTop = 420;
      await act(async () => owner.dispatchEvent(new Event("scroll")));
      const visibleCursor = controller.getSnapshot().domain.pages.activity.nextCursor;
      await act(async () => { await controller.refresh(170); });
      expect(loadProjectPage).toHaveBeenLastCalledWith(expect.objectContaining({ tab: "activity", cursor: 160 }));
      expect(controller.getSnapshot().domain.pages.activity).toMatchObject({ status: "ready", nextCursor: visibleCursor });
      expect(owner.scrollTop).toBe(420);

      await act(async () => { await controller.refresh(171); });
      await act(async () => { await controller.refresh(180); });
      await act(async () => { await controller.refresh(181); });
      expect(loadProjectPage.mock.calls.filter(([request]) => request.cursor === 171)).toHaveLength(2);
      await act(async () => { await controller.refresh(190); });
      await act(async () => { await controller.refresh(191); });
      expect(loadProjectPage.mock.calls.filter(([request]) => request.cursor === 181)).toHaveLength(2);

      let newer!: Promise<void>;
      await act(async () => { newer = controller.refresh(200); await Promise.resolve(); });
      const callsBeforeStale = loadProjectPage.mock.calls.length;
      await act(async () => { await controller.refresh(199); });
      expect(loadProjectPage).toHaveBeenCalledTimes(callsBeforeStale);
      await act(async () => { latest.resolve({ items: [event(191), event(200)], nextCursor: null }); await newer; });
      const sequences = (controller.getSnapshot().domain.pages.activity.items as ActivityDto[]).map(({ sequence }) => sequence);
      expect(sequences.filter((sequence) => sequence === 191)).toHaveLength(1);
      expect(sequences.at(-1)).toBe(200);
      expect(controller.getSnapshot().domain.pages.activity.nextCursor).toBe(2);
      expect(owner.scrollTop).toBe(420);

      const sentinel = owner.querySelector(".auto-cursor-tail")!;
      const observer = host.intersectionObservers.find(({ targets }) => targets.has(sentinel as unknown as Element))!;
      await act(async () => {
        observer.deliver(sentinel as unknown as Element, true);
        await vi.waitFor(() => expect(controller.getSnapshot().domain.pages.activity.status).toBe("error"));
      });
      expect(controller.getSnapshot().domain.pages.activity).toMatchObject({ nextCursor: 2 });
      const retry = owner.findAll((node) => node.tagName === "BUTTON" && node.textContent === "Retry")[0];
      await click(retry);
      expect(controller.getSnapshot().domain.pages.activity).toMatchObject({ status: "ready", nextCursor: null });
      expect((controller.getSnapshot().domain.pages.activity.items as ActivityDto[]).filter(({ sequence }) => sequence === 2)).toHaveLength(1);
      expect((controller.getSnapshot().domain.pages.activity.items as ActivityDto[]).some(({ sequence }) => sequence === 3)).toBe(true);
      expect(memory.get("activity")).toBe(420);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
