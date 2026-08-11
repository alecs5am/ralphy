import { describe, expect, test, vi } from "vitest";
import { createProjectReader } from "../electron/ralphy/project-reader";
import type { RalphyBridgeClient } from "../electron/ralphy/client";
import type {
  ArtifactMediaCardDto,
  CompositionRevisionDto,
  DocumentRevisionDto,
  DocumentSearchDto,
  MediaCardDto,
  MediaGenerationDetailDto,
  MediaFilter,
  ProjectOverviewDto,
  UnitDto,
  UnitItemDto,
  UnitPresentationDto,
  UnitRevisionDto,
} from "../electron/ralphy/types";

const project = { workspaceId: "workspace-1", projectId: "project-1" };

function page(items: unknown[] = [], nextCursor: string | null = null) {
  return { items, nextCursor };
}

const generationDetail: MediaGenerationDetailDto = {
  status: "generation",
  target: { type: "artifact-revision", id: "arev_1" },
  run: { id: "run_1", workspaceId: "workspace-1", projectId: "project-1", agentSessionId: null, kind: "generation", label: null, state: "succeeded", createdAt: 1, startedAt: 2, endedAt: 3 },
  attempts: {
    items: [{ id: "attempt_1", runId: "run_1", attemptNo: 1, provider: "openrouter", model: "fixture", state: "succeeded", costUsd: 0.5, startedAt: 2, endedAt: 3, input: { version: 1, texts: [{ role: "prompt", value: "Safe prompt", truncated: false }], parameters: [{ name: "aspectRatio", value: "9:16" }] } }],
    nextCursor: null,
  },
  cost: { knownUsd: 0.5, complete: true },
};

const artifactCard: ArtifactMediaCardDto = {
  ref: { type: "artifact", id: "art_1" }, workspaceId: "workspace-1", projectId: "project-1",
  slug: "hero", kind: "image", selectedRevisionId: "arev_1", selectedState: "approved",
  mime: "image/png", bytes: 12, selectedAt: 3, revisionCount: 1, selectedObjectId: "obj_1",
  storageClass: "bucket", usageRoles: [], target: { type: "object", id: "obj_1" },
  mediaKind: "image", provenance: "generation",
};

const runObjectCard: MediaCardDto = {
  ref: { type: "run-object", id: "robj_1" }, workspaceId: "workspace-1", projectId: "project-1",
  runId: "run_1", purpose: "output", state: "ready", retention: "durable",
  mime: "video/mp4", bytes: 24, logicalPath: "outputs/final.mp4", locationClass: "other",
  attemptId: null, attemptNo: null, createdAt: 4, objectId: "obj_2",
  target: { type: "object", id: "obj_2" }, mediaKind: "video", provenance: "not-generation",
};

const objectCard: MediaCardDto = {
  ref: { type: "object", id: "obj_3" }, workspaceId: "workspace-1", projectId: "project-1",
  storageClass: "bucket", mime: "application/json", bytes: 36, createdAt: 5,
  referenceCount: 1, target: { type: "object", id: "obj_3" },
  mediaKind: "document", provenance: "unknown",
};

