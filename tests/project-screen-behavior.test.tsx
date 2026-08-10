import { renderToStaticMarkup } from "react-dom/server";
import { act, StrictMode } from "react";
import { describe, expect, test, vi } from "vitest";
import type { MediaCardDto, ProjectOverviewDto } from "../electron/ralphy/types";
import type { ProjectSummary } from "../src/lib/ipc";
import * as screen from "../src/screens/ProjectScreen";
import { bridge } from "../src/lib/ipc";
import { createReactHost, reactHostGlobalKeys } from "./react-host";

const project: ProjectSummary = {
  id: "project-1",
  workspaceId: "workspace-1",
  projectId: "project-1",
  name: "Launch",
  brief: "A bounded domain project",
  status: "active",
  phase: "production",
  finalState: "working",
  platform: null,
  aspectRatio: null,
  spendUsd: null,
  finalCount: 0,
  sharedCount: 0,
  unitCount: 0,
  recentActivity: "2026-08-02T00:00:00.000Z",
};

const overview: ProjectOverviewDto = {
  project: {
    id: "project-1", workspaceId: "workspace-1", slug: "launch", name: "Launch",
    purpose: null, state: "active", rowVersion: 1, createdAt: 1, updatedAt: 2,
  },
  mediaCounts: { artifacts: 2, objects: 1, runObjects: 0 },
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function createApi() {
  return {
    loadProjectOverview: vi.fn(async () => overview),
    loadProjectPage: vi.fn(async () => ({ items: [], nextCursor: null })),
    loadDocumentPreview: vi.fn(async () => ({ revisionId: "revision-1", format: "markdown", text: "# Bounded brief", truncated: false })),
    searchProjectDocuments: vi.fn(async () => ({ items: [], nextCursor: null })),
    showProjectDocument: vi.fn(async (project: unknown, documentId: string) => ({ id: documentId, workspaceId: "workspace-1", projectId: "project-1", kind: "brief", slug: "brief", title: "Brief", currentRevisionId: "revision-1", rowVersion: 1, createdAt: 1, updatedAt: 1, currentRevision: { id: "revision-1", documentId, revisionNo: 1, parentRevisionId: null, iterationId: null, format: "markdown", title: null, authoredBySessionId: null, createdAt: 1 } })),
    reviseProjectDocument: vi.fn(async () => ({ id: "revision-2", documentId: "document-1", revisionNo: 2, parentRevisionId: "revision-1", iterationId: null, format: "markdown", title: null, authoredBySessionId: null, createdAt: 2 })),
    resolveProjectPreview: vi.fn(async () => null as { url: string; sizeBytes: number } | null),
  };
}

function createController(api: ReturnType<typeof createApi>, activitySequence = 0) {
  const factory = (screen as typeof screen & {
    createProjectScreenController(api: ReturnType<typeof createApi>, project: ProjectSummary, activitySequence: number): {
      start(): Promise<void>;
      refresh(sequence: number): Promise<void>;
      selectTab(tab: string): Promise<void>;
      loadMore(): Promise<void>;
      retry(): Promise<void>;
      openDocument(document: unknown): Promise<void>;
      setDocumentDraft(body: string): void;
      openMedia(card: MediaCardDto): Promise<void>;
      setMediaFilter(filter: string): Promise<void>;
      getSnapshot(): any;
    };
  }).createProjectScreenController;
  return factory(api, project, activitySequence);
}

function renderController(controller: ReturnType<typeof createController>) {
  const View = (screen as typeof screen & { ProjectScreenView: React.ComponentType<any> }).ProjectScreenView;
  return renderToStaticMarkup(
    <View project={project} controller={controller} snapshot={controller.getSnapshot()} />,
  );
}

describe("ProjectScreen behavior", () => {
  test("renders returned Overview records as clearly bounded recent data", async () => {
    const api = createApi();
    api.loadProjectOverview.mockResolvedValue({
      ...overview,
      project: { ...overview.project, purpose: "Give reviewers one trusted campaign workbench." },
      iterations: { items: [{ id: "iteration-1", projectId: "project-1", number: 3, title: "Launch polish", state: "active", priorIterationChanges: "Shortened the cold open and replaced the end card.", createdAt: 1, closedAt: null }], nextCursor: "more" },
      feedback: { items: [{ id: "feedback-1", projectId: "project-1", iterationId: "iteration-1", status: "open", targetType: "artifact_revision", targetId: "revision-1", createdAt: 2, resolvedAt: null }], nextCursor: null },
      stages: { items: [{ id: "stage-1", projectId: "project-1", stage: "edit", state: "working", entityType: "composition", entityId: "composition-1", rowVersion: 1, updatedAt: 3 }], nextCursor: null },
      documents: { items: [{ id: "document-1", workspaceId: "workspace-1", projectId: "project-1", kind: "brief", slug: "brief", title: "Creative brief", currentRevisionId: "revision-2", rowVersion: 1, createdAt: 1, updatedAt: 3, binding: { ownerType: "project", ownerId: "project-1", role: "brief", documentId: "document-1", boundRevisionId: "revision-1", currentHeadRevisionId: "revision-2", hasNewerHead: true } }], nextCursor: null },
      compositions: { items: [{ id: "composition-1", projectId: "project-1", slug: "hero-cut", kind: "video", latestRevisionId: "composition-revision-2", selectedRevisionId: "composition-revision-1", createdAt: 1, updatedAt: 2 }], nextCursor: null },
      units: { items: [{ id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", slug: "reel", format: "9:16", latestRevisionId: "unit-revision-2", selectedRevisionId: "unit-revision-1", createdAt: 1, updatedAt: 2 }], nextCursor: null },
      runs: { items: [{ id: "run-1", workspaceId: "workspace-1", projectId: "project-1", kind: "render", label: "Final render", state: "running", createdAt: 1, startedAt: 2, endedAt: null }], nextCursor: null },
      activity: { items: [{ sequence: 9, workspaceId: "workspace-1", projectId: "project-1", entityType: "run", entityId: "run-1", action: "started", createdAt: 3 }], nextCursor: 9 },
      publications: { items: [{ id: "publication-1", unitId: "unit-1", presentationId: "presentation-1", platform: "tiktok", socialAccountId: "account-1", rail: "postiz", state: "published", url: "https://example.test/post/1", scheduledAt: 2, submittedAt: 3, publishedAt: 4, createdAt: 1, updatedAt: 4 }], nextCursor: "more-publications" },
      metrics: { publicationCount: 4, views: 1200, likes: 80, comments: 12, shares: 7, watchTimeMs: 345_000 },
    });
    const controller = createController(api);

    await controller.start();
    const markup = renderController(controller);
    expect(markup).toContain("Recent records (bounded)");
    expect(markup).toContain("Give reviewers one trusted campaign workbench.");
    expect(markup).toContain("Launch polish");
    expect(markup).toContain("Shortened the cold open and replaced the end card.");
    expect(markup).toContain("artifact_revision · revision-1");
    expect(markup).toContain("edit · working");
    expect(markup).toContain("Creative brief");
    expect(markup).toContain("Bound revision-1 · Current revision-2 · Newer head available");
    expect(markup).toContain("hero-cut");
    expect(markup).toContain("Selected composition-revision-1 · Latest composition-revision-2");
    expect(markup).toContain("reel");
    expect(markup).toContain("Final render · render · running");
    expect(markup).toContain("#9 · started");
    expect(markup).toContain("Recent publications (bounded)");
    expect(markup).toContain("tiktok · published");
    expect(markup).toContain("postiz");
    expect(markup).toContain("Scheduled");
    expect(markup).toContain("Submitted");
    expect(markup).toContain("Published");
    expect(markup).toContain("https://example.test/post/1");
    expect(markup).not.toContain('href="https://example.test/post/1"');
    for (const [value, label] of [["4", "Publications"], ["1200", "Views"], ["80", "Likes"], ["12", "Comments"], ["7", "Shares"], ["345000", "Watch time (ms)"]]) {
      expect(markup).toContain(`>${value}</span><span class="metric-label">${label}`);
    }
    expect(markup).not.toContain(">1</strong><span>Documents");
  });

  test("renders explicit null and empty Overview summaries without inventing totals", async () => {
    const api = createApi();
    api.loadProjectOverview.mockResolvedValue({
      ...overview,
      project: { ...overview.project, purpose: null },
      iterations: { items: [{ id: "iteration-1", projectId: "project-1", number: 1, title: "Initial", state: "closed", priorIterationChanges: null, createdAt: 1, closedAt: 2 }], nextCursor: null },
      publications: { items: [], nextCursor: null },
      metrics: { publicationCount: 0, views: null, likes: null, comments: null, shares: null, watchTimeMs: null },
    });
    const controller = createController(api);

    await controller.start();
    const markup = renderController(controller);
    expect(markup).toContain("Purpose not provided");
    expect(markup).toContain("No prior iteration changes");
    expect(markup).toContain("No publications returned.");
    expect(markup).toContain('>0</span><span class="metric-label">Publications');
    expect(markup.match(/>—<\/span>/g)).toHaveLength(5);
  });

  test("loads Overview immediately and each other tab only on first selection", async () => {
    const api = createApi();
    const controller = createController(api);

    await controller.start();
    expect(api.loadProjectOverview).toHaveBeenCalledOnce();
    expect(api.loadProjectPage).not.toHaveBeenCalled();

    await controller.selectTab("documents");
    await controller.selectTab("overview");
    await controller.selectTab("documents");
    expect(api.loadProjectPage).toHaveBeenCalledOnce();
    expect(api.loadProjectPage).toHaveBeenCalledWith(expect.objectContaining({ tab: "documents" }));
  });

  test("refreshes only newer activity and rejects an older Overview completion", async () => {
    const older = deferred<ProjectOverviewDto>();
    const newer = deferred<ProjectOverviewDto>();
    const oldOverview = { ...overview, project: { ...overview.project, name: "Old refresh" } };
    const newOverview = { ...overview, project: { ...overview.project, name: "New refresh" } };
    const api = createApi();
    api.loadProjectOverview
      .mockResolvedValueOnce(overview)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const controller = createController(api, 10);
    await controller.start();

    await controller.refresh(10);
    await controller.refresh(9);
    expect(api.loadProjectOverview).toHaveBeenCalledOnce();
    const oldRefresh = controller.refresh(11);
    const newRefresh = controller.refresh(12);
    newer.resolve(newOverview);
    await newRefresh;
    older.resolve(oldOverview);
    await oldRefresh;

    expect(api.loadProjectOverview).toHaveBeenCalledTimes(3);
    expect(controller.getSnapshot().domain.overview).toMatchObject({ status: "ready", value: newOverview });
  });

  test("refreshes Overview and the active tab from page one while preserving the Document draft", async () => {
    const document = { id: "document-1", title: "Brief", kind: "brief", currentRevisionId: "revision-1" };
    const api = createApi();
    api.loadProjectPage
      .mockResolvedValueOnce({ items: [document], nextCursor: "next-page" })
      .mockResolvedValueOnce({ items: [document], nextCursor: null });
    const controller = createController(api, 20);
    await controller.start();
    await controller.selectTab("documents");
    await controller.openDocument(document as never);
    controller.setDocumentDraft("line one\nline two\n");
    const before = controller.getSnapshot().documentDraft;

    await controller.refresh(21);

    expect(api.loadProjectOverview).toHaveBeenCalledTimes(2);
    expect(api.loadProjectPage).toHaveBeenNthCalledWith(2, {
      tab: "documents",
      project: { workspaceId: "workspace-1", projectId: "project-1" },
    });
    expect(controller.getSnapshot().documentDraft).toBe(before);
    expect(controller.getSnapshot().documentDraft?.body).toBe("line one\nline two\n");
    expect(controller.getSnapshot().selectedDocument?.id).toBe("document-1");
  });

  test("keeps loaded rows through Load more failure, retry, and dedupe", async () => {
    const api = createApi();
    api.loadProjectPage
      .mockResolvedValueOnce({ items: [{ id: "document-1", title: "One" }], nextCursor: "next" })
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ items: [{ id: "document-1", title: "One" }, { id: "document-2", title: "Two" }], nextCursor: null });
    const controller = createController(api);

    await controller.selectTab("documents");
    await controller.loadMore();
    expect(controller.getSnapshot().domain.pages.documents).toMatchObject({ status: "error", items: [{ id: "document-1", title: "One" }] });
    expect(renderController(controller)).toContain("Offline");

    await controller.retry();
    expect(controller.getSnapshot().domain.pages.documents.items.map((item: { id: string }) => item.id)).toEqual(["document-1", "document-2"]);
  });

  test("renders a normal empty Composition page and bounded Document content", async () => {
    const api = createApi();
    api.loadProjectPage.mockImplementation(async ({ tab }: { tab: string }) => tab === "documents"
      ? { items: [{ id: "document-1", title: "Brief", kind: "brief", currentRevisionId: "revision-1" }], nextCursor: null }
      : { items: [], nextCursor: null });
    const controller = createController(api);

    await controller.selectTab("compositions");
    expect(renderController(controller)).toContain("No compositions yet.");
    await controller.selectTab("documents");
    await controller.openDocument(controller.getSnapshot().domain.pages.documents.items[0]);
    const markup = renderController(controller);
    expect(api.loadDocumentPreview).toHaveBeenCalledWith(expect.anything(), "revision-1");
    expect(markup).toContain("Bounded brief");
  });

  test("renders selected and unselected media through the trusted preview viewer", async () => {
    const unselected = {
      ref: { type: "artifact" as const, id: "artifact-unselected" }, workspaceId: "workspace-1", projectId: "project-1",
      slug: "unselected", kind: "image", selectedRevisionId: null, selectedState: null, mime: null, bytes: null,
      selectedAt: null, revisionCount: 0, selectedObjectId: null, storageClass: null, usageRoles: [], target: null,
    };
    const selected: MediaCardDto = {
      ...unselected,
      ref: { type: "artifact", id: "artifact-selected" }, slug: "Hero", mime: "image/png", bytes: 12,
      selectedRevisionId: "revision-1", selectedState: "approved", selectedObjectId: "object-1",
      target: { type: "object", id: "object-1" },
    };
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [unselected, selected], nextCursor: null });
    api.resolveProjectPreview
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ url: "ralphy-media://asset/token", sizeBytes: 12 });
    const controller = createController(api);

    await controller.selectTab("media");
    await controller.openMedia(unselected);
    expect(renderController(controller)).toContain("Preview needs review");
    await controller.openMedia(selected);
    const markup = renderController(controller);
    expect(markup).toContain("ralphy-media://asset/token");
    expect(markup).toContain('alt="Hero"');
  });

  test("shows literal unlinked RunObject evidence without another domain request", async () => {
    const runObject: MediaCardDto = {
      ref: { type: "run-object", id: "run-object-1" }, workspaceId: "workspace-1", projectId: "project-1",
      runId: "run-1", purpose: "temporary-frame", state: "ready", retention: "temp", mime: "image/png", bytes: 12,
      createdAt: 1, objectId: "object-1", logicalPath: "runs/run-1/frame.png", locationClass: "temp",
      attemptId: null, attemptNo: null, target: { type: "object", id: "object-1" },
    };
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [runObject], nextCursor: null });
    api.resolveProjectPreview.mockResolvedValue(null);
    const controller = createController(api);

    await controller.selectTab("media");
    await controller.openMedia(runObject);
    const markup = renderController(controller);
    expect(markup).toContain("Attempt</dt><dd>Unlinked");
    expect(markup).toContain("object-1");
    expect(api.resolveProjectPreview).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, { type: "run-object", id: "run-object-1" });
  });

  test("keeps Candidate when a same-generation previous-filter request completes last", async () => {
    const all = deferred<{ items: MediaCardDto[]; nextCursor: null }>();
    const candidate = deferred<{ items: MediaCardDto[]; nextCursor: null }>();
    const api = createApi();
    api.loadProjectPage.mockImplementation(({ mediaFilter }: { mediaFilter?: string }) => (
      mediaFilter === "candidate" ? candidate.promise : all.promise
    ));
    const controller = createController(api);

    const selecting = controller.selectTab("media");
    const switching = controller.setMediaFilter("candidate");
    candidate.resolve({ items: [{ ref: { type: "artifact", id: "candidate-1" } } as MediaCardDto], nextCursor: null });
    await switching;
    all.resolve({ items: [{ ref: { type: "artifact", id: "stale-1" } } as MediaCardDto], nextCursor: null });
    await selecting;

    expect(controller.getSnapshot().domain.pages.media.items).toEqual([{ ref: { type: "artifact", id: "candidate-1" } }]);
  });

  test("clears selected Media and its preview before loading a new filter", async () => {
    const selected: MediaCardDto = {
      ref: { type: "artifact", id: "artifact-1" }, workspaceId: "workspace-1", projectId: "project-1",
      slug: "Hero", kind: "image", selectedRevisionId: "revision-1", selectedState: "approved", mime: "image/png", bytes: 12,
      selectedAt: 1, revisionCount: 1, selectedObjectId: "object-1", storageClass: "final", usageRoles: [],
      target: { type: "object", id: "object-1" },
    };
    const candidate = deferred<{ items: MediaCardDto[]; nextCursor: null }>();
    const api = createApi();
    api.loadProjectPage.mockResolvedValueOnce({ items: [selected], nextCursor: null }).mockReturnValueOnce(candidate.promise);
    api.resolveProjectPreview.mockResolvedValue({ url: "ralphy-media://asset/one", sizeBytes: 12 });
    const controller = createController(api);
    await controller.selectTab("media");
    await controller.openMedia(selected);
    expect(controller.getSnapshot()).toMatchObject({ selectedMedia: selected, domain: { preview: { status: "ready" } } });

    const switching = controller.setMediaFilter("candidate");
    expect(controller.getSnapshot()).toMatchObject({ selectedMedia: null, domain: { preview: { status: "idle", value: null } } });
    candidate.resolve({ items: [], nextCursor: null });
    await switching;
  });

  test("keeps Candidate loading when the previous filter fails late", async () => {
    const all = deferred<{ items: MediaCardDto[]; nextCursor: null }>();
    const candidate = deferred<{ items: MediaCardDto[]; nextCursor: null }>();
    const api = createApi();
    api.loadProjectPage.mockImplementation(({ mediaFilter }: { mediaFilter?: string }) => (
      mediaFilter === "candidate" ? candidate.promise : all.promise
    ));
    const controller = createController(api);

    const selecting = controller.selectTab("media");
    const switching = controller.setMediaFilter("candidate");
    all.reject(new Error("stale"));
    await selecting;
    expect(controller.getSnapshot().domain.pages.media).toMatchObject({ status: "loading", error: null, mediaFilter: "candidate" });
    candidate.resolve({ items: [], nextCursor: null });
    await switching;
  });

  test("uses the same Candidate predicate for pagination, retry, and deduplicated append", async () => {
    const api = createApi();
    api.loadProjectPage
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [{ ref: { type: "artifact", id: "one" } }], nextCursor: "candidate-next" })
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ items: [{ ref: { type: "artifact", id: "one" } }, { ref: { type: "artifact", id: "two" } }], nextCursor: null });
    const controller = createController(api);

    await controller.selectTab("media");
    await controller.setMediaFilter("candidate");
    await controller.loadMore();
    expect(api.loadProjectPage).toHaveBeenNthCalledWith(3, { tab: "media", project: { workspaceId: "workspace-1", projectId: "project-1" }, cursor: "candidate-next", mediaFilter: "candidate" });
    expect(controller.getSnapshot().domain.pages.media).toMatchObject({ status: "error", items: [{ ref: { type: "artifact", id: "one" } }], nextCursor: "candidate-next", mediaFilter: "candidate" });
    await controller.retry();
    expect(api.loadProjectPage).toHaveBeenNthCalledWith(4, { tab: "media", project: { workspaceId: "workspace-1", projectId: "project-1" }, cursor: "candidate-next", mediaFilter: "candidate" });
    expect(controller.getSnapshot().domain.pages.media.items).toEqual([{ ref: { type: "artifact", id: "one" } }, { ref: { type: "artifact", id: "two" } }]);
  });

  test("renders the exact Core-backed Media filter toolbar", async () => {
    const api = createApi();
    const controller = createController(api);
    await controller.selectTab("media");

    const labels = [...renderController(controller).matchAll(/aria-pressed="(?:true|false)"[^>]*>([^<]+)<\/button>/g)].map((match) => match[1]);
    expect(labels).toEqual(["All", "References", "Working", "Candidate", "Approved", "Rejected", "Superseded", "Run diagnostics", "Cache/temp RunObjects", "Advanced Objects"]);
  });

  test("mounted Strict Mode replaces same-ID Project ownership across root epochs", async () => {
    const firstReplay = deferred<ProjectOverviewDto>();
    const oldRoot = deferred<ProjectOverviewDto>();
    const stale = { ...overview, project: { ...overview.project, purpose: "OLD ROOT CONTENT" } };
    const fresh = { ...overview, project: { ...overview.project, purpose: "NEW ROOT CONTENT" } };
    const load = vi.spyOn(bridge, "loadProjectOverview")
      .mockReturnValueOnce(firstReplay.promise)
      .mockReturnValueOnce(oldRoot.promise)
      .mockResolvedValueOnce(fresh);
    const originalGlobals = new Map(
      reactHostGlobalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
    );
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    const ProjectScreen = screen.ProjectScreen;

    try {
      await act(async () => {
        root.render(<StrictMode><ProjectScreen
          project={project}
          rootEpoch={1}
          activitySequence={10}
        /></StrictMode>);
        await Promise.resolve();
      });
      expect(load).toHaveBeenCalledTimes(2);

      await act(async () => {
        root.render(<StrictMode><ProjectScreen
          project={project}
          rootEpoch={2}
          activitySequence={10}
        /></StrictMode>);
        await Promise.resolve();
      });
      expect(load).toHaveBeenCalledTimes(3);
      expect(host.container.textContent).toContain("NEW ROOT CONTENT");

      await act(async () => {
        firstReplay.resolve(stale);
        oldRoot.resolve(stale);
        await Promise.all([firstReplay.promise, oldRoot.promise]);
      });
      expect(host.container.textContent).toContain("NEW ROOT CONTENT");
      expect(host.container.textContent).not.toContain("OLD ROOT CONTENT");
      expect(load).toHaveBeenCalledTimes(3);
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
