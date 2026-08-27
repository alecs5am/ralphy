import { act, useSyncExternalStore } from "react";
import { describe, expect, test, vi } from "vitest";

import type { ActivityDto } from "../electron/ralphy/types";
import type { ProjectSummary } from "@/shared/api/ipc";
import * as screen from "@/pages/project/ui/ProjectScreen";
import { activitySearchText, activitySource, summarizeActivityRun } from "@/pages/project/lib/activity-presentation";
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

function keydown(node: HostNode, key: string): void {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "key", { value: key });
  node.dispatchEvent(event);
}

async function click(node: HostNode): Promise<void> {
  await act(async () => {
    node.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("activity timeline", () => {
  test("classifies ownership and derives searchable model and cost summaries from safe run details", () => {
    expect(activitySource(event(1))).toBe("generation");
    expect(activitySource({ ...event(2), entityType: "document", action: "document.revised" })).toBe("production");
    expect(activitySource({ ...event(3), entityType: "project", action: "project.archived" })).toBe("ralphy");
    expect(activitySource({ ...event(4), entityType: "unknown", action: "updated" })).toBe("ralphy");
    const detail = {
      run: { id: "run-1", workspaceId: "workspace-1", projectId: "project-1", agentSessionId: null, kind: "generation", label: "Hero", state: "succeeded", createdAt: 1, startedAt: 2, endedAt: 5 },
      attempts: [
        { id: "attempt-1", runId: "run-1", attemptNo: 1, provider: "openrouter", model: "openai/gpt-5", state: "succeeded", costUsd: 0.12, startedAt: 2, endedAt: 5 },
        { id: "attempt-2", runId: "run-1", attemptNo: 2, provider: "openrouter", model: "openai/gpt-5", state: "failed", costUsd: null, startedAt: 3, endedAt: 4 },
      ],
      nextCursor: null,
    } as const;
    expect(summarizeActivityRun(detail)).toEqual({ models: ["openai/gpt-5"], providers: ["openrouter"], costUsd: 0.12, durationMs: 3000 });
    expect(activitySearchText(event(1), detail)).toContain("openai/gpt-5 openrouter");
    expect(activitySearchText(event(1), detail)).not.toMatch(/prompt|providerRequest|credential/i);
  });

  test("keeps forward visible history separate from live catch-up and mounts one virtual scroll owner", async () => {
    const latest = deferred<{ items: ActivityDto[]; nextCursor: null }>();
    let initialCalls = 0;
    let cursor2Calls = 0;
    let cursor171Calls = 0;
    let cursor181Calls = 0;
    const loadProjectPage = vi.fn(async ({ tab, cursor }: { tab: string; cursor?: number }) => {
      if (tab === "units") return { items: [], nextCursor: null };
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
      loadProjectActivityRun: vi.fn(async (_project, runId: string) => ({
        run: { id: runId, workspaceId: "workspace-1", projectId: "project-1", agentSessionId: null, kind: "generation", label: "Hero generation", state: "succeeded", createdAt: 1, startedAt: 2, endedAt: 5 },
        attempts: [{ id: `attempt-${runId}`, runId, attemptNo: 1, provider: "openrouter", model: "openai/gpt-5", state: "succeeded", costUsd: 0.12, startedAt: 2, endedAt: 5 }],
        nextCursor: null,
      })),
    };
    const controller = screen.createProjectScreenController(api as any, project, 100);

    await controller.refresh(160);
    expect(loadProjectPage.mock.calls.filter(([request]) => request.tab === "activity").map(([request]) => request.cursor)).toEqual([100, 150]);
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
      expect(host.container.querySelectorAll(".activity-event").filter((node) => node.getAttribute("class")?.split(/\s+/).includes("is-milestone"))).toHaveLength(1);
      expect(host.container.querySelectorAll(".activity-icon").length).toBeGreaterThan(0);
      expect(host.container.querySelectorAll(".activity-event").filter((node) => node.getAttribute("data-tone") === "success" && node.querySelector(".activity-icon"))).toHaveLength(1);
      expect(host.container.querySelectorAll(".activity-marker")).toHaveLength(0);
      expect(host.container.querySelectorAll(".activity-toolbar")).toHaveLength(1);
      expect(host.container.querySelectorAll('[role="table"]')).toHaveLength(1);
      expect(host.container.textContent).toMatch(/Source.*Event.*Entity.*Model.*Cost/s);
      expect(host.container.querySelectorAll(".activity-event").every((node) => node.tagName === "BUTTON")).toBe(true);
      const firstRow = host.container.querySelector(".activity-event")!;
      await click(firstRow);
      await vi.waitFor(() => expect(host.container.querySelectorAll(".activity-inspector")).toHaveLength(1));
      expect(host.container.textContent).toContain("run-1");
      expect(host.container.textContent).toContain("openai/gpt-5");
      expect(host.container.textContent).toContain("$0.1200");
      const selectedRow = host.container.querySelectorAll(".activity-event").find((node) => node.getAttribute("aria-selected") === "true")!;
      await act(async () => { keydown(selectedRow, "ArrowDown"); await Promise.resolve(); });
      expect(host.container.querySelectorAll(".activity-event").filter((node) => node.getAttribute("aria-selected") === "true")).toHaveLength(1);
      const closeInspector = host.container.findAll((node) => node.tagName === "BUTTON" && node.getAttribute("aria-label") === "Close activity details")[0];
      await click(closeInspector);
      expect(host.container.querySelectorAll(".activity-inspector")).toHaveLength(0);

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
