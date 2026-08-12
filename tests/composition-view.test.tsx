import { act, useSyncExternalStore } from "react";
import { describe, expect, test, vi } from "vitest";

import type { ProjectSummary } from "../electron/media/types";
import type { BuildDto, CompositionDto, CompositionRevisionDto } from "../electron/ralphy/types";
import { ProjectScreenView } from "../src/screens/ProjectScreen";
import { createProjectScreenController, type ProjectScreenController } from "../src/state/project-screen-controller";
import { createReactHost } from "./react-host";

const project: ProjectSummary = {
  id: "project-1", workspaceId: "workspace-1", projectId: "project-1", name: "Launch", brief: "Brief",
  status: "active", phase: "production", finalState: "working", platform: null, aspectRatio: null,
  spendUsd: null, finalCount: 0, sharedCount: 0, unitCount: 0, recentActivity: "2026-08-02T00:00:00.000Z",
};
const composition: CompositionDto = {
  id: "composition-uuid", projectId: "project-1", slug: "hero-cut", kind: "video",
  selectedRevisionId: "revision-1-uuid", latestRevisionId: "revision-2-uuid", createdAt: 1, updatedAt: 2,
};
const revision = (id: string, revisionNo: number, state: "draft" | "sealed"): CompositionRevisionDto => ({
  id, compositionId: composition.id, revisionNo, parentRevisionId: revisionNo === 1 ? null : "revision-1-uuid",
  iterationId: "iteration-uuid", state, engine: "hyperframes", engineVersion: "1.0",
  authoredBySessionId: "session-uuid", createdAt: revisionNo, sealedAt: state === "sealed" ? revisionNo : null,
});
const revisions = [revision("revision-2-uuid", 2, "draft"), revision("revision-1-uuid", 1, "sealed")];
const oldRevision = revision("revision-old-uuid", 1, "sealed");
const build: BuildDto = { id: "build-uuid", compositionRevisionId: "revision-1-uuid", runId: "run-uuid", state: "succeeded", createdAt: 4, finishedAt: 5 };

function createApi() {
  let current = composition;
  return {
    loadProjectOverview: vi.fn(async () => ({ project: { id: "project-1", workspaceId: "workspace-1", slug: "launch", name: "Launch", state: "active", rowVersion: 1, createdAt: 1, updatedAt: 2 } })),
    loadProjectPage: vi.fn(async ({ tab, cursor }: { tab: string; cursor?: string }) => ({ items: tab === "compositions" && !cursor ? [current] : [], nextCursor: tab === "compositions" && !cursor ? "composition-next" : null })),
    loadProjectComposition: vi.fn(async () => current),
    loadProjectCompositionRevision: vi.fn(async (_project, id: string) => [...revisions, oldRevision].find((item) => item.id === id)!),
    loadProjectCompositionBuild: vi.fn(async () => build),
    loadProjectCompositionPage: vi.fn(async (_project, request: { kind: string; cursor?: string }) => {
      if (request.kind === "revisions") return { items: request.cursor ? [oldRevision] : revisions, nextCursor: request.cursor ? null : "revision-next" };
      if (request.kind === "sources") return { items: [{ id: "source-uuid", compositionRevisionId: "revision-1-uuid", objectId: "object-uuid", position: 0, createdAt: 1 }], nextCursor: null };
      if (request.kind === "inputs") return { items: [{ id: "input-uuid", compositionRevisionId: "revision-1-uuid", artifactRevisionId: "artifact-input-uuid", role: "voiceover", position: 0, createdAt: 1 }], nextCursor: null };
      if (request.kind === "revision-evaluations") return { items: [], nextCursor: null };
      if (request.kind === "builds") return { items: [build], nextCursor: null };
      if (request.kind === "build-outputs") return { items: [{ id: "output-uuid", buildId: build.id, artifactRevisionId: "artifact-output-uuid", role: "master", position: 0, createdAt: 5 }], nextCursor: null };
      return { items: [{ id: "evaluation-uuid", workspaceId: "workspace-1", projectId: "project-1", target: { type: "build", id: build.id }, kind: "quality", verdict: "pass", favorite: true, rating: 5, tags: [], note: "Ready", authoredBySessionId: "session-uuid", createdAt: 6 }], nextCursor: null };
    }),
    reviseProjectComposition: vi.fn(async () => revisions[0]!),
    selectProjectCompositionRevision: vi.fn(async (_project, input: { revisionId: string }) => (current = { ...current, selectedRevisionId: input.revisionId })),
    buildProjectComposition: vi.fn(async () => ({ ...build, runId: "run-uuid", state: "succeeded" as const, outputs: [] })),
    resolveCompositionOutputPreview: vi.fn(async () => ({ url: "ralphy-media://asset/output", sizeBytes: 12, mime: "video/mp4" })),
  };
}

function Mounted({ controller }: { controller: ProjectScreenController }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return <ProjectScreenView project={project} controller={controller} snapshot={snapshot} />;
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((yes) => { resolve = yes; });
  return { promise, resolve };
}

