import { renderToStaticMarkup } from "react-dom/server";
import { act, StrictMode } from "react";
import { describe, expect, test, vi } from "vitest";
import type { ArtifactRevisionDto, MediaCardDto, MediaGenerationDetailDto, ProjectOverviewDto, UnitDto, UnitRevisionDto } from "../electron/ralphy/types";
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
  const unit: UnitDto = {
    id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", slug: "reel",
    format: "9:16", latestRevisionId: "unit-revision-2", selectedRevisionId: "unit-revision-1",
    createdAt: 1, updatedAt: 2,
  };
  const revision: UnitRevisionDto = {
    id: "unit-revision-1", unitId: "unit-1", revisionNo: 1, parentRevisionId: null,
    iterationId: null, note: null, authoredBySessionId: null, createdAt: 1, sealedAt: 2,
  };
  return {
    loadProjectOverview: vi.fn(async () => overview),
    loadProjectPage: vi.fn(async () => ({ items: [], nextCursor: null })),
    loadProjectMediaCard: vi.fn(async () => { throw new Error("Not used"); }),
    loadDocumentPreview: vi.fn(async () => ({ revisionId: "revision-1", format: "markdown", text: "# Bounded brief", truncated: false })),
    searchProjectDocuments: vi.fn(async () => ({ items: [], nextCursor: null })),
    showProjectDocument: vi.fn(async (project: unknown, documentId: string) => ({ id: documentId, workspaceId: "workspace-1", projectId: "project-1", kind: "brief", slug: "brief", title: "Brief", currentRevisionId: "revision-1", rowVersion: 1, createdAt: 1, updatedAt: 1, currentRevision: { id: "revision-1", documentId, revisionNo: 1, parentRevisionId: null, iterationId: null, format: "markdown", title: null, authoredBySessionId: null, createdAt: 1 } })),
    reviseProjectDocument: vi.fn(async () => ({ id: "revision-2", documentId: "document-1", revisionNo: 2, parentRevisionId: "revision-1", iterationId: null, format: "markdown", title: null, authoredBySessionId: null, createdAt: 2 })),
    resolveProjectPreview: vi.fn(async () => null as { url: string; sizeBytes: number } | null),
    loadProjectGeneration: vi.fn(async (_project: unknown, target: MediaGenerationDetailDto["target"]) => ({ status: "unknown" as const, target, reason: "not-recorded" as const })),
    loadProjectMediaRevisions: vi.fn(async () => ({ items: [] as ArtifactRevisionDto[], nextCursor: null })),
    selectProjectMediaRevision: vi.fn(async () => { throw new Error("Not used"); }),
    loadProjectUnit: vi.fn(async () => unit),
    loadProjectUnitRevision: vi.fn(async () => revision),
    loadProjectUnitPage: vi.fn(async () => ({ items: [], nextCursor: null })),
    selectProjectUnitRevision: vi.fn(async () => unit),
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
      openMediaViewer(card: MediaCardDto): Promise<void>;
      closeMediaViewer(): void;
      navigateMediaViewer(delta: number): Promise<void>;
      retryMediaGeneration(): Promise<void>;
      retryMediaRevisions(): Promise<void>;
      selectMediaRevision(revisionId: string): Promise<void>;
      setMediaFilter(filter: string): Promise<void>;
      openUnit(unitId: string): Promise<void>;
      loadMoreUnitRevisions(): Promise<void>;
      inspectUnitRevision(revisionId: string): Promise<void>;
      loadMoreUnitItems(): Promise<void>;
      loadMoreUnitPresentations(): Promise<void>;
      selectInspectedUnitRevision(): Promise<void>;
      getSnapshot(): any;
      dispose(): void;
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

  test("media viewer ignores late A preview/provenance and navigates only loaded rows", async () => {
    const media = (id: string): MediaCardDto => ({
      ref: { type: "run-object", id }, workspaceId: "workspace-1", projectId: "project-1",
      runId: `run-${id}`, purpose: id, state: "ready", retention: "temp", mime: "image/png", bytes: 12,
      createdAt: 1, objectId: `object-${id}`, logicalPath: `runs/${id}.png`, locationClass: "temp",
      attemptId: null, attemptNo: null, target: { type: "object", id: `object-${id}` },
    });
    const a = media("a");
    const b = media("b");
    const previews = { a: deferred<{ url: string; sizeBytes: number } | null>(), b: deferred<{ url: string; sizeBytes: number } | null>() };
    const generations = { a: deferred<MediaGenerationDetailDto>(), b: deferred<MediaGenerationDetailDto>() };
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [a, b], nextCursor: "another-page" });
    api.resolveProjectPreview.mockImplementation((_project, ref) => previews[ref.id as "a" | "b"].promise);
    api.loadProjectGeneration.mockImplementation((_project, target) => generations[target.id as "a" | "b"].promise);
    const controller = createController(api);
    await controller.selectTab("media");

    const openingA = controller.openMediaViewer(a);
    const openingB = controller.openMediaViewer(b);
    previews.b.resolve({ url: "ralphy-media://asset/b", sizeBytes: 12 });
    generations.b.resolve({ status: "unknown", target: { type: "run-object", id: "b" }, reason: "not-recorded" });
    await openingB;
    previews.a.resolve({ url: "ralphy-media://asset/a", sizeBytes: 12 });
    generations.a.resolve({ status: "unknown", target: { type: "run-object", id: "a" }, reason: "not-recorded" });
    await openingA;

    expect(controller.getSnapshot()).toMatchObject({
      mediaViewerOpen: true,
      selectedMedia: b,
      domain: { preview: { status: "ready", value: { url: "ralphy-media://asset/b" } } },
      mediaGeneration: { status: "ready", value: { target: { id: "b" } } },
    });
    await controller.navigateMediaViewer(1);
    expect(api.resolveProjectPreview).toHaveBeenCalledTimes(2);
    await controller.navigateMediaViewer(-1);
    expect(controller.getSnapshot().selectedMedia).toEqual(a);
    expect(api.loadProjectPage).toHaveBeenCalledOnce();
  });

  test("media viewer chooses an unselected Artifact with nullable CAS and replaces only its loaded card", async () => {
    const unselected: MediaCardDto = {
      ref: { type: "artifact", id: "artifact-1" }, workspaceId: "workspace-1", projectId: "project-1",
      slug: "Hero", kind: "image", selectedRevisionId: null, selectedState: null, mime: null, bytes: null,
      selectedAt: null, revisionCount: 1, selectedObjectId: null, storageClass: null, usageRoles: [], target: null,
    };
    const selected: MediaCardDto = {
      ...unselected, selectedRevisionId: "revision-1", selectedState: "approved", mime: "image/png", bytes: 12,
      selectedAt: 3, selectedObjectId: "object-1", storageClass: "final", target: { type: "object", id: "object-1" },
    };
    const revision: ArtifactRevisionDto = {
      id: "revision-1", artifactId: "artifact-1", objectId: "object-1", revisionNo: 1,
      parentRevisionId: null, iterationId: null, state: "approved", authoredBySessionId: null, createdAt: 2,
    };
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [unselected], nextCursor: "more" });
    api.loadProjectMediaRevisions.mockResolvedValue({ items: [revision], nextCursor: null });
    api.selectProjectMediaRevision.mockResolvedValue(selected as never);
    api.resolveProjectPreview.mockResolvedValue({ url: "ralphy-media://asset/selected", sizeBytes: 12 });
    const controller = createController(api);
    await controller.selectTab("media");

    await controller.openMediaViewer(unselected);
    expect(controller.getSnapshot()).toMatchObject({ mediaViewerOpen: true, mediaRevisions: { status: "ready", items: [revision] } });
    expect(api.resolveProjectPreview).not.toHaveBeenCalled();
    expect(api.loadProjectGeneration).not.toHaveBeenCalled();

    await controller.selectMediaRevision("revision-1");
    expect(api.selectProjectMediaRevision).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", projectId: "project-1" }, "artifact-1", "revision-1", null,
    );
    expect(controller.getSnapshot()).toMatchObject({
      selectedMedia: selected,
      domain: { pages: { media: { items: [selected], nextCursor: "more" } }, preview: { status: "ready" } },
      mediaGeneration: { status: "ready" },
    });
  });

  test("media viewer refreshes an externally selected later-page Artifact exactly after a CAS conflict", async () => {
    const unselected = {
      ref: { type: "artifact" as const, id: "artifact-1" }, workspaceId: "workspace-1", projectId: "project-1",
      slug: "Hero", kind: "image", selectedRevisionId: null, selectedState: null, mime: null, bytes: null,
      selectedAt: null, revisionCount: 2, selectedObjectId: null, storageClass: null, usageRoles: [], target: null,
    };
    const current = { ...unselected, selectedRevisionId: "revision-2", selectedState: "candidate", mime: "image/png", bytes: 10, selectedAt: 4, selectedObjectId: "object-2", storageClass: "final", target: { type: "object" as const, id: "object-2" } };
    const revisions: ArtifactRevisionDto[] = [1, 2].map((revisionNo) => ({
      id: `revision-${revisionNo}`, artifactId: "artifact-1", objectId: `object-${revisionNo}`, revisionNo,
      parentRevisionId: revisionNo === 1 ? null : "revision-1", iterationId: null, state: revisionNo === 1 ? "approved" : "candidate",
      authoredBySessionId: null, createdAt: revisionNo,
    }));
    const conflict = Object.assign(new Error("Conflict"), { code: "E_CONFLICT" });
    const api = createApi();
    const firstPage = { ...unselected, ref: { type: "artifact" as const, id: "artifact-first" }, slug: "First" };
    api.loadProjectPage.mockResolvedValueOnce({ items: [firstPage], nextCursor: "later" }).mockResolvedValueOnce({ items: [unselected], nextCursor: null });
    api.loadProjectMediaCard.mockResolvedValue(current as never);
    api.loadProjectMediaRevisions.mockResolvedValueOnce({ items: [revisions[0]], nextCursor: null }).mockResolvedValueOnce({ items: revisions, nextCursor: null });
    api.selectProjectMediaRevision.mockRejectedValue(conflict);
    api.resolveProjectPreview.mockResolvedValue({ url: "ralphy-media://asset/current", sizeBytes: 10 });
    const controller = createController(api);
    await controller.selectTab("media");
    await controller.loadMore();
    await controller.openMediaViewer(unselected);

    await controller.selectMediaRevision("revision-1");

    expect(api.selectProjectMediaRevision).toHaveBeenCalledOnce();
    expect(api.loadProjectPage).toHaveBeenCalledTimes(2);
    const projectRef = { workspaceId: "workspace-1", projectId: "project-1" };
    expect(api.loadProjectMediaCard).toHaveBeenCalledWith(projectRef, unselected.ref);
    expect(api.resolveProjectPreview).toHaveBeenCalledWith(projectRef, current.ref);
    expect(api.loadProjectGeneration).toHaveBeenCalledWith(projectRef, { type: "artifact-revision", id: "revision-2" });
    expect(controller.getSnapshot()).toMatchObject({
      mediaViewerOpen: true,
      selectedMedia: current,
      domain: { pages: { media: { items: [firstPage, current], nextCursor: null } }, preview: { status: "ready" } },
      mediaGeneration: { status: "ready" },
      mediaRevisions: { status: "ready", items: revisions, error: expect.stringContaining("changed") },
    });
  });

  test("media viewer close invalidates late requests and generation Retry does not reload preview", async () => {
    const media: MediaCardDto = {
      ref: { type: "run-object", id: "run-object-1" }, workspaceId: "workspace-1", projectId: "project-1",
      runId: "run-1", purpose: "output", state: "ready", retention: "temp", mime: "image/png", bytes: 12,
      createdAt: 1, objectId: "object-1", logicalPath: "runs/output.png", locationClass: "temp",
      attemptId: null, attemptNo: null, target: { type: "object", id: "object-1" },
    };
    const latePreview = deferred<{ url: string; sizeBytes: number } | null>();
    const lateGeneration = deferred<MediaGenerationDetailDto>();
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [media], nextCursor: null });
    api.resolveProjectPreview.mockReturnValue(latePreview.promise);
    api.loadProjectGeneration.mockReturnValueOnce(lateGeneration.promise).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ status: "unknown", target: { type: "run-object", id: "run-object-1" }, reason: "not-recorded" });
    const controller = createController(api);
    await controller.selectTab("media");
    const opening = controller.openMediaViewer(media);
    controller.closeMediaViewer();
    latePreview.resolve({ url: "ralphy-media://asset/late", sizeBytes: 12 });
    lateGeneration.resolve({ status: "unknown", target: { type: "run-object", id: "run-object-1" }, reason: "not-recorded" });
    await opening;
    expect(controller.getSnapshot()).toMatchObject({ mediaViewerOpen: false, mediaGeneration: { status: "idle" }, domain: { preview: { status: "idle" } } });

    api.resolveProjectPreview.mockResolvedValue({ url: "ralphy-media://asset/current", sizeBytes: 12 });
    await controller.openMediaViewer(media);
    expect(controller.getSnapshot().mediaGeneration.status).toBe("error");
    await controller.retryMediaGeneration();
    expect(api.resolveProjectPreview).toHaveBeenCalledTimes(2);
    expect(api.loadProjectGeneration).toHaveBeenCalledTimes(3);
    expect(controller.getSnapshot().mediaGeneration.status).toBe("ready");
  });

  test("media viewer revision Retry reloads only the chooser", async () => {
    const card = {
      ref: { type: "artifact" as const, id: "artifact-1" }, workspaceId: "workspace-1", projectId: "project-1",
      slug: "Hero", kind: "image", selectedRevisionId: null, selectedState: null, mime: null, bytes: null,
      selectedAt: null, revisionCount: 1, selectedObjectId: null, storageClass: null, usageRoles: [], target: null,
    };
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [card], nextCursor: null });
    api.loadProjectMediaRevisions.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ items: [], nextCursor: null });
    const controller = createController(api);
    await controller.selectTab("media");
    await controller.openMediaViewer(card);

    await controller.retryMediaRevisions();

    expect(controller.getSnapshot().mediaRevisions.status).toBe("ready");
    expect(api.loadProjectMediaRevisions).toHaveBeenCalledTimes(2);
    expect(api.resolveProjectPreview).not.toHaveBeenCalled();
    expect(api.loadProjectGeneration).not.toHaveBeenCalled();
  });

  test("media viewer ignores late Artifact revision A after opening B", async () => {
    const artifact = (id: string): MediaCardDto => ({
      ref: { type: "artifact", id }, workspaceId: "workspace-1", projectId: "project-1",
      slug: id, kind: "image", selectedRevisionId: null, selectedState: null, mime: null, bytes: null,
      selectedAt: null, revisionCount: 1, selectedObjectId: null, storageClass: null, usageRoles: [], target: null,
    });
    const a = artifact("artifact-a");
    const b = artifact("artifact-b");
    const pages = {
      "artifact-a": deferred<{ items: ArtifactRevisionDto[]; nextCursor: null }>(),
      "artifact-b": deferred<{ items: ArtifactRevisionDto[]; nextCursor: null }>(),
    };
    const revision = (artifactId: string): ArtifactRevisionDto => ({
      id: `revision-${artifactId}`, artifactId, objectId: `object-${artifactId}`, revisionNo: 1,
      parentRevisionId: null, iterationId: null, state: "working", authoredBySessionId: null, createdAt: 1,
    });
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [a, b], nextCursor: null });
    api.loadProjectMediaRevisions.mockImplementation((_project, id) => pages[id as keyof typeof pages].promise);
    const controller = createController(api);
    await controller.selectTab("media");

    const openingA = controller.openMediaViewer(a);
    const openingB = controller.openMediaViewer(b);
    pages["artifact-b"].resolve({ items: [revision("artifact-b")], nextCursor: null });
    await openingB;
    pages["artifact-a"].resolve({ items: [revision("artifact-a")], nextCursor: null });
    await openingA;

    expect(controller.getSnapshot()).toMatchObject({
      mediaViewerOpen: true,
      selectedMedia: b,
      mediaRevisions: { status: "ready", items: [{ artifactId: "artifact-b" }] },
    });
  });

  test("media filter invalidates late preview, generation, and revision completions", async () => {
    const selected: MediaCardDto = {
      ref: { type: "artifact", id: "artifact-1" }, workspaceId: "workspace-1", projectId: "project-1",
      slug: "Hero", kind: "image", selectedRevisionId: "revision-1", selectedState: "approved", mime: "image/png", bytes: 12,
      selectedAt: 1, revisionCount: 1, selectedObjectId: "object-1", storageClass: "final", usageRoles: [], target: { type: "object", id: "object-1" },
    };
    const preview = deferred<{ url: string; sizeBytes: number } | null>();
    const generation = deferred<MediaGenerationDetailDto>();
    const revisions = deferred<{ items: ArtifactRevisionDto[]; nextCursor: null }>();
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [selected], nextCursor: null });
    api.resolveProjectPreview.mockReturnValue(preview.promise);
    api.loadProjectGeneration.mockReturnValue(generation.promise);
    api.loadProjectMediaRevisions.mockReturnValue(revisions.promise);
    const controller = createController(api);
    await controller.selectTab("media");
    const opening = controller.openMediaViewer(selected);

    await controller.setMediaFilter("approved");
    preview.resolve({ url: "ralphy-media://asset/late", sizeBytes: 12 });
    generation.resolve({ status: "unknown", target: { type: "artifact-revision", id: "revision-1" }, reason: "not-recorded" });
    revisions.resolve({ items: [], nextCursor: null });
    await opening;

    expect(controller.getSnapshot()).toMatchObject({
      mediaViewerOpen: false,
      selectedMedia: null,
      domain: { preview: { status: "idle" } },
      mediaGeneration: { status: "idle" },
      mediaRevisions: { status: "idle" },
    });
  });

  test("disposed root controller publishes no late viewer completions", async () => {
    const selected: MediaCardDto = {
      ref: { type: "artifact", id: "artifact-1" }, workspaceId: "workspace-1", projectId: "project-1",
      slug: "Hero", kind: "image", selectedRevisionId: "revision-1", selectedState: "approved", mime: "image/png", bytes: 12,
      selectedAt: 1, revisionCount: 1, selectedObjectId: "object-1", storageClass: "final", usageRoles: [], target: { type: "object", id: "object-1" },
    };
    const preview = deferred<{ url: string; sizeBytes: number } | null>();
    const generation = deferred<MediaGenerationDetailDto>();
    const revisions = deferred<{ items: ArtifactRevisionDto[]; nextCursor: null }>();
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [selected], nextCursor: null });
    api.resolveProjectPreview.mockReturnValue(preview.promise);
    api.loadProjectGeneration.mockReturnValue(generation.promise);
    api.loadProjectMediaRevisions.mockReturnValue(revisions.promise);
    const controller = createController(api);
    await controller.selectTab("media");
    const opening = controller.openMediaViewer(selected);
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.dispose();
    const publicationsBeforeLateResults = listener.mock.calls.length;

    preview.resolve({ url: "ralphy-media://asset/late", sizeBytes: 12 });
    generation.resolve({ status: "unknown", target: { type: "artifact-revision", id: "revision-1" }, reason: "not-recorded" });
    revisions.resolve({ items: [], nextCursor: null });
    await opening;

    expect(listener).toHaveBeenCalledTimes(publicationsBeforeLateResults);
    expect(controller.getSnapshot()).toMatchObject({
      mediaViewerOpen: true,
      domain: { preview: { status: "loading" } },
      mediaGeneration: { status: "loading" },
      mediaRevisions: { status: "loading" },
    });
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

  test("unit workbench opens an off-page selection and pages each child family independently", async () => {
    const unit: UnitDto = {
      id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", slug: "reel",
      format: "9:16", latestRevisionId: "revision-newest", selectedRevisionId: "revision-selected",
      createdAt: 1, updatedAt: 2,
    };
    const revision = (id: string, revisionNo: number): UnitRevisionDto => ({
      id, unitId: "unit-1", revisionNo, parentRevisionId: null, iterationId: null,
      note: null, authoredBySessionId: null, createdAt: revisionNo, sealedAt: revisionNo,
    });
    const item = (id: string, position: number) => ({
      id, unitRevisionId: "revision-selected", artifactRevisionId: `artifact-${id}`,
      documentRevisionId: null, role: "asset", position, config: null, createdAt: position + 1,
    });
    const presentation = (id: string, position: number) => ({
      id, unitRevisionId: "revision-selected", platform: "tiktok", position,
      effectiveCaptionRevisionId: null, coverArtifactRevisionId: null, crop: null,
      safeArea: null, options: {}, createdAt: position + 1,
    });
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [unit], nextCursor: null });
    api.loadProjectUnit.mockResolvedValue(unit);
    api.loadProjectUnitRevision.mockResolvedValue(revision("revision-selected", 1));
    api.loadProjectUnitPage.mockImplementation(async (_project, request: any) => {
      if (request.kind === "revisions") return request.cursor
        ? { items: [revision("revision-older", 1)], nextCursor: null }
        : { items: [revision("revision-newest", 2)], nextCursor: "revision-next" };
      if (request.kind === "items") return request.cursor
        ? { items: [item("item-2", 1)], nextCursor: null }
        : { items: [item("item-1", 0)], nextCursor: "item-next" };
      return request.cursor
        ? { items: [presentation("presentation-2", 1)], nextCursor: null }
        : { items: [presentation("presentation-1", 0)], nextCursor: "presentation-next" };
    });
    const controller = createController(api);
    await controller.selectTab("units");

    await controller.openUnit("unit-1");

    expect(controller.getSnapshot()).toMatchObject({
      unitId: "unit-1",
      unit: { status: "ready", value: unit },
      unitRevisions: { status: "ready", items: [{ id: "revision-newest" }], nextCursor: "revision-next" },
      inspectedUnitRevisionId: "revision-selected",
      inspectedUnitRevision: { status: "ready", value: { id: "revision-selected" } },
      unitItems: { status: "ready", items: [{ id: "item-1" }], nextCursor: "item-next" },
      unitPresentations: { status: "ready", items: [{ id: "presentation-1" }], nextCursor: "presentation-next" },
    });
    expect(api.loadProjectUnitRevision).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", projectId: "project-1" }, "unit-1", "revision-selected",
    );
    expect(api.loadProjectUnitPage).toHaveBeenCalledTimes(3);

    await Promise.all([controller.loadMoreUnitRevisions(), controller.loadMoreUnitRevisions()]);
    await controller.loadMoreUnitItems();
    await controller.loadMoreUnitPresentations();
    expect(controller.getSnapshot()).toMatchObject({
      unitRevisions: { items: [{ id: "revision-newest" }, { id: "revision-older" }], nextCursor: null },
      unitItems: { items: [{ id: "item-1" }, { id: "item-2" }], nextCursor: null },
      unitPresentations: { items: [{ id: "presentation-1" }, { id: "presentation-2" }], nextCursor: null },
    });
    expect(api.loadProjectUnitPage.mock.calls.filter(([, request]) => request.cursor === "revision-next"))
      .toHaveLength(1);
  });

  test("unit workbench fences stale Unit, revision, child, and disposed completions", async () => {
    const unit = (id: string): UnitDto => ({
      id: `unit-${id}`, workspaceId: "workspace-1", projectId: "project-1", slug: id,
      format: "9:16", latestRevisionId: `revision-${id}`, selectedRevisionId: `revision-${id}`,
      createdAt: 1, updatedAt: 2,
    });
    const revision = (id: string, unitId = "unit-b"): UnitRevisionDto => ({
      id, unitId, revisionNo: 1, parentRevisionId: null, iterationId: null, note: null,
      authoredBySessionId: null, createdAt: 1, sealedAt: 2,
    });
    const shells = { a: deferred<UnitDto>(), b: deferred<UnitDto>() };
    const exactA = deferred<UnitRevisionDto>();
    const exactB = deferred<UnitRevisionDto>();
    const disposedExact = deferred<UnitRevisionDto>();
    const api = createApi();
    api.loadProjectUnit.mockImplementation((_project, id) => shells[id.endsWith("a") ? "a" : "b"].promise);
    api.loadProjectUnitPage.mockImplementation(async (_project, request: any) => request.kind === "revisions"
      ? { items: [revision(`revision-${request.unitId.slice(-1)}`, request.unitId)], nextCursor: null }
      : { items: [], nextCursor: null });
    api.loadProjectUnitRevision.mockImplementation(async (_project, unitId, revisionId) => {
      if (revisionId === "inspect-a") return exactA.promise;
      if (revisionId === "inspect-b") return exactB.promise;
      if (revisionId === "disposed") return disposedExact.promise;
      return revision(revisionId, unitId);
    });
    const controller = createController(api);

    const openingA = controller.openUnit("unit-a");
    const openingB = controller.openUnit("unit-b");
    shells.b.resolve(unit("b"));
    await openingB;
    shells.a.resolve(unit("a"));
    await openingA;
    expect(controller.getSnapshot()).toMatchObject({
      unitId: "unit-b", unit: { status: "ready", value: { id: "unit-b" } },
      inspectedUnitRevisionId: "revision-b",
    });
    expect(api.loadProjectUnitPage.mock.calls.some(([, request]) => request.unitId === "unit-a"))
      .toBe(false);

    const inspectingA = controller.inspectUnitRevision("inspect-a");
    const inspectingB = controller.inspectUnitRevision("inspect-b");
    exactB.resolve(revision("inspect-b"));
    await inspectingB;
    exactA.resolve(revision("inspect-a"));
    await inspectingA;
    expect(controller.getSnapshot()).toMatchObject({
      inspectedUnitRevisionId: "inspect-b",
      inspectedUnitRevision: { status: "ready", value: { id: "inspect-b" } },
    });
    expect(api.loadProjectUnitPage.mock.calls.some(([, request]) => request.revisionId === "inspect-a"))
      .toBe(false);

    const listener = vi.fn();
    controller.subscribe(listener);
    const late = controller.inspectUnitRevision("disposed");
    controller.dispose();
    const emitted = listener.mock.calls.length;
    disposedExact.resolve(revision("disposed"));
    await late;
    expect(listener).toHaveBeenCalledTimes(emitted);
  });

  test("unit workbench retains failed tails and reloads a CAS conflict without retrying", async () => {
    const unit = (selectedRevisionId: string): UnitDto => ({
      id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", slug: "reel",
      format: "9:16", latestRevisionId: "revision-3", selectedRevisionId, createdAt: 1, updatedAt: 3,
    });
    const revision = (id: string, sealedAt: number | null = 2): UnitRevisionDto => ({
      id, unitId: "unit-1", revisionNo: Number(id.at(-1)) || 1, parentRevisionId: null,
      iterationId: null, note: null, authoredBySessionId: null, createdAt: 1, sealedAt,
    });
    const conflict = Object.assign(new Error("Conflict"), { code: "E_CONFLICT" });
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [unit("revision-1")], nextCursor: null });
    api.loadProjectUnit.mockResolvedValueOnce(unit("revision-1")).mockResolvedValue(unit("revision-3"));
    api.loadProjectUnitRevision.mockImplementation(async (_project, _unitId, id) => revision(id, id === "revision-draft" ? null : 2));
    let tailAttempt = 0;
    api.loadProjectUnitPage.mockImplementation(async (_project, request: any) => {
      if (request.kind !== "revisions") return { items: [], nextCursor: null };
      if (!request.cursor) return { items: [revision("revision-3"), revision("revision-2")], nextCursor: "revision-next" };
      tailAttempt += 1;
      if (tailAttempt === 1) throw new Error("Offline");
      return { items: [revision("revision-older")], nextCursor: "revision-next" };
    });
    api.selectProjectUnitRevision
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(unit("revision-2"));
    const controller = createController(api);
    await controller.selectTab("units");
    await controller.openUnit("unit-1");

    await controller.loadMoreUnitRevisions();
    expect(controller.getSnapshot().unitRevisions).toMatchObject({
      status: "error", items: [{ id: "revision-3" }, { id: "revision-2" }],
      nextCursor: "revision-next", error: "Offline",
    });
    await controller.loadMoreUnitRevisions();
    expect(controller.getSnapshot().unitRevisions).toMatchObject({
      status: "error", items: [{ id: "revision-3" }, { id: "revision-2" }],
      nextCursor: "revision-next", error: expect.stringContaining("cursor"),
    });

    await controller.inspectUnitRevision("revision-2");
    const exactCallsBeforeConflict = api.loadProjectUnitRevision.mock.calls.length;
    await controller.selectInspectedUnitRevision();
    expect(api.selectProjectUnitRevision).toHaveBeenCalledOnce();
    expect(api.loadProjectUnit).toHaveBeenCalledTimes(2);
    expect(api.loadProjectUnitRevision).toHaveBeenCalledTimes(exactCallsBeforeConflict);
    expect(controller.getSnapshot()).toMatchObject({
      unit: { status: "ready", value: { selectedRevisionId: "revision-3" } },
      inspectedUnitRevisionId: "revision-2",
      unitConflict: expect.stringContaining("changed"),
      domain: { pages: { units: { items: [{ selectedRevisionId: "revision-3" }] } } },
    });

    await controller.selectInspectedUnitRevision();
    expect(api.selectProjectUnitRevision).toHaveBeenNthCalledWith(2,
      { workspaceId: "workspace-1", projectId: "project-1" },
      "unit-1", "revision-2", "revision-3",
    );
    expect(controller.getSnapshot()).toMatchObject({
      unit: { value: { selectedRevisionId: "revision-2" } }, unitConflict: null,
      domain: { pages: { units: { items: [{ selectedRevisionId: "revision-2" }] } } },
    });

    await controller.inspectUnitRevision("revision-draft");
    await controller.selectInspectedUnitRevision();
    expect(api.selectProjectUnitRevision).toHaveBeenCalledTimes(2);

    api.selectProjectUnitRevision.mockRejectedValueOnce(new Error("Offline mutation"));
    await controller.inspectUnitRevision("revision-4");
    await controller.selectInspectedUnitRevision();
    expect(api.selectProjectUnitRevision).toHaveBeenCalledTimes(3);
    expect(controller.getSnapshot()).toMatchObject({
      unitMutation: "idle", unitMutationError: "Offline mutation", unitConflict: null,
    });
  });

  test("unit conflict refresh failure preserves ready data without retrying the mutation", async () => {
    const unit: UnitDto = {
      id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", slug: "reel",
      format: "9:16", latestRevisionId: "revision-3", selectedRevisionId: "revision-1",
      createdAt: 1, updatedAt: 3,
    };
    const revision = (id: string): UnitRevisionDto => ({
      id, unitId: "unit-1", revisionNo: Number(id.at(-1)), parentRevisionId: null,
      iterationId: null, note: null, authoredBySessionId: null, createdAt: 1, sealedAt: 2,
    });
    const conflict = Object.assign(new Error("Conflict"), { code: "E_CONFLICT" });
    const api = createApi();
    let revisionPage = 0;
    api.loadProjectUnit
      .mockResolvedValueOnce(unit)
      .mockRejectedValueOnce(new Error("conflict refresh offline"));
    api.loadProjectUnitRevision.mockImplementation(async (_project, _unitId, id) => revision(id));
    api.loadProjectUnitPage.mockImplementation(async (_project, request: any) => {
      if (request.kind === "revisions") {
        revisionPage += 1;
        return revisionPage === 1
          ? { items: [revision("revision-3"), revision("revision-2")], nextCursor: "revision-next" }
          : { items: [revision("revision-3")], nextCursor: null };
      }
      if (request.kind === "items") return {
        items: [{
          id: `item-${request.revisionId}`, unitRevisionId: request.revisionId,
          artifactRevisionId: "artifact-1", documentRevisionId: null, role: "asset",
          position: 0, config: null, createdAt: 1,
        }],
        nextCursor: "item-next",
      };
      return { items: [], nextCursor: null };
    });
    api.selectProjectUnitRevision.mockRejectedValueOnce(conflict);
    const controller = createController(api);
    await controller.openUnit("unit-1");
    await controller.inspectUnitRevision("revision-2");

    await controller.selectInspectedUnitRevision();

    expect(api.selectProjectUnitRevision).toHaveBeenCalledOnce();
    expect(api.loadProjectUnit).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      unit: { status: "ready", value: { selectedRevisionId: "revision-1" }, error: null },
      unitRevisions: {
        status: "ready", items: [{ id: "revision-3" }, { id: "revision-2" }],
        nextCursor: "revision-next", requestedCursor: null, error: null,
      },
      inspectedUnitRevisionId: "revision-2",
      unitItems: {
        status: "ready", items: [{ id: "item-revision-2" }], nextCursor: "item-next", error: null,
      },
      unitMutation: "idle",
      unitConflict: null,
      unitMutationError: "conflict refresh offline",
    });
  });

  test("inspecting another revision cancels a pending conflict refresh without orphaning ready data", async () => {
    const unit: UnitDto = {
      id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", slug: "reel",
      format: "9:16", latestRevisionId: "revision-3", selectedRevisionId: "revision-1",
      createdAt: 1, updatedAt: 3,
    };
    const revision = (id: string): UnitRevisionDto => ({
      id, unitId: "unit-1", revisionNo: Number(id.at(-1)), parentRevisionId: null,
      iterationId: null, note: null, authoredBySessionId: null, createdAt: 1, sealedAt: 2,
    });
    const refreshedUnit = deferred<UnitDto>();
    const refreshedRevisions = deferred<{ items: UnitRevisionDto[]; nextCursor: string | null }>();
    const conflict = Object.assign(new Error("Conflict"), { code: "E_CONFLICT" });
    const api = createApi();
    let revisionPage = 0;
    api.loadProjectUnit.mockResolvedValueOnce(unit).mockReturnValueOnce(refreshedUnit.promise);
    api.loadProjectUnitRevision.mockImplementation(async (_project, _unitId, id) => revision(id));
    api.loadProjectUnitPage.mockImplementation(async (_project, request: any) => {
      if (request.kind === "revisions") {
        revisionPage += 1;
        if (revisionPage === 2) return refreshedRevisions.promise;
        return { items: [revision("revision-3"), revision("revision-2")], nextCursor: "revision-next" };
      }
      if (request.kind === "items") return {
        items: [{
          id: `item-${request.revisionId}`, unitRevisionId: request.revisionId,
          artifactRevisionId: "artifact-1", documentRevisionId: null, role: "asset",
          position: 0, config: null, createdAt: 1,
        }],
        nextCursor: null,
      };
      return { items: [], nextCursor: null };
    });
    api.selectProjectUnitRevision.mockRejectedValueOnce(conflict);
    const controller = createController(api);
    await controller.openUnit("unit-1");
    await controller.inspectUnitRevision("revision-2");

    const selecting = controller.selectInspectedUnitRevision();
    await vi.waitFor(() => {
      expect(api.loadProjectUnit).toHaveBeenCalledTimes(2);
      expect(revisionPage).toBe(2);
    });
    await controller.inspectUnitRevision("revision-3");
    refreshedUnit.resolve({ ...unit, selectedRevisionId: "revision-3", updatedAt: 4 });
    refreshedRevisions.resolve({ items: [revision("revision-3")], nextCursor: null });
    await selecting;

    expect(api.selectProjectUnitRevision).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({
      unit: { status: "ready", value: { selectedRevisionId: "revision-1" }, error: null },
      unitRevisions: {
        status: "ready", items: [{ id: "revision-3" }, { id: "revision-2" }],
        nextCursor: "revision-next", requestedCursor: null, error: null,
      },
      inspectedUnitRevisionId: "revision-3",
      inspectedUnitRevision: { status: "ready", value: { id: "revision-3" } },
      unitItems: { status: "ready", items: [{ id: "item-revision-3" }] },
      unitMutation: "idle",
      unitConflict: null,
      unitMutationError: null,
    });
  });

  test("revision append refuses to interrupt a pending Unit conflict refresh", async () => {
    const unit: UnitDto = {
      id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", slug: "reel",
      format: "9:16", latestRevisionId: "revision-3", selectedRevisionId: "revision-1",
      createdAt: 1, updatedAt: 3,
    };
    const revision = (id: string): UnitRevisionDto => ({
      id, unitId: "unit-1", revisionNo: Number(id.at(-1)), parentRevisionId: null,
      iterationId: null, note: null, authoredBySessionId: null, createdAt: 1, sealedAt: 2,
    });
    const refreshedUnit = deferred<UnitDto>();
    const refreshedRevisions = deferred<{ items: UnitRevisionDto[]; nextCursor: string | null }>();
    const conflict = Object.assign(new Error("Conflict"), { code: "E_CONFLICT" });
    const api = createApi();
    let revisionPage = 0;
    api.loadProjectUnit.mockResolvedValueOnce(unit).mockReturnValueOnce(refreshedUnit.promise);
    api.loadProjectUnitRevision.mockImplementation(async (_project, _unitId, id) => revision(id));
    api.loadProjectUnitPage.mockImplementation(async (_project, request: any) => {
      if (request.kind !== "revisions") return { items: [], nextCursor: null };
      if (request.cursor) return { items: [revision("revision-older")], nextCursor: null };
      revisionPage += 1;
      if (revisionPage === 2) return refreshedRevisions.promise;
      return { items: [revision("revision-3"), revision("revision-2")], nextCursor: "revision-next" };
    });
    api.selectProjectUnitRevision.mockRejectedValueOnce(conflict);
    const controller = createController(api);
    await controller.openUnit("unit-1");
    await controller.inspectUnitRevision("revision-2");

    const selecting = controller.selectInspectedUnitRevision();
    await vi.waitFor(() => expect(revisionPage).toBe(2));
    await controller.loadMoreUnitRevisions();

    expect(api.loadProjectUnitPage.mock.calls.filter(([, request]) => request.kind === "revisions" && request.cursor))
      .toHaveLength(0);
    expect(controller.getSnapshot()).toMatchObject({
      unitRevisions: {
        status: "ready", items: [{ id: "revision-3" }, { id: "revision-2" }],
        nextCursor: "revision-next", requestedCursor: null, error: null,
      },
      unitMutation: "select",
    });
    refreshedUnit.resolve({ ...unit, selectedRevisionId: "revision-3", updatedAt: 4 });
    refreshedRevisions.resolve({ items: [revision("revision-3")], nextCursor: null });
    await selecting;

    expect(controller.getSnapshot()).toMatchObject({
      unit: { status: "ready", value: { selectedRevisionId: "revision-3" } },
      unitRevisions: { status: "ready", items: [{ id: "revision-3" }], nextCursor: null },
      unitMutation: "idle",
      unitConflict: expect.stringContaining("changed"),
      unitMutationError: null,
    });
  });

  test("Unit selection refuses while revision append is loading and works after it settles", async () => {
    const unit: UnitDto = {
      id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", slug: "reel",
      format: "9:16", latestRevisionId: "revision-3", selectedRevisionId: "revision-1",
      createdAt: 1, updatedAt: 3,
    };
    const revision = (id: string): UnitRevisionDto => ({
      id, unitId: "unit-1", revisionNo: Number(id.at(-1)) || 1, parentRevisionId: null,
      iterationId: null, note: null, authoredBySessionId: null, createdAt: 1, sealedAt: 2,
    });
    const tail = deferred<{ items: UnitRevisionDto[]; nextCursor: string | null }>();
    const api = createApi();
    api.loadProjectUnit.mockResolvedValue(unit);
    api.loadProjectUnitRevision.mockImplementation(async (_project, _unitId, id) => revision(id));
    api.loadProjectUnitPage.mockImplementation(async (_project, request: any) => {
      if (request.kind !== "revisions") return { items: [], nextCursor: null };
      if (request.cursor) return tail.promise;
      return { items: [revision("revision-3"), revision("revision-2")], nextCursor: "revision-next" };
    });
    api.selectProjectUnitRevision.mockResolvedValue({ ...unit, selectedRevisionId: "revision-2", updatedAt: 4 });
    const controller = createController(api);
    await controller.openUnit("unit-1");
    await controller.inspectUnitRevision("revision-2");

    const appending = controller.loadMoreUnitRevisions();
    await vi.waitFor(() => expect(controller.getSnapshot().unitRevisions.status).toBe("loading"));
    await controller.selectInspectedUnitRevision();

    expect(api.selectProjectUnitRevision).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      unit: { status: "ready", value: { selectedRevisionId: "revision-1" } },
      unitRevisions: {
        status: "loading", items: [{ id: "revision-3" }, { id: "revision-2" }],
        nextCursor: "revision-next", requestedCursor: "revision-next", error: null,
      },
      unitMutation: "idle",
    });
    tail.resolve({ items: [revision("revision-older")], nextCursor: null });
    await appending;
    await controller.selectInspectedUnitRevision();

    expect(api.selectProjectUnitRevision).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({
      unit: { status: "ready", value: { selectedRevisionId: "revision-2" } },
      unitRevisions: {
        status: "ready",
        items: [{ id: "revision-3" }, { id: "revision-2" }, { id: "revision-older" }],
        nextCursor: null,
      },
      unitMutation: "idle",
    });
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
    api.loadProjectPage.mockImplementation(({ mediaQuery }: { mediaQuery?: { filter: string } }) => (
      mediaQuery?.filter === "candidate" ? candidate.promise : all.promise
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
    api.loadProjectPage.mockImplementation(({ mediaQuery }: { mediaQuery?: { filter: string } }) => (
      mediaQuery?.filter === "candidate" ? candidate.promise : all.promise
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
    expect(api.loadProjectPage).toHaveBeenNthCalledWith(3, { tab: "media", project: { workspaceId: "workspace-1", projectId: "project-1" }, cursor: "candidate-next", mediaQuery: { filter: "candidate" } });
    expect(controller.getSnapshot().domain.pages.media).toMatchObject({ status: "error", items: [{ ref: { type: "artifact", id: "one" } }], nextCursor: "candidate-next", mediaFilter: "candidate" });
    await controller.retry();
    expect(api.loadProjectPage).toHaveBeenNthCalledWith(4, { tab: "media", project: { workspaceId: "workspace-1", projectId: "project-1" }, cursor: "candidate-next", mediaQuery: { filter: "candidate" } });
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
