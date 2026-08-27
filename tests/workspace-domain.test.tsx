import { describe, expect, test, vi } from "vitest";
import { act, StrictMode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaleMediaSessionError } from "../electron/media/session";
import {
  createRootGuardedWorkspaceRequest,
  createWorkspaceReader,
} from "../electron/ralphy/workspace-reader";
import type { RalphyBridgeClient } from "../electron/ralphy/client";
import type { WorkspaceOverviewDto } from "../electron/ralphy/types";
import { bridge } from "@/shared/api/ipc";
import {
  createWorkspaceScreenController,
} from "@/pages/workspace/model/screen-controller";
import {
  WorkspaceScreen,
  WorkspaceScreenView,
} from "@/pages/workspace/ui/WorkspaceScreen";
import { createReactHost, reactHostGlobalKeys } from "./react-host";

const overview: WorkspaceOverviewDto = {
  workspace: { id: "workspace-1", slug: "launch", name: "Launch", rowVersion: 1, createdAt: 1, updatedAt: 2 },
};

const populatedOverview: WorkspaceOverviewDto = {
  workspace: { id: "workspace-1", slug: "launch", name: "Launch Studio", rowVersion: 1, createdAt: 1, updatedAt: 2 },
  accounts: { items: [{ id: "account-1", workspaceId: "workspace-1", platform: "tiktok", externalId: "external-1", displayName: "Launch Account", username: "launch", credentialConfigured: true, credentialSource: "encrypted", relinkRequired: false, rowVersion: 1, createdAt: 1, updatedAt: 2 }], nextCursor: null },
  documents: { items: [
    { id: "document-1", workspaceId: "workspace-1", projectId: null, kind: "brief", slug: "brief", title: "Workspace brief", currentRevisionId: "revision-1", rowVersion: 1, createdAt: 1, updatedAt: 2 },
    { id: "document-2", workspaceId: "workspace-1", projectId: null, kind: "note", slug: "notes", title: "Workspace notes", currentRevisionId: "revision-2", rowVersion: 1, createdAt: 2, updatedAt: 3 },
    { id: "document-3", workspaceId: "workspace-1", projectId: null, kind: "research", slug: "research", title: "Workspace research", currentRevisionId: "revision-3", rowVersion: 1, createdAt: 3, updatedAt: 4 },
    { id: "document-4", workspaceId: "workspace-1", projectId: null, kind: "scenario", slug: "script", title: "Workspace script", currentRevisionId: "revision-4", rowVersion: 1, createdAt: 4, updatedAt: 5 },
    { id: "document-5", workspaceId: "workspace-1", projectId: null, kind: "production-plan", slug: "plan", title: "Workspace plan", currentRevisionId: "revision-5", rowVersion: 1, createdAt: 5, updatedAt: 6 },
  ], nextCursor: "document-next" },
  sharedMedia: { items: [{ ref: { type: "artifact", id: "artifact-1" }, workspaceId: "workspace-1", projectId: null, slug: "hero", kind: "image", selectedRevisionId: "revision-1", selectedState: "approved", mime: "image/png", bytes: 12, selectedAt: 2, revisionCount: 1, selectedObjectId: "object-1", storageClass: "bucket", usageRoles: ["reference", "cover"], target: { type: "object", id: "object-1" } }], nextCursor: null },
  projects: { items: [{ id: "project-1", workspaceId: "workspace-1", slug: "launch-video", name: "Core Project", state: "active", rowVersion: 1, createdAt: 1, updatedAt: 2 }], nextCursor: null },
  units: { items: [{ id: "unit-1", workspaceId: "workspace-1", projectId: null, slug: "launch-reel", format: "9:16", latestRevisionId: "unit-revision-2", selectedRevisionId: "unit-revision-1", createdAt: 1, updatedAt: 2 }], nextCursor: null },
  publications: { items: [{ id: "publication-1", unitId: "unit-1", presentationId: "presentation-1", platform: "tiktok", socialAccountId: "account-1", rail: "postiz", state: "published", url: "https://example.test/post/1", scheduledAt: null, submittedAt: 2, publishedAt: 3, createdAt: 1, updatedAt: 3 }], nextCursor: null },
  metrics: { publicationCount: 1, views: 100, likes: 10, comments: 2, shares: 1, watchTimeMs: 1000 },
  activity: { items: [{ sequence: 7, workspaceId: "workspace-1", projectId: null, entityType: "workspace", entityId: "workspace-1", action: "updated", createdAt: 2 }], nextCursor: null },
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((yes) => { resolve = yes; });
  return { promise, resolve };
}

