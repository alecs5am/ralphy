import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type { CompositionAggregate } from "../electron/ralphy/project-reader";
import type { ProjectSummary } from "../electron/media/types";
import {
  buildLabel,
  sortBuilds,
  sortCompositionRevisions,
  sortEvaluations,
  sortPositioned,
} from "../src/lib/compositions";
import { ProjectScreenView } from "../src/screens/ProjectScreen";
import { createProjectScreenController } from "../src/state/project-screen-controller";

const project: ProjectSummary = {
  id: "project-1", workspaceId: "workspace-1", projectId: "project-1", name: "Launch", brief: "Brief",
  status: "active", phase: "production", finalState: "working", platform: null, aspectRatio: null,
  spendUsd: null, finalCount: 0, sharedCount: 0, unitCount: 0, recentActivity: "2026-08-02T00:00:00.000Z",
};

const aggregate: CompositionAggregate = {
  id: "composition-1", projectId: "project-1", slug: "hero-cut", kind: "video",
  selectedRevisionId: "revision-2", latestRevisionId: "revision-2", createdAt: 1, updatedAt: 2,
  revisions: [
    {
      id: "revision-1", compositionId: "composition-1", revisionNo: 1, parentRevisionId: null,
      iterationId: "iteration-1", state: "sealed", engine: "hyperframes", engineVersion: "1.0",
      authoredBySessionId: "session-1", createdAt: 1, sealedAt: 2,
      sources: [{ id: "source-1", compositionRevisionId: "revision-1", objectId: "object-source", position: 0, createdAt: 1 }],
      inputs: [{ id: "input-1", compositionRevisionId: "revision-1", artifactRevisionId: "artifact-input", role: "voiceover", position: 0, createdAt: 1 }],
      evaluations: [{ id: "evaluation-revision", workspaceId: "workspace-1", projectId: "project-1", target: { type: "composition_revision", id: "revision-1" }, kind: "review", verdict: null, favorite: false, rating: null, tags: ["hook"], note: null, authoredBySessionId: "session-1", createdAt: 3 }],
      builds: [{
        id: "build-1", compositionRevisionId: "revision-1", runId: "run-1", state: "succeeded", createdAt: 4, finishedAt: 5,
        outputs: [{ id: "output-1", buildId: "build-1", artifactRevisionId: "artifact-output", role: "master", position: 0, createdAt: 5 }],
        evaluations: [{ id: "evaluation-build", workspaceId: "workspace-1", projectId: "project-1", target: { type: "build", id: "build-1" }, kind: "quality", verdict: "pass", favorite: true, rating: 5, tags: [], note: "Ready", authoredBySessionId: "session-1", createdAt: 6 }],
      }],
    },
    {
      id: "revision-2", compositionId: "composition-1", revisionNo: 2, parentRevisionId: "revision-1",
      iterationId: "iteration-2", state: "draft", engine: "manual", engineVersion: null,
      authoredBySessionId: null, createdAt: 7, sealedAt: null, sources: [], inputs: [], evaluations: [], builds: [],
    },
  ],
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function createApi() {
  let current = aggregate;
  return {
    loadProjectOverview: vi.fn(async () => ({ project: { id: "project-1", workspaceId: "workspace-1", slug: "launch", name: "Launch", state: "active", rowVersion: 1, createdAt: 1, updatedAt: 2 } })),
    loadProjectPage: vi.fn(async ({ tab }: { tab: string }) => ({ items: tab === "compositions" ? [current] : [], nextCursor: null })),
    loadDocumentPreview: vi.fn(async () => ({ revisionId: "revision-1", format: "markdown", text: "", truncated: false })),
    searchProjectDocuments: vi.fn(async () => ({ items: [], nextCursor: null })),
    showProjectDocument: vi.fn(),
    reviseProjectDocument: vi.fn(),
    resolveProjectPreview: vi.fn(async () => null),
    loadProjectComposition: vi.fn(async () => current),
    reviseProjectComposition: vi.fn(async () => {
      current = { ...current, latestRevisionId: "revision-3", revisions: [...current.revisions, { ...current.revisions[1]!, id: "revision-3", revisionNo: 3, parentRevisionId: "revision-2" }] };
      return current.revisions[2]!;
    }),
    selectProjectCompositionRevision: vi.fn(async (_project, input: { revisionId: string }) => {
      current = { ...current, selectedRevisionId: input.revisionId };
      return current;
    }),
    buildProjectComposition: vi.fn(async () => ({ id: "build-2", compositionRevisionId: "revision-2", runId: "run-2", state: "succeeded" as const, createdAt: 8, finishedAt: 9, outputs: [] })),
    resolveCompositionOutputPreview: vi.fn(async () => ({ url: "ralphy-media://asset/output", sizeBytes: 12, mime: "video/mp4" })),
  };
}

function markup(controller: ReturnType<typeof createProjectScreenController>): string {
  return renderToStaticMarkup(<ProjectScreenView project={project} controller={controller} snapshot={controller.getSnapshot()} />);
}

describe("Composition view", () => {
  test("sorts copied Core records without mutating them and uses format labels", () => {
    const revisions = [aggregate.revisions[0]!, aggregate.revisions[1]!];
    const builds = [{ id: "b1", createdAt: 1 }, { id: "b2", createdAt: 2 }];
    const positioned = [{ id: "p2", position: 1 }, { id: "p1", position: 0 }];
    const evaluations = [{ id: "e1", createdAt: 1 }, { id: "e2", createdAt: 2 }];

    expect(sortCompositionRevisions(revisions).map(({ id }) => id)).toEqual(["revision-2", "revision-1"]);
    expect(sortBuilds(builds).map(({ id }) => id)).toEqual(["b2", "b1"]);
    expect(sortPositioned(positioned).map(({ id }) => id)).toEqual(["p1", "p2"]);
    expect(sortEvaluations(evaluations).map(({ id }) => id)).toEqual(["e2", "e1"]);
    expect(revisions.map(({ id }) => id)).toEqual(["revision-1", "revision-2"]);
    expect([buildLabel("video"), buildLabel("carousel"), buildLabel("sticker-pack"), buildLabel("audio")]).toEqual(["Render", "Export", "Pack build", "Build"]);
  });

  test("opens the first Composition, inspects immutable history, and previews the exact output", async () => {
    const api = createApi();
    const controller = createProjectScreenController(api, project);

    await controller.selectTab("compositions");
    controller.inspectCompositionRevision("revision-1");
    await controller.previewCompositionOutput("artifact-output");

    const output = markup(controller);
    expect(output).toContain("Selected revision-2");
    expect(output).toContain("Latest revision-2");
    expect(output).toContain("object-source");
    expect(output).toContain("artifact-input");
    expect(output).toContain("artifact-output");
    expect(output).toContain("ralphy-media://asset/output");
    expect(api.resolveCompositionOutputPreview).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, "artifact-output");
  });

  test("renders current Composition actions with established command controls", async () => {
    const controller = createProjectScreenController(createApi(), project);
    await controller.selectTab("compositions");
    controller.inspectCompositionRevision("revision-1");

    const output = markup(controller);
    for (const label of ["New draft", "Make selected", "Preview"]) {
      expect(output).toMatch(new RegExp(`<button[^>]*class="command-button"[^>]*>${label}</button>`));
    }
  });

  test("selects only a sealed inspected revision with the independent selected-pointer guard", async () => {
    const api = createApi();
    const controller = createProjectScreenController(api, project);
    await controller.selectTab("compositions");
    controller.inspectCompositionRevision("revision-1");

    await controller.selectInspectedCompositionRevision();

    expect(api.selectProjectCompositionRevision).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, {
      compositionId: "composition-1", revisionId: "revision-1", expectedSelectedRevisionId: "revision-2",
    });
    expect(controller.getSnapshot().composition.value?.selectedRevisionId).toBe("revision-1");
    expect(controller.getSnapshot().composition.value?.latestRevisionId).toBe("revision-2");
  });

  test("does not retry a conflicting selection and reloads while keeping inspected history", async () => {
    const api = createApi();
    api.selectProjectCompositionRevision.mockRejectedValue({ code: "E_CONFLICT", message: "stale" });
    const controller = createProjectScreenController(api, project);
    await controller.selectTab("compositions");
    controller.inspectCompositionRevision("revision-1");

    await controller.selectInspectedCompositionRevision();

    expect(api.selectProjectCompositionRevision).toHaveBeenCalledTimes(1);
    expect(api.loadProjectComposition).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().inspectedCompositionRevisionId).toBe("revision-1");
    expect(controller.getSnapshot().compositionConflict).toContain("changed elsewhere");
  });

  test("builds only the exact latest draft then reloads authoritative outputs", async () => {
    const api = createApi();
    const controller = createProjectScreenController(api, project);
    await controller.selectTab("compositions");

    await controller.buildInspectedCompositionRevision();

    expect(api.buildProjectComposition).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, "revision-2");
    expect(api.loadProjectComposition).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().compositionMutation).toBe("idle");
  });

  test("reloads authoritative state after a terminal build fails without retrying", async () => {
    const failedAggregate: CompositionAggregate = {
      ...aggregate,
      revisions: aggregate.revisions.map((revision) => revision.id === "revision-2" ? {
        ...revision,
        state: "sealed",
        sealedAt: 10,
        builds: [{
          id: "build-2", compositionRevisionId: "revision-2", runId: "run-2", state: "failed",
          createdAt: 8, finishedAt: 10, outputs: [], evaluations: [],
        }],
      } : revision),
    };
    const api = createApi();
    api.loadProjectComposition
      .mockResolvedValueOnce(aggregate)
      .mockResolvedValueOnce(failedAggregate);
    api.buildProjectComposition.mockRejectedValue(Object.assign(new Error("Build failed"), { code: "E_BUILD_FAILED" }));
    const controller = createProjectScreenController(api, project);
    await controller.selectTab("compositions");

    await controller.buildInspectedCompositionRevision();

    expect(api.buildProjectComposition).toHaveBeenCalledTimes(1);
    expect(api.loadProjectComposition).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().composition.value?.revisions.find(({ id }) => id === "revision-2")?.state).toBe("sealed");
    expect(controller.getSnapshot().compositionMutationError).toBe("Build failed");
  });

  test("revises from the loaded latest pointer and does not substitute the selected pointer", async () => {
    const api = createApi();
    const controller = createProjectScreenController(api, project);
    await controller.selectTab("compositions");
    controller.inspectCompositionRevision("revision-1");

    await controller.reviseSelectedComposition();

    expect(api.reviseProjectComposition).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, {
      compositionId: "composition-1", expectedLatestRevisionId: "revision-2", parentRevisionId: "revision-2", iterationId: "iteration-2", engine: "manual", engineVersion: null,
    });
  });

  test("keeps Composition B when the aggregate for A completes last", async () => {
    const lateA = deferred<CompositionAggregate>();
    const compositionB = { ...aggregate, id: "composition-2", slug: "second-cut", revisions: aggregate.revisions.map((revision) => ({ ...revision, compositionId: "composition-2" })) };
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [aggregate, compositionB], nextCursor: null });
    api.loadProjectComposition.mockImplementation(async (_project, id) => id === "composition-1" ? lateA.promise : compositionB);
    const controller = createProjectScreenController(api, project);

    const openingA = controller.selectTab("compositions");
    await vi.waitFor(() => expect(api.loadProjectComposition).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, "composition-1"));
    await controller.openComposition("composition-2");
    lateA.resolve(aggregate);
    await openingA;

    expect(controller.getSnapshot().compositionId).toBe("composition-2");
    expect(controller.getSnapshot().composition.value?.slug).toBe("second-cut");
  });

  test("keeps output preview B when preview A completes last", async () => {
    const lateA = deferred<{ url: string; sizeBytes: number; mime: string }>();
    const withOutputs: CompositionAggregate = {
      ...aggregate,
      revisions: aggregate.revisions.map((revision) => revision.id === "revision-1" ? {
        ...revision,
        builds: revision.builds.map((build) => ({ ...build, outputs: [...build.outputs, { ...build.outputs[0]!, id: "output-2", artifactRevisionId: "artifact-output-2", position: 1 }] })),
      } : revision),
    };
    const api = createApi();
    api.loadProjectComposition.mockResolvedValue(withOutputs);
    api.resolveCompositionOutputPreview
      .mockReturnValueOnce(lateA.promise)
      .mockResolvedValueOnce({ url: "ralphy-media://asset/output-2", sizeBytes: 13, mime: "video/mp4" });
    const controller = createProjectScreenController(api, project);
    await controller.selectTab("compositions");
    controller.inspectCompositionRevision("revision-1");

    const openingA = controller.previewCompositionOutput("artifact-output");
    await controller.previewCompositionOutput("artifact-output-2");
    lateA.resolve({ url: "ralphy-media://asset/output-1", sizeBytes: 12, mime: "video/mp4" });
    await openingA;

    expect(controller.getSnapshot().compositionPreview.value?.url).toBe("ralphy-media://asset/output-2");
  });

  test("abandons a pending Composition aggregate after controller disposal", async () => {
    const pending = deferred<CompositionAggregate>();
    const api = createApi();
    api.loadProjectComposition.mockReturnValue(pending.promise);
    const controller = createProjectScreenController(api, project);
    const opening = controller.selectTab("compositions");
    await vi.waitFor(() => expect(api.loadProjectComposition).toHaveBeenCalledOnce());

    controller.dispose();
    pending.resolve(aggregate);
    await opening;

    expect(controller.getSnapshot().composition.status).toBe("loading");
    expect(controller.getSnapshot().composition.value).toBeNull();
  });

  test("does not start a Composition aggregate when its root page resolves after disposal", async () => {
    const pending = deferred<{ items: CompositionAggregate[]; nextCursor: null }>();
    const api = createApi();
    api.loadProjectPage.mockReturnValue(pending.promise);
    const controller = createProjectScreenController(api, project);
    const opening = controller.selectTab("compositions");
    await vi.waitFor(() => expect(api.loadProjectPage).toHaveBeenCalledOnce());

    controller.dispose();
    pending.resolve({ items: [aggregate], nextCursor: null });
    await opening;

    expect(api.loadProjectComposition).not.toHaveBeenCalled();
  });
});