describe("Project domain reader", () => {
  test("documents workbench validates and forwards one literal search page without draining", async () => {
    const searchResult: DocumentSearchDto = {
      documentId: "document-1", revisionId: "revision-2", workspaceId: "workspace-1", projectId: "project-1",
      kind: "brief", slug: "launch-brief", documentTitle: "Launch brief", revisionNo: 2,
      parentRevisionId: "revision-1", iterationId: null, format: "markdown", title: "Launch brief v2",
      authoredBySessionId: null, createdAt: 2,
    };
    const request = vi.fn(async () => page([searchResult], "opaque-next"));
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    for (const query of ["c++", "launch-hook", 'say "launch"', "NOT"]) {
      request.mockClear();
      await expect(reader.searchDocuments(project, query, "opaque-after")).resolves.toEqual(
        page([searchResult], "opaque-next"),
      );
      expect(request).toHaveBeenCalledOnce();
      expect(request).toHaveBeenCalledWith("document.search", {
        context: project, query, after: "opaque-after", limit: 50,
      });
    }

    const utf8Boundary = `  ${"é".repeat(512)}  `;
    request.mockClear();
    await expect(reader.searchDocuments(project, utf8Boundary)).resolves.toEqual(
      page([searchResult], "opaque-next"),
    );
    expect(request).toHaveBeenCalledWith("document.search", {
      context: project, query: utf8Boundary, limit: 50,
    });

    request.mockClear();
    for (const [query, cursor] of [["   ", null], ["é".repeat(513), null], ["x", ""], ["x", "x".repeat(4097)], ["x", 1]] as const) {
      await expect(reader.searchDocuments(project, query, cursor as never)).rejects.toThrow();
    }
    expect(request).not.toHaveBeenCalled();

    for (const malformed of [
      { items: [searchResult], nextCursor: "opaque-next", private: true },
      page([{ ...searchResult, projectId: "project-2" }]),
      page([{ ...searchResult, workspaceId: "workspace-2" }]),
      page([{ ...searchResult, format: "html" }]),
      page([searchResult], 1 as never),
    ]) {
      const invalid = createProjectReader({
        request: vi.fn(async () => malformed) as unknown as RalphyBridgeClient["request"],
      });
      await expect(invalid.searchDocuments(project, "launch")).rejects.toThrow("Invalid Document search page");
    }
  });

  test("preserves populated Core overview and revision DTO fields", async () => {
    const overview: ProjectOverviewDto = {
      project: { id: "project-1", workspaceId: "workspace-1", slug: "launch", name: "Launch", state: "active", rowVersion: 1, createdAt: 1, updatedAt: 2 },
      documents: {
        items: [{
          id: "document-1", workspaceId: "workspace-1", projectId: "project-1", slug: "brief", title: "Brief", kind: "brief",
          currentRevisionId: "document-revision-1", rowVersion: 2, createdAt: 3, updatedAt: 4,
          binding: { ownerType: "project", ownerId: "project-1", role: "brief", documentId: "document-1", boundRevisionId: "document-revision-1", currentHeadRevisionId: "document-revision-2", hasNewerHead: true },
        }],
        nextCursor: null,
      },
      iterations: { items: [{ id: "iteration-1", projectId: "project-1", number: 2, title: "Polish", state: "closed", priorIterationChanges: "Tightened the opening hook.", createdAt: 5, closedAt: 6 }], nextCursor: null },
      feedback: { items: [{ id: "feedback-1", projectId: "project-1", iterationId: "iteration-1", status: "resolved", targetType: "artifact_revision", targetId: "artifact-revision-1", createdAt: 7, resolvedAt: 8 }], nextCursor: null },
    };
    const documentRevision: DocumentRevisionDto = {
      id: "document-revision-1", documentId: "document-1", revisionNo: 1, parentRevisionId: null,
      iterationId: "iteration-1", format: "markdown", title: "Brief v1", authoredBySessionId: "session-1", createdAt: 9,
    };
    const compositionRevision: CompositionRevisionDto = {
      id: "composition-revision-1", compositionId: "composition-1", revisionNo: 1, parentRevisionId: null,
      iterationId: "iteration-1", state: "sealed", engine: "hyperframes", engineVersion: "1", authoredBySessionId: "session-1", createdAt: 10, sealedAt: 11,
    };
    const request = vi.fn(async () => overview);
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await expect(reader.loadOverview(project)).resolves.toEqual(overview);
    expect(documentRevision).toMatchObject({ parentRevisionId: null, authoredBySessionId: "session-1" });
    expect(compositionRevision).toMatchObject({ engine: "hyperframes", sealedAt: 11 });
  });

  test("reads the Core state and bounded overview sections without a scanner", async () => {
    const request = vi.fn(async () => ({
      project: { id: "project-1", workspaceId: "workspace-1", slug: "launch", name: "Launch", purpose: "Launch the summer campaign.", state: "active", rowVersion: 1, createdAt: 1, updatedAt: 1 },
      mediaCounts: { artifacts: 1, objects: 2, runObjects: 3 },
    }));
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await expect(reader.loadOverview(project)).resolves.toMatchObject({
      project: { state: "active" },
      mediaCounts: { artifacts: 1, objects: 2, runObjects: 3 },
    });
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("project.overview", {
      context: project,
      projectId: "project-1",
      sections: {
        documents: { limit: 5 },
        iterations: { limit: 5 },
        feedback: { limit: 5 },
        stages: { limit: 5 },
        compositions: { limit: 5 },
        builds: { limit: 5 },
        units: { limit: 5 },
        runs: { limit: 5 },
        activity: { afterSequence: 0, limit: 10 },
        mediaCounts: true,
        publications: { limit: 5 },
        metrics: true,
      },
    });
  });

  test("loads one bounded Documents page without a scanner follow-up", async () => {
    const request = vi.fn(async () => page([{ id: "document-1" }], "next"));
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await expect(reader.loadPage({ tab: "documents", project })).resolves.toEqual(
      page([{ id: "document-1" }], "next"),
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("document.list", {
      context: project,
      limit: 50,
    });
  });

  test("loads one exact generation-detail request and maps selected Artifact cards locally", async () => {
    const request = vi.fn(async () => generationDetail);
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await expect(reader.loadGeneration(project, { type: "artifact-revision", id: "arev_1" })).resolves.toEqual(generationDetail);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("media.generation.show", {
      context: project,
      target: { type: "artifact-revision", id: "arev_1" },
      limit: 20,
    });

    request.mockClear();
    await expect(reader.loadGeneration(project, { ...artifactCard, selectedRevisionId: null })).resolves.toEqual({
      status: "unknown",
      target: { type: "artifact-revision", id: "art_1" },
      reason: "not-recorded",
    });
    expect(request).not.toHaveBeenCalled();
    await expect(reader.loadGeneration(project, {
      ref: { type: "object", id: "obj_1" }, workspaceId: "workspace-1", projectId: "project-1",
      storageClass: "bucket", mime: "image/png", bytes: 12, createdAt: 1, referenceCount: 1,
      target: { type: "object", id: "obj_1" }, mediaKind: "image", provenance: "unknown",
    })).rejects.toThrow("Invalid generation target");
  });

  test("rejects malformed generation detail at every public boundary", async () => {
    const invalid = [
      { ...generationDetail, status: "private" },
      { ...generationDetail, target: { type: "object", id: "obj_1" } },
      { ...generationDetail, target: { type: "artifact-revision", id: "" } },
      { ...generationDetail, attempts: { items: [], nextCursor: 1 } },
      { ...generationDetail, run: { ...generationDetail.run, state: "done" } },
      { ...generationDetail, run: { ...generationDetail.run, createdAt: Number.NaN } },
      { ...generationDetail, attempts: { items: [{ ...generationDetail.attempts.items[0]!, provider: 1 }], nextCursor: null } },
      { ...generationDetail, attempts: { items: [{ ...generationDetail.attempts.items[0]!, attemptNo: 0 }], nextCursor: null } },
      { ...generationDetail, attempts: { items: [{ ...generationDetail.attempts.items[0]!, costUsd: Number.POSITIVE_INFINITY }], nextCursor: null } },
      { ...generationDetail, cost: { knownUsd: Number.NaN, complete: true } },
      { ...generationDetail, attempts: { items: [{ ...generationDetail.attempts.items[0]!, input: { version: 1, texts: [{ role: "prompt", value: "x".repeat(65_537), truncated: false }], parameters: [] } }], nextCursor: null } },
      { ...generationDetail, attempts: { items: [{ ...generationDetail.attempts.items[0]!, input: { version: 1, texts: [], parameters: [{ name: "voiceId", value: "private" }] } }], nextCursor: null } },
      { ...generationDetail, attempts: { items: [{ ...generationDetail.attempts.items[0]!, input: { version: 1, texts: [], parameters: [{ name: "speed", value: Number.NaN }] } }], nextCursor: null } },
      { ...generationDetail, attempts: { items: [{ ...generationDetail.attempts.items[0]!, input: { version: 1, texts: [], parameters: [], credential: "private" } }], nextCursor: null } },
      { ...generationDetail, metadata: { private: true } },
    ];

    for (const result of invalid) {
      const reader = createProjectReader({ request: vi.fn(async () => result) as unknown as RalphyBridgeClient["request"] });
      await expect(reader.loadGeneration(project, { type: "artifact-revision", id: "arev_1" })).rejects.toThrow("Invalid generation detail");
    }
  });

  test("pages Artifact revisions and selects one with a null-aware guard", async () => {
    const revision = {
      id: "arev_1", artifactId: "art_1", objectId: "obj_1", revisionNo: 1,
      parentRevisionId: null, iterationId: "iteration-1", state: "approved",
      authoredBySessionId: "session-1", createdAt: 2,
    };
    const request = vi.fn(async (method: string) => method === "media.revisions" ? page([revision], "next") : artifactCard);
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await expect(reader.loadMediaRevisions(project, "art_1")).resolves.toEqual(page([revision], "next"));
    await expect(reader.selectMediaRevision(project, "art_1", "arev_1", null)).resolves.toEqual(artifactCard);
    expect(request).toHaveBeenNthCalledWith(1, "media.revisions", {
      context: project, ref: { type: "artifact", id: "art_1" }, limit: 50,
    });
    expect(request).toHaveBeenNthCalledWith(2, "media.select", {
      context: project,
      ref: { type: "artifact", id: "art_1" },
      revisionId: "arev_1",
      expectedSelectedRevisionId: null,
    });
  });

  test("loads one exact scoped Media card and rejects mismatched or malformed results", async () => {
    const request = vi.fn(async () => artifactCard);
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await expect(reader.loadMediaCard(project, artifactCard.ref)).resolves.toEqual(artifactCard);
    expect(request).toHaveBeenCalledWith("media.show", {
      context: project,
      ref: artifactCard.ref,
    });

    await expect(reader.loadMediaCard(project, { type: "artifact", id: "" })).rejects.toThrow("Invalid Media reference");
    await expect(reader.loadMediaCard(project, { type: "artifact", id: "art_1", extra: true } as never)).rejects.toThrow("Invalid Media reference");
    for (const result of [
      { ...artifactCard, ref: { type: "artifact", id: "other" } },
      { ...artifactCard, workspaceId: "other" },
      { ...artifactCard, projectId: "other" },
      { ...artifactCard, privatePath: "/private/asset.png" },
    ]) {
      const invalidReader = createProjectReader({
        request: vi.fn(async () => result) as unknown as RalphyBridgeClient["request"],
      });
      await expect(invalidReader.loadMediaCard(project, artifactCard.ref)).rejects.toThrow("Invalid Media card");
    }
  });

  test("resolves one exact action locator with the purpose mapped inside main", async () => {
    const locator = { absolutePath: "/private/hero.png", mime: "image/png", bytes: 12 };
    const request = vi.fn(async (method: string) => method === "media.show" ? artifactCard : locator);
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    for (const [action, purpose] of [
      ["open", "open"], ["finder", "finder"], ["copy", "drag"],
    ] as const) {
      request.mockClear();
      await expect(reader.resolveMediaActionLocator(project, artifactCard.ref, action)).resolves.toEqual(locator);
      expect(request).toHaveBeenNthCalledWith(1, "media.show", { context: project, ref: artifactCard.ref });
      expect(request).toHaveBeenNthCalledWith(2, "locator.resolve", {
        context: project, target: artifactCard.target, purpose,
      });
    }

    const unselected = { ...artifactCard, selectedRevisionId: null, selectedState: null, mime: null,
      bytes: null, selectedAt: null, selectedObjectId: null, storageClass: null, target: null };
    const noTarget = createProjectReader({
      request: vi.fn(async () => unselected) as unknown as RalphyBridgeClient["request"],
    });
    await expect(noTarget.resolveMediaActionLocator(project, artifactCard.ref, "open"))
      .rejects.toThrow("Media has no resolvable target");

    for (const malformed of [
      { ...locator, absolutePath: "relative/hero.png" },
      { ...locator, mime: 42 },
      { ...locator, bytes: -1 },
      { ...locator, providerResponse: "private" },
    ]) {
      const invalid = createProjectReader({
        request: vi.fn(async (method: string) => method === "media.show" ? artifactCard : malformed) as unknown as RalphyBridgeClient["request"],
      });
      await expect(invalid.resolveMediaActionLocator(project, artifactCard.ref, "open"))
        .rejects.toThrow("Invalid action locator");
    }
  });

  test("rejects invalid revision pages and mismatched selection responses", async () => {
    const invalidPageReader = createProjectReader({
      request: vi.fn(async () => page([{
        id: "arev_1", artifactId: "other", objectId: "obj_1", revisionNo: 1,
        parentRevisionId: null, iterationId: null, state: "approved",
        authoredBySessionId: null, createdAt: 1,
      }])) as unknown as RalphyBridgeClient["request"],
    });
    await expect(invalidPageReader.loadMediaRevisions(project, "art_1")).rejects.toThrow("Invalid Artifact revision page");

    for (const response of [
      { ...artifactCard, ref: { type: "artifact", id: "other" } },
      { ...artifactCard, selectedRevisionId: "arev_other" },
      { ...artifactCard, ref: { type: "run-object", id: "art_1" } },
      { ...artifactCard, target: { type: "object", id: "obj_other" } },
    ]) {
      const reader = createProjectReader({ request: vi.fn(async () => response) as unknown as RalphyBridgeClient["request"] });
      await expect(reader.selectMediaRevision(project, "art_1", "arev_1", null)).rejects.toThrow("Invalid selected Artifact");
    }
  });

  test("rejects generation details outside the requested Project scope or fixed attempt page", async () => {
    const siblingScope = [
      { ...generationDetail, run: { ...generationDetail.run, workspaceId: "workspace-2" } },
      { ...generationDetail, run: { ...generationDetail.run, projectId: "project-2" } },
      {
        status: "not-generation",
        target: generationDetail.target,
        producer: { ...generationDetail.run, workspaceId: "workspace-2" },
      },
      {
        ...generationDetail,
        attempts: {
          items: Array.from({ length: 21 }, (_, index) => ({
            ...generationDetail.attempts.items[0]!,
            id: `attempt_${index + 1}`,
            attemptNo: index + 1,
          })),
          nextCursor: null,
        },
      },
    ];

    for (const result of siblingScope) {
      const reader = createProjectReader({
        request: vi.fn(async () => result) as unknown as RalphyBridgeClient["request"],
      });
      await expect(reader.loadGeneration(project, {
        type: "artifact-revision", id: "arev_1",
      })).rejects.toThrow("Invalid generation detail");
    }
  });

  test("maps the lifecycle filter and optional facet axes to one exact Core query", async () => {
    const request = vi.fn(async () => page([artifactCard, runObjectCard, objectCard], "still-more"));
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });
    const cases: Array<["all" | MediaFilter, Record<string, unknown>]> = [
      ["all", { types: ["artifact", "run-object"] }],
      ["references", { types: ["artifact", "run-object"], filter: "references" }],
      ["working", { types: ["artifact", "run-object"], filter: "working" }],
      ["candidate", { types: ["artifact", "run-object"], filter: "candidate" }],
      ["approved", { types: ["artifact", "run-object"], filter: "approved" }],
      ["rejected", { types: ["artifact", "run-object"], filter: "rejected" }],
      ["superseded", { types: ["artifact", "run-object"], filter: "superseded" }],
      ["run-diagnostics", { types: ["artifact", "run-object"], filter: "run-diagnostics" }],
      ["run-cache-temp", { types: ["artifact", "run-object"], filter: "run-cache-temp" }],
      ["advanced-objects", { types: ["object"], filter: "advanced-objects" }],
    ];

    for (const [mediaFilter, predicate] of cases) {
      await reader.loadPage({ tab: "media", project, mediaQuery: { filter: mediaFilter } });
      expect(request).toHaveBeenLastCalledWith("media.list", {
        context: project,
        limit: 50,
        ...predicate,
      });
    }
    expect(request).toHaveBeenCalledTimes(10);

    await reader.loadPage({
      tab: "media",
      project,
      mediaQuery: { filter: "candidate", mediaKind: "video", provenance: "generation" },
    });
    expect(request).toHaveBeenLastCalledWith("media.list", {
      context: project,
      filter: "candidate",
      mediaKind: "video",
      provenance: "generation",
      limit: 50,
      types: ["artifact", "run-object"],
    });
  });

  test("rejects unknown or malformed Media classifications from every card variant", async () => {
    for (const result of [
      { ...artifactCard, mediaKind: "model-output" },
      { ...runObjectCard, provenance: "probably" },
      { ...objectCard, mediaKind: null },
      { ...objectCard, privatePath: "/private/object.json" },
    ]) {
      const reader = createProjectReader({
        request: vi.fn(async () => page([result])) as unknown as RalphyBridgeClient["request"],
      });
      await expect(reader.loadPage({
        tab: "media", project, mediaQuery: { filter: "all" },
      })).rejects.toThrow("Invalid Media card");
    }
  });

  test("forwards a cursor with the unchanged Candidate predicate", async () => {
    const request = vi.fn(async () => page([], "still-more"));
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await reader.loadPage({
      tab: "media",
      project,
      cursor: "page-680",
      mediaQuery: { filter: "candidate" },
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("media.list", {
      context: project,
      after: "page-680",
      filter: "candidate",
      limit: 50,
      types: ["artifact", "run-object"],
    });
  });

  test("includes the project id on a bounded Compositions page", async () => {
    const request = vi.fn(async () => page());
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await reader.loadPage({ tab: "compositions", project });
    expect(request).toHaveBeenCalledWith("composition.list", {
      context: project,
      projectId: "project-1",
      limit: 50,
    });
  });

  test("unit workbench reads exact identities and one opaque page per Unit family", async () => {
    const unit: UnitDto = {
      id: "unit-1", workspaceId: "workspace-1", projectId: "project-1", slug: "reel",
      format: "9:16", latestRevisionId: "unit-revision-2", selectedRevisionId: "unit-revision-1",
      createdAt: 1, updatedAt: 2,
    };
    const revision = (id: string, revisionNo: number): UnitRevisionDto => ({
      id, unitId: "unit-1", revisionNo, parentRevisionId: revisionNo === 1 ? null : "unit-revision-1",
      iterationId: null, note: null, authoredBySessionId: null, createdAt: revisionNo,
      sealedAt: revisionNo,
    });
    const item = (id: string, position: number): UnitItemDto => ({
      id, unitRevisionId: "unit-revision-1", artifactRevisionId: `artifact-${id}`,
      documentRevisionId: null, role: "asset", position, config: null, createdAt: position + 1,
    });
    const presentation = (id: string, position: number): UnitPresentationDto => ({
      id, unitRevisionId: "unit-revision-1", platform: "tiktok", position,
      effectiveCaptionRevisionId: null, coverArtifactRevisionId: null, crop: null,
      safeArea: null, options: {}, createdAt: position + 1,
    });
    const request = vi.fn(async (method: string, params: Record<string, unknown>) => {
      if (method === "unit.show" || method === "unit.select") return unit;
      if (method === "unit.revision.show") return revision("unit-revision-1", 1);
      if (method === "unit.revisions") return params.after
        ? page([revision("unit-revision-1", 1)])
        : page([revision("unit-revision-2", 2)], "revision-next");
      if (method === "unit.items") return params.after
        ? page([item("item-2", 1)])
        : page([item("item-1", 0)], "item-next");
      if (method === "unit.presentations") return params.after
        ? page([presentation("presentation-2", 1)])
        : page([presentation("presentation-1", 0)], "presentation-next");
      throw new Error(`Unexpected ${method}`);
    });
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await expect(reader.loadProjectUnit(project, "unit-1")).resolves.toEqual(unit);
    await expect(reader.loadProjectUnitRevision(project, "unit-1", "unit-revision-1"))
      .resolves.toMatchObject({ id: "unit-revision-1", unitId: "unit-1" });
    await reader.loadProjectUnitPage(project, { kind: "revisions", unitId: "unit-1" });
    await reader.loadProjectUnitPage(project, { kind: "revisions", unitId: "unit-1", cursor: "revision-next" });
    await reader.loadProjectUnitPage(project, { kind: "items", revisionId: "unit-revision-1" });
    await reader.loadProjectUnitPage(project, { kind: "items", revisionId: "unit-revision-1", cursor: "item-next" });
    await reader.loadProjectUnitPage(project, { kind: "presentations", revisionId: "unit-revision-1" });
    await reader.loadProjectUnitPage(project, { kind: "presentations", revisionId: "unit-revision-1", cursor: "presentation-next" });
    await expect(reader.selectProjectUnitRevision(project, "unit-1", "unit-revision-1", null))
      .resolves.toEqual(unit);

    expect(request).toHaveBeenCalledWith("unit.revisions", {
      context: project, unitId: "unit-1", order: "newest", limit: 50,
    });
    expect(request).toHaveBeenCalledWith("unit.revisions", {
      context: project, unitId: "unit-1", order: "newest", after: "revision-next", limit: 50,
    });
    expect(request).toHaveBeenCalledWith("unit.items", {
      context: project, revisionId: "unit-revision-1", after: "item-next", limit: 50,
    });
    expect(request).toHaveBeenCalledWith("unit.presentations", {
      context: project, revisionId: "unit-revision-1", after: "presentation-next", limit: 50,
    });
    expect(request).toHaveBeenCalledWith("unit.select", {
      context: project, unitId: "unit-1", revisionId: "unit-revision-1",
      expectedSelectedRevisionId: null,
    });
    expect(request.mock.calls.map(([method]) => method)).not.toEqual(expect.arrayContaining([
      "presentation.items", "presentation.captions", "unit.preview", "unit.revise",
    ]));

    const sharedUnit = { ...unit, projectId: null };
    const sharedReader = createProjectReader({
      request: vi.fn(async () => sharedUnit) as unknown as RalphyBridgeClient["request"],
    });
    await expect(sharedReader.loadProjectUnit(project, "unit-1")).resolves.toEqual(sharedUnit);

    let overDepth: Record<string, unknown> = {};
    for (let depth = 0; depth < 34; depth += 1) overDepth = { child: overDepth };

    for (const [method, result, action] of [
      ["unit.show", { ...unit, projectId: "project-2" }, (candidate: ReturnType<typeof createProjectReader>) => candidate.loadProjectUnit(project, "unit-1")],
      ["unit.revision.show", { ...revision("unit-revision-1", 1), unitId: "unit-2" }, (candidate: ReturnType<typeof createProjectReader>) => candidate.loadProjectUnitRevision(project, "unit-1", "unit-revision-1")],
      ["unit.items", page([{ ...item("item-1", 0), unitRevisionId: "unit-revision-2" }]), (candidate: ReturnType<typeof createProjectReader>) => candidate.loadProjectUnitPage(project, { kind: "items", revisionId: "unit-revision-1" })],
      ["unit.items", page([{ ...item("item-1", 0), config: overDepth }]), (candidate: ReturnType<typeof createProjectReader>) => candidate.loadProjectUnitPage(project, { kind: "items", revisionId: "unit-revision-1" })],
      ["unit.presentations", page([{ ...presentation("presentation-1", 0), unitRevisionId: "unit-revision-2" }]), (candidate: ReturnType<typeof createProjectReader>) => candidate.loadProjectUnitPage(project, { kind: "presentations", revisionId: "unit-revision-1" })],
      ["unit.select", { ...unit, selectedRevisionId: "unit-revision-2" }, (candidate: ReturnType<typeof createProjectReader>) => candidate.selectProjectUnitRevision(project, "unit-1", "unit-revision-1", null)],
    ] as const) {
      const candidate = createProjectReader({
        request: vi.fn(async (actual) => {
          if (actual !== method) throw new Error(`Unexpected ${actual}`);
          return result;
        }) as unknown as RalphyBridgeClient["request"],
      });
      await expect(action(candidate)).rejects.toThrow(/Invalid Unit/);
    }
  });

  test("loads the complete Composition aggregate by draining every opaque nested cursor", async () => {
    const composition = { id: "composition-1", projectId: "project-1", slug: "hero", kind: "video", latestRevisionId: "revision-2", selectedRevisionId: "revision-1", createdAt: 1, updatedAt: 2 };
    const revision = (id: string, revisionNo: number) => ({ id, compositionId: "composition-1", revisionNo, parentRevisionId: revisionNo === 1 ? null : "revision-1", iterationId: null, state: "sealed", engine: "manual", engineVersion: null, authoredBySessionId: null, createdAt: revisionNo, sealedAt: revisionNo });
    const build = (id: string) => ({ id, compositionRevisionId: "revision-1", runId: `run-${id}`, state: "succeeded", createdAt: 3, finishedAt: 4 });
    const request = vi.fn(async (method: string, params: Record<string, unknown>) => {
      if (method === "composition.show") return composition;
      if (method === "composition.revisions") return params.after ? page([revision("revision-2", 2)]) : page([revision("revision-1", 1)], "revisions-next");
      if (method === "composition.sources") {
        if (params.revisionId === "revision-2") return page();
        return params.after ? page([{ id: "source-2", compositionRevisionId: "revision-1", objectId: "object-2", position: 1, createdAt: 2 }]) : page([{ id: "source-1", compositionRevisionId: "revision-1", objectId: "object-1", position: 0, createdAt: 1 }], "sources-next");
      }
      if (method === "composition.inputs") return page();
      if (method === "composition.builds") {
        if (params.compositionRevisionId === "revision-2") return page();
        return params.after ? page([build("build-2")]) : page([build("build-1")], "builds-next");
      }
      if (method === "build.outputs") {
        if (params.buildId === "build-2") return page();
        return params.after ? page([{ id: "output-2", buildId: "build-1", artifactRevisionId: "artifact-revision-2", role: "preview", position: 1, createdAt: 2 }]) : page([{ id: "output-1", buildId: "build-1", artifactRevisionId: "artifact-revision-1", role: "master", position: 0, createdAt: 1 }], "outputs-next");
      }
      if (method === "evaluation.list") return page([{ id: `evaluation-${(params.target as { id: string }).id}`, workspaceId: "workspace-1", projectId: "project-1", target: params.target, kind: "review", verdict: null, favorite: false, rating: null, tags: [], note: null, authoredBySessionId: "session-1", createdAt: 1 }]);
      throw new Error(`Unexpected ${method}`);
    });
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    const aggregate = await reader.loadComposition(project, "composition-1");

    expect(aggregate.revisions.map(({ id }) => id)).toEqual(["revision-1", "revision-2"]);
    expect(aggregate.revisions[0]!.sources.map(({ id }) => id)).toEqual(["source-1", "source-2"]);
    expect(aggregate.revisions[0]!.builds.map(({ id }) => id)).toEqual(["build-1", "build-2"]);
    expect(aggregate.revisions[0]!.builds[0]!.outputs.map(({ id }) => id)).toEqual(["output-1", "output-2"]);
    expect(request).toHaveBeenCalledWith("evaluation.list", { context: project, target: { type: "composition_revision", id: "revision-1" }, limit: 50 });
    expect(request).toHaveBeenCalledWith("evaluation.list", { context: project, target: { type: "build", id: "build-1" }, limit: 50 });
    expect(request).toHaveBeenCalledWith("build.outputs", { context: project, buildId: "build-1", after: "outputs-next", limit: 50 });
  });

  test("previews one exact Build output revision without returning its locator", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === "media.revision.show") return {
        id: "artifact-revision-1", artifactId: "artifact-1", objectId: "object-1", revisionNo: 1,
        parentRevisionId: null, iterationId: null, state: "candidate", authoredBySessionId: null, createdAt: 1,
      };
      if (method === "locator.resolve") return { absolutePath: "/private/output.mp4", mime: "video/mp4", bytes: 12 };
      throw new Error(`Unexpected ${method}`);
    });
    const mint = vi.fn(async () => ({ url: "ralphy-media://asset/token", sizeBytes: 12 }));
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"], mint });

    const preview = await reader.resolveCompositionOutputPreview(project, "artifact-revision-1");

    expect(preview).toEqual({ url: "ralphy-media://asset/token", sizeBytes: 12, mime: "video/mp4" });
    expect(Object.keys(preview)).toEqual(["url", "sizeBytes", "mime"]);
    expect(request).toHaveBeenNthCalledWith(1, "media.revision.show", { context: project, revisionId: "artifact-revision-1" });
    expect(request).toHaveBeenNthCalledWith(2, "locator.resolve", { context: project, target: { type: "object", id: "object-1" }, purpose: "preview" });
    expect(JSON.stringify(preview)).not.toContain("/private/output.mp4");
  });

  test("forwards exact Composition mutation guards without legacy wrappers", async () => {
    const request = vi.fn(async (method: string) => method === "composition.build"
      ? { id: "build-1", compositionRevisionId: "revision-2", runId: "run-1", state: "succeeded", createdAt: 1, finishedAt: 2, outputs: [] }
      : method === "composition.select"
        ? { id: "composition-1", projectId: "project-1", slug: "hero", kind: "video", latestRevisionId: "revision-2", selectedRevisionId: "revision-1", createdAt: 1, updatedAt: 2 }
        : { id: "revision-3", compositionId: "composition-1", revisionNo: 3, parentRevisionId: "revision-2", iterationId: null, state: "draft", engine: "manual", engineVersion: null, authoredBySessionId: null, createdAt: 3, sealedAt: null });
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await reader.reviseComposition(project, { compositionId: "composition-1", expectedLatestRevisionId: "revision-2", parentRevisionId: "revision-2", engine: "manual", engineVersion: null });
    await reader.selectCompositionRevision(project, { compositionId: "composition-1", revisionId: "revision-1", expectedSelectedRevisionId: "revision-2" });
    await reader.buildComposition(project, "revision-2");

    expect(request).toHaveBeenNthCalledWith(1, "composition.revise", { context: project, compositionId: "composition-1", expectedLatestRevisionId: "revision-2", parentRevisionId: "revision-2", engine: "manual", engineVersion: null });
    expect(request).toHaveBeenNthCalledWith(2, "composition.select", { context: project, compositionId: "composition-1", revisionId: "revision-1", expectedSelectedRevisionId: "revision-2" });
    expect(request).toHaveBeenNthCalledWith(3, "composition.build", { context: project, compositionRevisionId: "revision-2" });
  });

  test("uses the regular page limit for Activity after its sequence cursor", async () => {
    const request = vi.fn(async () => page());
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await reader.loadPage({ tab: "activity", project, cursor: 42 });
    expect(request).toHaveBeenCalledWith("activity.list", {
      context: project,
      afterSequence: 42,
      limit: 50,
    });
  });

  test("uses only an Artifact target for a preview and never returns its locator path", async () => {
    const card = {
      ref: { type: "artifact" as const, id: "artifact-1" },
      workspaceId: "workspace-1",
      projectId: "project-1",
      slug: "hero",
      kind: "image",
      selectedRevisionId: "revision-1",
      selectedState: "approved",
      mime: "image/png",
      bytes: 12,
      selectedAt: 1,
      revisionCount: 1,
      selectedObjectId: "object-1",
      storageClass: "hot",
      usageRoles: [],
      target: { type: "object" as const, id: "object-1" },
    };
    const request = vi.fn(async (method: string, params?: { ref?: { id: string } }) => {
      if (method === "media.show") return params?.ref?.id === "unselected" ? { ...card, ref: { type: "artifact", id: "unselected" }, target: null } : card;
      if (method === "locator.resolve") {
        return { absolutePath: "/private/asset.mp4", mime: "video/mp4", bytes: 12 };
      }
      throw new Error(`Unexpected ${method}`);
    });
    const mint = vi.fn(async () => ({ url: "ralphy-media://asset/token", sizeBytes: 12 }));
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"], mint });

    await expect(reader.resolvePreview(project, card.ref)).resolves.toEqual({ url: "ralphy-media://asset/token", sizeBytes: 12 });
    expect(request).toHaveBeenNthCalledWith(1, "media.show", {
      context: project,
      ref: { type: "artifact", id: "artifact-1" },
    });
    expect(request).toHaveBeenNthCalledWith(2, "locator.resolve", {
      context: project,
      target: { type: "object", id: "object-1" },
      purpose: "preview",
    });
    expect(request).toHaveBeenCalledWith("locator.resolve", {
      context: project,
      target: { type: "object", id: "object-1" },
      purpose: "preview",
    });
    expect(mint).toHaveBeenCalledWith("/private/asset.mp4", "video/mp4", 12);

    await expect(reader.resolvePreview(project, {
      type: "artifact", id: "unselected",
    })).resolves.toBeNull();
  });

  test("reads document content in bounded chunks only", async () => {
    const request = vi.fn(async () => ({
      revisionId: "revision-1",
      format: "markdown",
      text: "preview",
      nextByte: null,
    }));
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await reader.loadDocumentPreview(project, "revision-1");
    expect(request).toHaveBeenCalledWith("document.content", {
      context: project,
      revisionId: "revision-1",
      afterByte: 0,
      limitBytes: 65_536,
    });
  });

  test("marks a preview truncated when a UTF-8-completing chunk crosses the 2 MiB ceiling", async () => {
    const maxBytes = 2 * 1024 * 1024;
    let servedBytes = 0;
    const request = vi.fn(async (_method: string, params: { afterByte: number; limitBytes: number }) => {
      if (servedBytes === maxBytes - 1) {
        servedBytes += 4;
        return { revisionId: "revision-1", format: "markdown", text: "😀", nextByte: servedBytes };
      }
      const bytes = Math.min(params.limitBytes, maxBytes - 1 - servedBytes);
      servedBytes += bytes;
      return { revisionId: "revision-1", format: "markdown", text: "a".repeat(bytes), nextByte: servedBytes };
    });
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    const preview = await reader.loadDocumentPreview(project, "revision-1");

    expect(Buffer.byteLength(preview.text)).toBe(maxBytes - 1);
    expect(preview.text).not.toContain("😀");
    expect(preview.truncated).toBe(true);
    expect(request).toHaveBeenLastCalledWith("document.content", {
      context: project, revisionId: "revision-1", afterByte: maxBytes - 1, limitBytes: 1,
    });
  });

  test("does not mark an exactly 2 MiB terminal revision truncated", async () => {
    const maxBytes = 2 * 1024 * 1024;
    let servedBytes = 0;
    const request = vi.fn(async (_method: string, params: { limitBytes: number }) => {
      const bytes = Math.min(params.limitBytes, maxBytes - servedBytes);
      servedBytes += bytes;
      return { revisionId: "revision-1", format: "text", text: "a".repeat(bytes), nextByte: servedBytes === maxBytes ? null : servedBytes };
    });
    const reader = createProjectReader({ request: request as RalphyBridgeClient["request"] });

    await expect(reader.loadDocumentPreview(project, "revision-1")).resolves.toMatchObject({ truncated: false });
  });
});
