import { describe, expect, test } from "vitest";
import {
  createProjectDomainState,
  projectDomainReducer,
} from "../src/state/project-domain";

describe("Project domain state", () => {
  test("rejects a preview response from the previous project generation", () => {
    let state = createProjectDomainState({ workspaceId: "workspace-1", projectId: "project-1" });
    state = projectDomainReducer(state, {
      type: "preview-loading",
      generation: 1,
      requestId: "preview-1",
    });
    expect(state.preview).toMatchObject({ status: "loading", requestId: "preview-1" });

    state = projectDomainReducer(state, {
      type: "project-changed",
      project: { workspaceId: "workspace-1", projectId: "project-2" },
    });
    state = projectDomainReducer(state, {
      type: "preview-ready",
      generation: 1,
      requestId: "preview-1",
      value: { url: "ralphy-media://asset/stale", sizeBytes: 10 },
    });

    expect(state.preview).toEqual({ status: "idle", value: null, error: null, requestId: null });
  });

  test("rejects an out-of-order preview response within one project", () => {
    let state = createProjectDomainState({ workspaceId: "workspace-1", projectId: "project-1" });
    state = projectDomainReducer(state, { type: "preview-loading", generation: 1, requestId: "preview-1" });
    state = projectDomainReducer(state, { type: "preview-loading", generation: 1, requestId: "preview-2" });
    state = projectDomainReducer(state, {
      type: "preview-ready",
      generation: 1,
      requestId: "preview-1",
      value: { url: "ralphy-media://asset/old", sizeBytes: 10 },
    });
    expect(state.preview).toMatchObject({ status: "loading", requestId: "preview-2", value: null });

    state = projectDomainReducer(state, {
      type: "preview-ready",
      generation: 1,
      requestId: "preview-2",
      value: { url: "ralphy-media://asset/current", sizeBytes: 11 },
    });
    expect(state.preview).toMatchObject({
      status: "ready",
      requestId: "preview-2",
      value: { url: "ralphy-media://asset/current", sizeBytes: 11 },
    });
  });

  test("loads tabs lazily and appends each stable row once", () => {
    let state = createProjectDomainState({ workspaceId: "workspace-1", projectId: "project-1" });
    expect(state.pages.documents.status).toBe("idle");

    state = projectDomainReducer(state, { type: "page-loading", tab: "documents", generation: 1, requestId: "documents-1" });
    state = projectDomainReducer(state, {
      type: "page-ready",
      tab: "documents",
      generation: 1,
      requestId: "documents-1",
      page: { items: [{ id: "one" }, { id: "two" }], nextCursor: "next" },
    });
    state = projectDomainReducer(state, { type: "page-loading", tab: "documents", generation: 1, requestId: "documents-2" });
    state = projectDomainReducer(state, {
      type: "page-ready",
      tab: "documents",
      generation: 1,
      requestId: "documents-2",
      append: true,
      page: { items: [{ id: "two" }, { id: "three" }], nextCursor: null },
    });

    expect(state.pages.documents).toMatchObject({
      status: "ready",
      items: [{ id: "one" }, { id: "two" }, { id: "three" }],
      nextCursor: null,
    });
  });

  test("rejects stale results, keeps errors local for retry, and resets on project change", () => {
    let state = createProjectDomainState({ workspaceId: "workspace-1", projectId: "project-1" });
    state = projectDomainReducer(state, { type: "project-changed", project: { workspaceId: "workspace-1", projectId: "project-2" } });
    state = projectDomainReducer(state, {
      type: "page-ready",
      tab: "compositions",
      generation: 1,
      requestId: "stale-compositions",
      page: { items: [{ id: "stale" }], nextCursor: null },
    });
    state = projectDomainReducer(state, { type: "page-loading", tab: "media", generation: 2, requestId: "media-1", mediaFilter: "all" });
    state = projectDomainReducer(state, { type: "page-failed", tab: "media", generation: 2, requestId: "media-1", mediaFilter: "all", error: "Offline" });
    expect(state.pages.compositions.items).toEqual([]);
    expect(state.pages.media).toMatchObject({ status: "error", error: "Offline" });

    state = projectDomainReducer(state, { type: "page-loading", tab: "media", generation: 2, requestId: "media-2", mediaFilter: "all" });
    state = projectDomainReducer(state, { type: "page-loading", tab: "compositions", generation: 2, requestId: "compositions-1" });
    state = projectDomainReducer(state, {
      type: "page-ready",
      tab: "compositions",
      generation: 2,
      requestId: "compositions-1",
      page: { items: [], nextCursor: null },
    });
    expect(state.pages.media.status).toBe("loading");
    expect(state.pages.compositions).toMatchObject({ status: "ready", items: [] });
  });

  test("keeps loaded rows visible when pagination fails and retries append-only", () => {
    let state = createProjectDomainState({ workspaceId: "workspace-1", projectId: "project-1" });
    state = projectDomainReducer(state, { type: "page-loading", tab: "documents", generation: 1, requestId: "documents-1" });
    state = projectDomainReducer(state, {
      type: "page-ready",
      tab: "documents",
      generation: 1,
      requestId: "documents-1",
      page: { items: [{ id: "one" }], nextCursor: "next" },
    });
    state = projectDomainReducer(state, { type: "page-loading", tab: "documents", generation: 1, requestId: "documents-2" });
    state = projectDomainReducer(state, { type: "page-failed", tab: "documents", generation: 1, requestId: "documents-2", error: "Try again" });

    expect(state.pages.documents).toMatchObject({
      status: "error",
      items: [{ id: "one" }],
      nextCursor: "next",
      error: "Try again",
    });

    state = projectDomainReducer(state, { type: "page-loading", tab: "documents", generation: 1, requestId: "documents-3" });
    state = projectDomainReducer(state, {
      type: "page-ready",
      tab: "documents",
      generation: 1,
      requestId: "documents-3",
      append: true,
      page: { items: [{ id: "one" }, { id: "two" }], nextCursor: null },
    });
    expect(state.pages.documents.items).toEqual([{ id: "one" }, { id: "two" }]);
  });

  test("resets Media rows and preview when the Core filter changes", () => {
    let state = createProjectDomainState({ workspaceId: "workspace-1", projectId: "project-1" });
    state = projectDomainReducer(state, { type: "preview-loading", generation: 1, requestId: "preview-1" });
    state = projectDomainReducer(state, { type: "preview-ready", generation: 1, requestId: "preview-1", value: { url: "ralphy-media://asset/one", sizeBytes: 1 } });
    state = projectDomainReducer(state, {
      type: "page-loading", tab: "media", generation: 1, requestId: "all-1", mediaFilter: "all",
    });
    state = projectDomainReducer(state, {
      type: "page-ready", tab: "media", generation: 1, requestId: "all-1", mediaFilter: "all",
      page: { items: [{ ref: { type: "artifact", id: "artifact-1" } }], nextCursor: "more" },
    });
    state = projectDomainReducer(state, { type: "media-filter", filter: "candidate" });

    expect(state.media.filter).toBe("candidate");
    expect(state.pages.media).toMatchObject({ status: "idle", items: [], nextCursor: null, mediaFilter: null });
    expect(state.preview).toEqual({ status: "idle", value: null, error: null, requestId: null });
  });

  test("rejects a previous-filter success after Candidate becomes current", () => {
    let state = createProjectDomainState({ workspaceId: "workspace-1", projectId: "project-1" });
    state = projectDomainReducer(state, {
      type: "page-loading", tab: "media", generation: 1, requestId: "all-1", mediaFilter: "all",
    });
    state = projectDomainReducer(state, { type: "media-filter", filter: "candidate" });
    state = projectDomainReducer(state, {
      type: "page-loading", tab: "media", generation: 1, requestId: "candidate-1", mediaFilter: "candidate",
    });
    state = projectDomainReducer(state, {
      type: "page-ready", tab: "media", generation: 1, requestId: "candidate-1", mediaFilter: "candidate",
      page: { items: [{ ref: { type: "artifact", id: "candidate-1" } }], nextCursor: null },
    });
    state = projectDomainReducer(state, {
      type: "page-ready", tab: "media", generation: 1, requestId: "all-1", mediaFilter: "all",
      page: { items: [{ ref: { type: "artifact", id: "stale-1" } }], nextCursor: null },
    });

    expect(state.pages.media.items).toEqual([{ ref: { type: "artifact", id: "candidate-1" } }]);
    expect(state.pages.media.mediaFilter).toBe("candidate");
  });

  test("rejects a previous-filter error while Candidate is loading", () => {
    let state = createProjectDomainState({ workspaceId: "workspace-1", projectId: "project-1" });
    state = projectDomainReducer(state, {
      type: "page-loading", tab: "media", generation: 1, requestId: "all-1", mediaFilter: "all",
    });
    state = projectDomainReducer(state, { type: "media-filter", filter: "candidate" });
    state = projectDomainReducer(state, {
      type: "page-loading", tab: "media", generation: 1, requestId: "candidate-1", mediaFilter: "candidate",
    });
    state = projectDomainReducer(state, {
      type: "page-failed", tab: "media", generation: 1, requestId: "all-1", mediaFilter: "all", error: "stale",
    });

    expect(state.pages.media).toMatchObject({ status: "loading", error: null, requestId: "candidate-1", mediaFilter: "candidate" });
  });

  test("deduplicates overlapping Activity pages by sequence", () => {
    let state = createProjectDomainState({ workspaceId: "workspace-1", projectId: "project-1" });
    state = projectDomainReducer(state, {
      type: "page-loading", tab: "activity", generation: 1, requestId: "activity-1",
    });
    state = projectDomainReducer(state, {
      type: "page-ready", tab: "activity", generation: 1, requestId: "activity-1",
      page: { items: [{ sequence: 1 }, { sequence: 2 }], nextCursor: 2 },
    });
    state = projectDomainReducer(state, {
      type: "page-loading", tab: "activity", generation: 1, requestId: "activity-2",
    });
    state = projectDomainReducer(state, {
      type: "page-ready", tab: "activity", generation: 1, requestId: "activity-2", append: true,
      page: { items: [{ sequence: 2 }, { sequence: 3 }], nextCursor: null },
    });

    expect(state.pages.activity.items).toEqual([{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }]);
  });
});