describe("Workspace domain reader", () => {
  test("loads one exact bounded Core overview request", async () => {
    const request = vi.fn(async () => overview);
    const reader = createWorkspaceReader({ request: request as RalphyBridgeClient["request"] });

    await expect(reader.loadOverview("workspace-1")).resolves.toEqual(overview);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("workspace.overview", {
      context: { workspaceId: "workspace-1" },
      workspaceId: "workspace-1",
      /* The whole workspace, Projects included. Core's default scope is the narrower "rows the
         workspace itself owns", which answers nothing for a workspace whose work lives in
         Projects. */
      include: "tree",
      sections: {
        units: { limit: 20 },
        accounts: { limit: 20 },
        projects: { limit: 8 },
        activity: { afterSequence: 0, limit: 10 },
        publications: { limit: 30 },
        metrics: true,
      },
    });
  });

  test("filters only the exact legacy Project ghost from Workspace overview", async () => {
    const value: WorkspaceOverviewDto = {
      ...overview,
      projects: {
        items: [
          ["project-normal", "launch", "Launch"],
          ["project-ghost", ".DS_Store", ".DS Store"],
          ["project-same-slug", ".DS_Store", ".DS Store Archive"],
          ["project-same-name", ".DS_Store-copy", ".DS Store"],
          ["project-case", ".ds_store", ".DS Store"],
        ].map(([id, slug, name]) => ({
          id, workspaceId: "workspace-1", slug, name, state: "active",
          rowVersion: 1, createdAt: 1, updatedAt: 2,
        })),
        nextCursor: null,
      },
    };
    const request = vi.fn(async () => value);
    const reader = createWorkspaceReader({ request: request as RalphyBridgeClient["request"] });

    const result = await reader.loadOverview("workspace-1");

    expect(result.projects?.items.map(({ id }) => id)).toEqual([
      "project-normal", "project-same-slug", "project-same-name", "project-case",
    ]);
    expect(value.projects?.items).toHaveLength(5);
  });

  test("rejects a completion after the captured root becomes stale", async () => {
    const pending = deferred<WorkspaceOverviewDto>();
    let current = true;
    const request = createRootGuardedWorkspaceRequest(
      vi.fn(() => pending.promise) as RalphyBridgeClient["request"],
      () => { if (!current) throw new StaleMediaSessionError(); },
    );
    const reader = createWorkspaceReader({ request });

    const loading = reader.loadOverview("workspace-1");
    current = false;
    pending.resolve(overview);

    await expect(loading).rejects.toBeInstanceOf(StaleMediaSessionError);
  });
});

const workspaceViewProps = {
  workspaceDescription: "",
  onOpenPage: () => undefined,
  onOpenUnit: () => undefined,
  onOpenProject: () => undefined,
};