describe("Composition production inspector", () => {
  test("loads closed page-one families, mounts independent panes and keeps UUIDs out of the primary rail", async () => {
    const api = createApi();
    const controller = createProjectScreenController(api, project);
    await controller.selectTab("compositions");

    expect(api.loadProjectComposition).toHaveBeenCalledOnce();
    expect(api.loadProjectCompositionRevision).not.toHaveBeenCalled();
    expect(api.loadProjectCompositionBuild).not.toHaveBeenCalled();
    expect(api.loadProjectCompositionPage.mock.calls.map(([, request]) => request.kind)).toEqual([
      "revisions", "sources", "inputs", "revision-evaluations", "builds", "build-outputs", "build-evaluations",
    ]);

    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<Mounted controller={controller} />); await Promise.resolve(); });
      expect(host.container.querySelector(".composition-master")).not.toBeNull();
      expect(host.container.querySelector(".composition-detail")).not.toBeNull();
      const rail = host.container.querySelector(".composition-revision-rail")!;
      expect(rail.textContent).toContain("R2");
      expect(rail.textContent).not.toContain("revision-2-uuid");
      expect(host.container.querySelector(".composition-heading")?.textContent).toContain("New draft");
      expect(host.container.querySelector(".composition-primary")?.textContent).toContain("succeeded");
      await vi.waitFor(() => expect(host.container.querySelector(".composition-output-preview video")).not.toBeNull());
      expect(host.container.querySelector(".composition-technical")?.textContent).toContain("composition-uuid");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }

    await controller.loadMoreCompositionRevisions();
    expect(api.loadProjectCompositionPage).toHaveBeenLastCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, { kind: "revisions", compositionId: "composition-uuid", cursor: "revision-next" });
    await controller.previewCompositionOutput("artifact-output-uuid");
    expect(controller.getSnapshot().compositionPreview.value?.url).toContain("output");
  });

  test("keeps sealed selection and latest-draft build guards, with one authoritative conflict reload", async () => {
    const api = createApi();
    const controller = createProjectScreenController(api, project);
    await controller.selectTab("compositions");
    await controller.loadMoreCompositionRevisions();
    await controller.inspectCompositionRevision("revision-old-uuid");
    await controller.selectInspectedCompositionRevision();
    expect(api.selectProjectCompositionRevision).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, {
      compositionId: composition.id, revisionId: "revision-old-uuid", expectedSelectedRevisionId: "revision-1-uuid",
    });

    await controller.inspectCompositionRevision("revision-2-uuid");
    await controller.buildInspectedCompositionRevision();
    expect(api.buildProjectComposition).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, "revision-2-uuid");

    api.buildProjectComposition.mockRejectedValueOnce({ code: "E_CONFLICT", message: "stale" });
    await controller.buildInspectedCompositionRevision();
    expect(api.buildProjectComposition).toHaveBeenCalledTimes(2);
    expect(api.loadProjectComposition).toHaveBeenCalledTimes(4);
    expect(controller.getSnapshot().compositionConflict).toContain("changed elsewhere");
  });

  test("preserves an inspected revision from after the first page on conflict reload", async () => {
    const api = createApi();
    const firstPage = Array.from({ length: 50 }, (_, index) => (
      index === 49 ? revisions[1]! : revision(`revision-${52 - index}-uuid`, 52 - index, "sealed")
    ));
    api.loadProjectCompositionPage.mockImplementation(async (_project, request: { kind: string; cursor?: string }) => {
      if (request.kind === "revisions") return { items: request.cursor ? [oldRevision] : firstPage, nextCursor: request.cursor ? null : "revision-next" };
      return { items: [], nextCursor: null };
    });
    api.selectProjectCompositionRevision.mockRejectedValueOnce({ code: "E_CONFLICT", message: "stale" });
    const controller = createProjectScreenController(api, project);

    await controller.selectTab("compositions");
    await controller.loadMoreCompositionRevisions();
    await controller.inspectCompositionRevision(oldRevision.id);
    await controller.selectInspectedCompositionRevision();

    const snapshot = controller.getSnapshot();
    expect(api.selectProjectCompositionRevision).toHaveBeenCalledOnce();
    expect(snapshot.inspectedCompositionRevisionId).toBe(oldRevision.id);
    expect(snapshot.compositionRevisions.items.filter(({ id }) => id === oldRevision.id)).toHaveLength(1);
    expect(snapshot.compositionConflict).toContain("changed elsewhere");
  });

  test("drops an output preview after the inspected revision changes", async () => {
    const pending = deferred<{ url: string; sizeBytes: number; mime: string }>();
    const api = createApi();
    api.resolveCompositionOutputPreview.mockReturnValue(pending.promise);
    const controller = createProjectScreenController(api, project);
    await controller.selectTab("compositions");
    const preview = controller.previewCompositionOutput("artifact-output-uuid");
    await vi.waitFor(() => expect(api.resolveCompositionOutputPreview).toHaveBeenCalledOnce());
    await controller.inspectCompositionRevision("revision-2-uuid");
    pending.resolve({ url: "ralphy-media://asset/stale", sizeBytes: 1, mime: "video/mp4" });
    await preview;
    expect(controller.getSnapshot().compositionPreview.value).toBeNull();
  });
});