describe("Workspace screen", () => {
  test("renders loading, then a normal empty bounded overview", async () => {
    const pending = deferred<WorkspaceOverviewDto>();
    const controller = createWorkspaceScreenController({ loadWorkspaceOverview: () => pending.promise }, "workspace-1");
    const loading = controller.start();
    expect(renderToStaticMarkup(<WorkspaceScreenView controller={controller} snapshot={controller.getSnapshot()} catalogProjects={[]} {...workspaceViewProps} />)).toContain("Loading workspace overview");

    pending.resolve(overview);
    await loading;
    const markup = renderToStaticMarkup(<WorkspaceScreenView controller={controller} snapshot={controller.getSnapshot()} catalogProjects={[]} {...workspaceViewProps} />);
    expect(markup).toContain("Connected accounts were not returned by Core");
    expect(markup).not.toContain("Documents");
    expect(markup).not.toContain("Final renders");
    expect(markup).not.toContain("Indexed project spend");
  });

  test("keeps errors local and retries the same Workspace", async () => {
    const api = { loadWorkspaceOverview: vi.fn()
      .mockRejectedValueOnce(new Error("Core unavailable"))
      .mockResolvedValueOnce(overview) };
    const controller = createWorkspaceScreenController(api, "workspace-1");

    await controller.start();
    expect(renderToStaticMarkup(<WorkspaceScreenView controller={controller} snapshot={controller.getSnapshot()} catalogProjects={[]} {...workspaceViewProps} />)).toContain("Core unavailable");
    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", value: overview });
    expect(api.loadWorkspaceOverview).toHaveBeenNthCalledWith(1, "workspace-1");
    expect(api.loadWorkspaceOverview).toHaveBeenNthCalledWith(2, "workspace-1");
  });

  test("ignores a late completion after disposal", async () => {
    const pending = deferred<WorkspaceOverviewDto>();
    const controller = createWorkspaceScreenController({ loadWorkspaceOverview: () => pending.promise }, "workspace-1");
    const loading = controller.start();
    const loadingSnapshot = controller.getSnapshot();
    controller.dispose();
    pending.resolve(populatedOverview);
    await loading;

    expect(controller.getSnapshot()).toBe(loadingSnapshot);
  });

  test("does not call the API when retry is invoked after disposal", async () => {
    const loadWorkspaceOverview = vi.fn(async () => overview);
    const controller = createWorkspaceScreenController({ loadWorkspaceOverview }, "workspace-1");
    controller.dispose();

    await controller.retry();

    expect(loadWorkspaceOverview).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toEqual({ status: "idle", value: null, error: null, refreshing: false, lastSuccessfulRefreshAt: null });
  });

  test("keeps ready content visible during refresh", async () => {
    const next = deferred<WorkspaceOverviewDto>();
    const api = { loadWorkspaceOverview: vi.fn()
      .mockResolvedValueOnce(populatedOverview)
      .mockReturnValueOnce(next.promise) };
    const controller = createWorkspaceScreenController(api, "workspace-1", 1);
    await controller.start();

    const refreshing = controller.refresh(2);

    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      refreshing: true,
      value: populatedOverview,
    });
    next.resolve(populatedOverview);
    await refreshing;
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", refreshing: false });
  });

  test("timestamps only successful refreshes and retains freshness after a failed refresh", async () => {
    let now = 1_000;
    const api = { loadWorkspaceOverview: vi.fn()
      .mockResolvedValueOnce(populatedOverview)
      .mockRejectedValueOnce(new Error("Refresh unavailable"))
      .mockResolvedValueOnce(populatedOverview) };
    const controller = createWorkspaceScreenController(api, "workspace-1", 0, () => now);

    await controller.start();
    expect(controller.getSnapshot().lastSuccessfulRefreshAt).toBe(1_000);

    now = 2_000;
    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      error: "Refresh unavailable",
      lastSuccessfulRefreshAt: 1_000,
    });

    now = 3_000;
    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      error: null,
      lastSuccessfulRefreshAt: 3_000,
    });
  });

  test("keeps ready content and reports a refresh error locally", async () => {
    const api = { loadWorkspaceOverview: vi.fn()
      .mockResolvedValueOnce(populatedOverview)
      .mockRejectedValueOnce(new Error("Refresh unavailable")) };
    const controller = createWorkspaceScreenController(api, "workspace-1");
    await controller.start();

    await controller.retry();

    expect(controller.getSnapshot()).toEqual({
      status: "ready",
      value: populatedOverview,
      error: "Refresh unavailable",
      refreshing: false,
      lastSuccessfulRefreshAt: expect.any(Number),
    });
  });

  test("refreshes only newer activity and rejects an older same-root completion", async () => {
    const older = deferred<WorkspaceOverviewDto>();
    const newer = deferred<WorkspaceOverviewDto>();
    const oldOverview = { ...overview, workspace: { ...overview.workspace, name: "Old refresh" } };
    const newOverview = { ...overview, workspace: { ...overview.workspace, name: "New refresh" } };
    const api = { loadWorkspaceOverview: vi.fn()
      .mockResolvedValueOnce(overview)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise) };
    const controller = createWorkspaceScreenController(api, "workspace-1", 10) as ReturnType<typeof createWorkspaceScreenController> & {
      refresh(sequence: number): Promise<void>;
    };
    await controller.start();

    await controller.refresh(10);
    await controller.refresh(9);
    expect(api.loadWorkspaceOverview).toHaveBeenCalledOnce();
    const oldRefresh = controller.refresh(11);
    const newRefresh = controller.refresh(12);
    newer.resolve(newOverview);
    await newRefresh;
    older.resolve(oldOverview);
    await oldRefresh;

    expect(api.loadWorkspaceOverview).toHaveBeenCalledTimes(3);
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", value: newOverview });
  });

  test("Strict Mode mounts a fresh subscribed Workspace controller after effect replay", async () => {
    const first = deferred<WorkspaceOverviewDto>();
    const fresh = {
      workspace: {
        id: "workspace-1", slug: "fresh", name: "Fresh Workspace", rowVersion: 1,
        createdAt: 1, updatedAt: 2,
      },
    } satisfies WorkspaceOverviewDto;
    const stale = {
      workspace: {
        id: "workspace-1", slug: "stale", name: "Stale Workspace", rowVersion: 1,
        createdAt: 1, updatedAt: 2,
      },
    } satisfies WorkspaceOverviewDto;
    const load = vi.spyOn(bridge, "loadWorkspaceOverview")
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(fresh);
    const originalGlobals = new Map(
      reactHostGlobalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
    );
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => {
        root.render(<StrictMode><WorkspaceScreen
          workspaceId="workspace-1"
          rootEpoch={2}
          activitySequence={10}
          catalogProjects={[]}
          workspaceDescription=""
          onOpenPage={() => undefined}
          onOpenUnit={() => undefined}
          onOpenProject={() => undefined}
        /></StrictMode>);
        await Promise.resolve();
      });
      expect(load).toHaveBeenCalledTimes(2);
      expect(host.container.textContent).toContain("Fresh Workspace");

      await act(async () => {
        first.resolve(stale);
        await first.promise;
      });
      expect(host.container.textContent).toContain("Fresh Workspace");
      expect(host.container.textContent).not.toContain("Stale Workspace");
    } finally {
      await act(async () => root.unmount());
      load.mockRestore();
      host.restore();
      for (const key of reactHostGlobalKeys) {
        const original = originalGlobals.get(key);
        expect(Object.prototype.hasOwnProperty.call(globalThis, key)).toBe(original !== undefined);
        expect(Object.getOwnPropertyDescriptor(globalThis, key)).toEqual(original);
      }
    }
  });
});
