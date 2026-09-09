import { renderToStaticMarkup } from "react-dom/server";
import { act, useSyncExternalStore } from "react";
import { describe, expect, test, vi } from "vitest";
import type { DocumentSearchDto } from "../electron/ralphy/types";
import type { ProjectSummary } from "@/shared/api/ipc";
import * as screen from "@/pages/project";
import { createReactHost, type HostNode } from "./react-host";

const project: ProjectSummary = {
  id: "project-1", workspaceId: "workspace-1", projectId: "project-1", name: "Launch", brief: "Brief",
  status: "active", phase: "production", finalState: "working", platform: null, aspectRatio: null,
  spendUsd: null, finalCount: 0, sharedCount: 0, unitCount: 0, recentActivity: "2026-08-02T00:00:00.000Z",
};

const result: DocumentSearchDto = {
  documentId: "document-1", revisionId: "revision-3", workspaceId: "workspace-1", projectId: "project-1",
  kind: "brief", slug: "launch-brief", documentTitle: "Launch brief", revisionNo: 3,
  parentRevisionId: "revision-2", iterationId: "iteration-1", format: "markdown", title: "Launch brief v3",
  authoredBySessionId: "session-1", createdAt: 3,
};

const document = {
  id: "document-1", workspaceId: "workspace-1", projectId: "project-1", kind: "brief" as const,
  slug: "launch-brief", title: "Launch brief", currentRevisionId: "revision-3", rowVersion: 3, createdAt: 1, updatedAt: 3,
  currentRevision: { id: "revision-3", documentId: "document-1", revisionNo: 3, parentRevisionId: "revision-2", iterationId: "iteration-1", format: "markdown" as const, title: "Launch brief v3", authoredBySessionId: "session-1", createdAt: 3 },
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function createApi() {
  return {
    loadProjectOverview: vi.fn(async () => ({ project: { id: "project-1", workspaceId: "workspace-1", slug: "launch", name: "Launch", state: "active", rowVersion: 1, createdAt: 1, updatedAt: 2 } })),
    loadProjectPage: vi.fn(async () => ({ items: [{ ...document }], nextCursor: null })),
    loadDocumentPreview: vi.fn(async () => ({ revisionId: "revision-3", format: "markdown", text: "# Launch brief", truncated: false })),
    searchProjectDocuments: vi.fn(async () => ({ items: [result], nextCursor: null })),
    showProjectDocument: vi.fn(async () => document),
    reviseProjectDocument: vi.fn(async () => ({ ...document.currentRevision, id: "revision-4", revisionNo: 4, parentRevisionId: "revision-3" })),
    resolveProjectPreview: vi.fn(async () => null),
  };
}

function createController(api: ReturnType<typeof createApi>) {
  return (screen as typeof screen & { createProjectScreenController(api: typeof api, project: ProjectSummary): any })
    .createProjectScreenController(api, project);
}

function markup(controller: any): string {
  const View = (screen as typeof screen & { ProjectScreenView: React.ComponentType<any> }).ProjectScreenView;
  return renderToStaticMarkup(<View project={project} controller={controller} snapshot={controller.getSnapshot()} />);
}

function MountedProject({ controller, memory = new Map<string, number>() }: { controller: any; memory?: Map<string, number> }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const View = (screen as typeof screen & { ProjectScreenView: React.ComponentType<any> }).ProjectScreenView;
  return <View project={project} rootEpoch={1} controller={controller} snapshot={snapshot} scrollMemory={memory} />;
}

function textButton(root: HostNode, text: string): HostNode {
  const value = root.findAll((node) => node.tagName === "BUTTON" && node.textContent.includes(text))[0];
  if (!value) throw new Error(`Missing ${text} button`);
  return value;
}

async function click(node: HostNode): Promise<void> {
  await act(async () => {
    node.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Documents panel", () => {
  test("selects a real FTS DocumentSearchDto through document.show and reads its chunked head", async () => {
    const api = createApi();
    const controller = createController(api);

    await controller.selectTab("documents");
    await controller.searchDocuments("launch");
    await controller.openSearchResult(result);

    expect(api.searchProjectDocuments).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, "launch");
    expect(api.showProjectDocument).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, "document-1");
    expect(api.loadDocumentPreview).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, "revision-3");
    expect(markup(controller)).toContain("Revision 3");
    expect(markup(controller)).not.toContain("Parent revision-2");
    expect(markup(controller)).toContain("<h1>Launch brief</h1>");
  });

  test("renders JSON and revises an explicit edit with the selected head", async () => {
    const api = createApi();
    api.showProjectDocument.mockResolvedValue({ ...document, currentRevision: { ...document.currentRevision, format: "json" } });
    api.loadDocumentPreview.mockResolvedValue({ revisionId: "revision-3", format: "json", text: '{"stage":"draft","count":2}', truncated: false });
    api.reviseProjectDocument.mockResolvedValue({ ...document.currentRevision, id: "revision-4", revisionNo: 4, parentRevisionId: "revision-3", format: "json" });
    const controller = createController(api);

    await controller.selectTab("documents");
    await controller.openDocument(document);
    controller.beginDocumentEdit();
    controller.setDocumentDraftBody('{"stage":"ready","count":2}');
    await controller.saveDocument();

    expect(api.reviseProjectDocument).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, {
      documentId: "document-1", expectedHeadId: "revision-3", format: "json", title: "Launch brief v3", body: { stage: "ready", count: 2 },
    });
    const output = markup(controller);
    expect(output).toContain("&quot;stage&quot;");
    expect(output).toContain("&quot;ready&quot;");
    expect(output).not.toContain("textarea");
  });

  test("renders the active search, editor, and save action with established controls", async () => {
    const controller = createController(createApi());
    await controller.selectTab("documents");
    await controller.openDocument(document);
    controller.beginDocumentEdit();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    const View = (screen as typeof screen & { ProjectScreenView: React.ComponentType<any> }).ProjectScreenView;

    try {
      await act(async () => {
        root.render(<View project={project} controller={controller} snapshot={controller.getSnapshot()} />);
      });
      expect(host.container.querySelector(".document-search")).not.toBeNull();
      expect(host.container.querySelector(".document-editor")).not.toBeNull();
      expect(host.container.querySelector(".document-detail-heading")?.textContent).toContain("Launch");
      const commands = host.container.findAll((node) => node.matches(".command-button"));
      expect(commands.map((node) => node.textContent)).toEqual(expect.arrayContaining(["Cancel", "Save"]));
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("keeps a truncated bounded preview read-only", async () => {
    const api = createApi();
    api.loadDocumentPreview.mockResolvedValue({ revisionId: "revision-3", format: "markdown", text: "# Partial body", truncated: true });
    const controller = createController(api);
    await controller.selectTab("documents");
    await controller.openDocument(document);
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      expect(textButton(host.container, "Edit").disabled).toBe(true);
      expect(host.container.textContent).toMatch(/bounded preview is read-only/i);
      controller.beginDocumentEdit();
      await controller.saveDocument();
      expect(controller.getSnapshot()).toMatchObject({ documentMode: "read", documentDraft: null, documentDirty: false });
      expect(api.reviseProjectDocument).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("keeps the local draft and reloads the current head after E_CONFLICT without retrying", async () => {
    const api = createApi();
    api.reviseProjectDocument.mockRejectedValue({ code: "E_CONFLICT", message: "Document head conflict" });
    api.showProjectDocument
      .mockResolvedValueOnce(document)
      .mockResolvedValueOnce({ ...document, currentRevisionId: "revision-4", currentRevision: { ...document.currentRevision, id: "revision-4", revisionNo: 4, parentRevisionId: "revision-3" } });
    api.loadDocumentPreview
      .mockResolvedValueOnce({ revisionId: "revision-3", format: "markdown", text: "# Old head", truncated: false })
      .mockResolvedValueOnce({ revisionId: "revision-4", format: "markdown", text: "# Current head", truncated: false });
    const controller = createController(api);

    await controller.selectTab("documents");
    await controller.openDocument(document);
    controller.beginDocumentEdit();
    controller.setDocumentDraftBody("# My local draft");
    await controller.saveDocument();

    expect(api.reviseProjectDocument).toHaveBeenCalledTimes(1);
    expect(api.showProjectDocument).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().documentDraft.body).toBe("# My local draft");
    expect(markup(controller)).toContain("Current head");
    expect(markup(controller)).toContain("your local draft was kept");
  });

  test("creates the first revision of an empty valid Document exactly once", async () => {
    const empty = { ...document, currentRevisionId: null, currentRevision: null };
    const api = createApi();
    api.showProjectDocument.mockResolvedValue(empty);
    const controller = createController(api);

    await controller.selectTab("documents");
    await controller.openDocument(empty);
    expect(controller.getSnapshot().documentPreview.status).not.toBe("error");
    controller.beginDocumentEdit();
    expect(markup(controller)).toContain("textarea");
    controller.setDocumentDraftBody("# First revision");
    await controller.saveDocument();

    expect(api.loadDocumentPreview).not.toHaveBeenCalled();
    expect(api.reviseProjectDocument).toHaveBeenCalledTimes(1);
    expect(api.reviseProjectDocument).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, {
      documentId: "document-1", expectedHeadId: null, format: "markdown", body: "# First revision",
    });
  });

  test("keeps B selected when A document.show completes last", async () => {
    const shownA = deferred<typeof document>();
    const documentB = { ...document, id: "document-2", title: "Second", currentRevisionId: "revision-b", currentRevision: { ...document.currentRevision, id: "revision-b", documentId: "document-2" } };
    const api = createApi();
    api.showProjectDocument.mockImplementation(async (_project, documentId) => documentId === document.id ? shownA.promise : documentB);
    api.loadDocumentPreview.mockImplementation(async (_project, revisionId) => ({ revisionId, format: "markdown", text: revisionId === "revision-b" ? "# B" : "# A", truncated: false }));
    const controller = createController(api);

    const openingA = controller.openDocument(document);
    await controller.openDocument(documentB);
    shownA.resolve(document);
    await openingA;

    expect(controller.getSnapshot().selectedDocument?.id).toBe("document-2");
    expect(controller.getSnapshot().documentPreview).toMatchObject({ status: "ready", value: { revisionId: "revision-b", text: "# B" } });
  });

  test("keeps B selected when A content completes last", async () => {
    const contentA = deferred<{ revisionId: string; format: string; text: string; truncated: boolean }>();
    const documentB = { ...document, id: "document-2", title: "Second", currentRevisionId: "revision-b", currentRevision: { ...document.currentRevision, id: "revision-b", documentId: "document-2" } };
    const api = createApi();
    api.showProjectDocument.mockImplementation(async (_project, documentId) => documentId === document.id ? document : documentB);
    api.loadDocumentPreview.mockImplementation(async (_project, revisionId) => revisionId === "revision-3" ? contentA.promise : { revisionId, format: "markdown", text: "# B", truncated: false });
    const controller = createController(api);

    const openingA = controller.openDocument(document);
    await Promise.resolve();
    await controller.openDocument(documentB);
    contentA.resolve({ revisionId: "revision-3", format: "markdown", text: "# A", truncated: false });
    await openingA;

    expect(controller.getSnapshot().selectedDocument?.id).toBe("document-2");
    expect(controller.getSnapshot().documentPreview.value?.text).toBe("# B");
  });

  test("keeps the newer search results when the old query completes last", async () => {
    const oldSearch = deferred<{ items: DocumentSearchDto[]; nextCursor: null }>();
    const newResult = { ...result, documentId: "document-2", revisionId: "revision-b", documentTitle: "New result" };
    const api = createApi();
    api.searchProjectDocuments
      .mockReturnValueOnce(oldSearch.promise)
      .mockResolvedValueOnce({ items: [newResult], nextCursor: null });
    const controller = createController(api);

    const oldRequest = controller.searchDocuments("old");
    await controller.searchDocuments("new");
    oldSearch.resolve({ items: [result], nextCursor: null });
    await oldRequest;

    expect(controller.getSnapshot().documentSearch).toMatchObject({ query: "new", status: "ready", items: [newResult] });
  });

  test("retries a failed Document search with the same query instead of reloading the page", async () => {
    const api = createApi();
    api.searchProjectDocuments
      .mockRejectedValueOnce(new Error("Search unavailable"))
      .mockResolvedValueOnce({ items: [result], nextCursor: null });
    const controller = createController(api);
    await controller.selectTab("documents");
    await controller.searchDocuments("launch hook");

    expect(controller.getSnapshot().documentSearch).toMatchObject({ status: "error", appendError: "Search unavailable" });
    await controller.retryDocumentSearchAppend();

    expect(api.searchProjectDocuments).toHaveBeenNthCalledWith(2, { workspaceId: "workspace-1", projectId: "project-1" }, "launch hook");
    expect(api.loadProjectPage).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().documentSearch).toMatchObject({ query: "launch hook", status: "ready", items: [result] });
  });

  test("ignores a save for A after the user selects B", async () => {
    const savedA = deferred<typeof document.currentRevision>();
    const documentB = { ...document, id: "document-2", title: "Second", currentRevisionId: "revision-b", currentRevision: { ...document.currentRevision, id: "revision-b", documentId: "document-2" } };
    const api = createApi();
    api.showProjectDocument.mockImplementation(async (_project, documentId) => documentId === document.id ? document : documentB);
    api.loadDocumentPreview.mockImplementation(async (_project, revisionId) => ({ revisionId, format: "markdown", text: revisionId === "revision-b" ? "# B" : "# A", truncated: false }));
    api.reviseProjectDocument.mockReturnValueOnce(savedA.promise);
    const controller = createController(api);

    await controller.openDocument(document);
    controller.beginDocumentEdit();
    controller.setDocumentDraftBody("# Saved A");
    const savingA = controller.saveDocument();
    await controller.openDocument(documentB);
    savedA.resolve({ ...document.currentRevision, id: "revision-4", revisionNo: 4, parentRevisionId: "revision-3" });
    await savingA;

    expect(controller.getSnapshot().selectedDocument?.id).toBe("document-2");
    expect(controller.getSnapshot().documentPreview.value?.text).toBe("# B");
  });

  test("blocks duplicate Save, Cancel, and draft edits while a revision is settling", async () => {
    const saved = deferred<typeof document.currentRevision>();
    const api = createApi();
    api.reviseProjectDocument.mockReturnValue(saved.promise);
    const controller = createController(api);

    await controller.openDocument(document);
    controller.beginDocumentEdit();
    controller.setDocumentDraftBody("# Sent");
    const saving = controller.saveDocument();

    expect(controller.getSnapshot().documentSaving).toBe(true);
    controller.setDocumentDraftBody("# Typed after Save");
    controller.setDocumentDraftTitle("Late title");
    controller.setDocumentDraftFormat("json");
    controller.cancelDocumentEdit();
    await controller.saveDocument();

    expect(api.reviseProjectDocument).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({
      documentMode: "edit",
      documentSaving: true,
      documentDraft: { body: "# Sent", title: "Launch brief v3", format: "markdown" },
    });

    saved.resolve({ ...document.currentRevision, id: "revision-4", revisionNo: 4, parentRevisionId: "revision-3" });
    await saving;
    expect(controller.getSnapshot()).toMatchObject({ documentMode: "read", documentSaving: false, documentDraft: null });
  });

  test("keeps edit and navigation blocked until the authoritative conflict preview settles", async () => {
    const shown = deferred<typeof document>();
    const preview = deferred<{ revisionId: string; format: string; text: string; truncated: boolean }>();
    const current = { ...document, currentRevisionId: "revision-4", currentRevision: { ...document.currentRevision, id: "revision-4", revisionNo: 4, parentRevisionId: "revision-3" } };
    const api = createApi();
    api.reviseProjectDocument.mockRejectedValueOnce({ code: "E_CONFLICT", message: "Document head conflict" });
    api.showProjectDocument.mockResolvedValueOnce(document).mockReturnValueOnce(shown.promise);
    api.loadDocumentPreview
      .mockResolvedValueOnce({ revisionId: "revision-3", format: "markdown", text: "# Old head", truncated: false })
      .mockReturnValueOnce(preview.promise);
    const controller = createController(api);
    await controller.selectTab("documents");
    await controller.openDocument(document);
    controller.beginDocumentEdit();
    controller.setDocumentDraftBody("# My local draft");
    const saving = controller.saveDocument();
    await vi.waitFor(() => expect(api.showProjectDocument).toHaveBeenCalledTimes(2));
    expect(controller.getSnapshot()).toMatchObject({
      documentSaving: true,
      documentConflictReview: false,
      documentPreview: { status: "loading", value: null },
    });
    expect(markup(controller)).not.toContain("Review current");
    shown.resolve(current);
    await vi.waitFor(() => expect(controller.getSnapshot().documentPreview.status).toBe("loading"));

    const host = createReactHost();
    const confirm = vi.fn(() => true);
    Object.assign(globalThis.window, { confirm });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      expect(controller.getSnapshot().documentSaving).toBe(true);
      expect(host.container.querySelector(".document-editor")?.disabled).toBe(true);
      expect(textButton(host.container, "Cancel").disabled).toBe(true);
      expect(textButton(host.container, "Saving…").disabled).toBe(true);
      expect(textButton(host.container, "Launch brief").disabled).toBe(true);
      controller.setDocumentDraftBody("# Different");
      await click(textButton(host.container, "Media"));
      expect(confirm).not.toHaveBeenCalled();
      expect(controller.getSnapshot()).toMatchObject({
        activeTab: "documents",
        documentSaving: true,
        documentDraft: { body: "# My local draft" },
      });

      await act(async () => {
        preview.resolve({ revisionId: "revision-4", format: "markdown", text: "# Current head", truncated: false });
        await saving;
      });
      expect(controller.getSnapshot()).toMatchObject({
        documentSaving: false,
        documentDirty: true,
        documentDraft: { body: "# My local draft" },
        documentPreview: { value: { revisionId: "revision-4", text: "# Current head" } },
      });
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("defers an explicit conflict retry until the authoritative preview has settled", async () => {
    const preview = deferred<{ revisionId: string; format: string; text: string; truncated: boolean }>();
    const current = { ...document, currentRevisionId: "revision-4", currentRevision: { ...document.currentRevision, id: "revision-4", revisionNo: 4, parentRevisionId: "revision-3" } };
    const revision5 = { ...document.currentRevision, id: "revision-5", revisionNo: 5, parentRevisionId: "revision-4" };
    const api = createApi();
    api.reviseProjectDocument
      .mockRejectedValueOnce({ code: "E_CONFLICT", message: "Document head conflict" })
      .mockResolvedValueOnce(revision5);
    api.showProjectDocument.mockResolvedValueOnce(document).mockResolvedValueOnce(current);
    api.loadDocumentPreview
      .mockResolvedValueOnce({ revisionId: "revision-3", format: "markdown", text: "# Old head", truncated: false })
      .mockReturnValueOnce(preview.promise);
    const controller = createController(api);
    await controller.openDocument(document);
    controller.beginDocumentEdit();
    controller.setDocumentDraftBody("# My local draft");
    const conflictedSave = controller.saveDocument();
    await vi.waitFor(() => expect(controller.getSnapshot().documentPreview.status).toBe("loading"));

    await controller.saveDocument();
    expect(api.reviseProjectDocument).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().documentSaving).toBe(true);

    preview.resolve({ revisionId: "revision-4", format: "markdown", text: "# Current head", truncated: false });
    await conflictedSave;
    await controller.saveDocument();

    expect(api.reviseProjectDocument).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot()).toMatchObject({
      selectedDocument: { currentRevisionId: "revision-5" },
      documentPreview: { value: { revisionId: "revision-5", text: "# My local draft" } },
      documentMode: "read",
      documentDraft: null,
      documentDirty: false,
      documentSaving: false,
    });
  });

  test("cancels the old draft before a confirmed ordinary document open settles", async () => {
    const shown = deferred<typeof document>();
    const second = { ...document, id: "document-2", title: "Second document", currentRevisionId: "revision-b", currentRevision: { ...document.currentRevision, id: "revision-b", documentId: "document-2" } };
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [document, second], nextCursor: null });
    api.showProjectDocument
      .mockResolvedValueOnce(document)
      .mockReturnValueOnce(shown.promise);
    const controller = createController(api);
    await controller.selectTab("documents");
    await controller.openDocument(document);
    controller.beginDocumentEdit();
    controller.setDocumentDraftBody("# Discard me");
    const host = createReactHost();
    const confirm = vi.fn(() => true);
    Object.assign(globalThis.window, { confirm });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      await click(textButton(host.container, "Second document"));
      expect(confirm).toHaveBeenCalledOnce();
      expect(controller.getSnapshot()).toMatchObject({ documentMode: "read", documentDraft: null, documentDirty: false, documentSaving: true, documentPreview: { status: "loading", value: null } });
      expect(host.container.querySelector(".document-editor")).toBeNull();
      const edit = textButton(host.container, "Edit");
      expect(edit.disabled).toBe(true);
      await click(edit);
      controller.setDocumentDraftBody("# Recreated during open");
      await controller.saveDocument();
      expect(api.reviseProjectDocument).not.toHaveBeenCalled();
      await act(async () => {
        shown.resolve(second);
        await vi.waitFor(() => expect(controller.getSnapshot().selectedDocument?.id).toBe("document-2"));
      });
    } finally {
      shown.resolve(second);
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("cancels a clean editor before a different ordinary document open settles", async () => {
    const shown = deferred<typeof document>();
    const second = { ...document, id: "document-2", title: "Second document", currentRevisionId: "revision-b", currentRevision: { ...document.currentRevision, id: "revision-b", documentId: "document-2" } };
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [document, second], nextCursor: null });
    api.showProjectDocument
      .mockResolvedValueOnce(document)
      .mockReturnValueOnce(shown.promise);
    const controller = createController(api);
    await controller.selectTab("documents");
    await controller.openDocument(document);
    controller.beginDocumentEdit();
    const host = createReactHost();
    const confirm = vi.fn(() => true);
    Object.assign(globalThis.window, { confirm });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      await click(textButton(host.container, "Second document"));
      expect(confirm).not.toHaveBeenCalled();
      expect(controller.getSnapshot()).toMatchObject({ documentMode: "read", documentDraft: null, documentDirty: false });
      expect(host.container.querySelector(".document-editor")).toBeNull();
      controller.setDocumentDraftBody("# Late edit");
      await controller.saveDocument();
      expect(api.reviseProjectDocument).not.toHaveBeenCalled();
      await act(async () => {
        shown.resolve(second);
        await vi.waitFor(() => expect(controller.getSnapshot().selectedDocument?.id).toBe("document-2"));
      });
    } finally {
      shown.resolve(second);
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("keeps a rejected confirmed search-result open out of the discarded editor", async () => {
    const shown = deferred<typeof document>();
    const secondResult = { ...result, documentId: "document-2", revisionId: "revision-b", documentTitle: "Second result" };
    const api = createApi();
    api.searchProjectDocuments.mockResolvedValue({ items: [secondResult], nextCursor: null });
    api.showProjectDocument
      .mockResolvedValueOnce(document)
      .mockReturnValueOnce(shown.promise);
    const controller = createController(api);
    await controller.selectTab("documents");
    await controller.openDocument(document);
    controller.beginDocumentEdit();
    controller.setDocumentDraftBody("# Discard me");
    await controller.searchDocuments("second");
    const host = createReactHost();
    const confirm = vi.fn(() => true);
    Object.assign(globalThis.window, { confirm });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      await click(textButton(host.container, "Second result"));
      expect(confirm).toHaveBeenCalledOnce();
      expect(controller.getSnapshot()).toMatchObject({ documentMode: "read", documentDraft: null, documentDirty: false, documentSaving: true, documentPreview: { status: "loading", value: null } });
      expect(host.container.querySelector(".document-editor")).toBeNull();
      const edit = textButton(host.container, "Edit");
      expect(edit.disabled).toBe(true);
      await click(edit);
      controller.setDocumentDraftBody("# Recreated during search open");
      await controller.saveDocument();
      expect(api.reviseProjectDocument).not.toHaveBeenCalled();
      await act(async () => {
        shown.reject(new Error("show failed"));
        await vi.waitFor(() => expect(controller.getSnapshot().documentPreview.status).toBe("error"));
      });
      expect(controller.getSnapshot()).toMatchObject({ documentMode: "read", documentDraft: null, documentDirty: false, documentSaving: false });
      expect(host.container.querySelector(".document-editor")).toBeNull();
    } finally {
      shown.reject(new Error("show failed"));
      await act(async () => root.unmount());
      host.restore();
    }
  });
});

describe("documents workbench", () => {
  test("documents workbench renders distinct format badges and safe Markdown, JSON, and text viewers", async () => {
    const formats = (["markdown", "json", "text"] as const).map((format, index) => ({
      ...result, documentId: `document-${index + 1}`, revisionId: `revision-${index + 1}`,
      documentTitle: `${format} document`, format,
    }));
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({
      items: [
        { ...document, id: "listed-md", slug: "brief.MD", title: "Brief", currentRevision: { ...document.currentRevision, format: "markdown" as const } },
        { ...document, id: "listed-json", slug: "settings.JSON", title: "Settings", currentRevision: { ...document.currentRevision, format: "json" as const } },
        { ...document, id: "listed-text", slug: "notes.TXT", title: "Notes", currentRevision: { ...document.currentRevision, format: "text" as const } },
      ],
      nextCursor: null,
    });
    api.searchProjectDocuments.mockResolvedValue({ items: formats, nextCursor: null });
    const controller = createController(api) as any;
    await controller.selectTab("documents");
    const listedBadges = markup(controller);
    expect(listedBadges).toContain("format-markdown");
    expect(listedBadges).toContain("format-json");
    expect(listedBadges).toContain("format-text");
    await controller.searchDocuments("formats");
    const badges = markup(controller);
    expect(badges).toContain("document-format-badge format-markdown");
    expect(badges).toContain(">MD<");
    expect(badges).toContain("document-format-badge format-json");
    expect(badges).toContain(">JSON<");
    expect(badges).toContain("document-format-badge format-text");
    expect(badges).toContain(">TXT<");

    api.showProjectDocument.mockResolvedValue({ ...document, currentRevision: { ...document.currentRevision, format: "markdown" } });
    api.loadDocumentPreview.mockResolvedValue({ revisionId: "revision-3", format: "markdown", text: "# Heading\n\n- item\n\n```ts\nconst x = 1\n```", truncated: false });
    await controller.openDocument(document);
    const markdown = markup(controller);
    expect(markdown).toMatch(/<h1>Heading<\/h1>[\s\S]*<ul>[\s\S]*<code class="language-ts">/);
    expect(markdown).toContain("Revision 3");
    expect(markdown).not.toContain("Parent revision-2");

    api.showProjectDocument.mockResolvedValue({ ...document, currentRevision: { ...document.currentRevision, format: "json" } });
    api.loadDocumentPreview.mockResolvedValue({ revisionId: "revision-3", format: "json", text: '{"key":"</script><img src=x>","count":2,"ready":true,"empty":null}', truncated: false });
    await controller.openDocument(document);
    const json = markup(controller);
    expect(json).toContain("json-token-key");
    expect(json).toContain("json-token-string");
    expect(json).toContain("json-token-number");
    expect(json).toContain("json-token-boolean");
    expect(json).toContain("json-token-null");
    expect(json).toContain("&lt;/script&gt;&lt;img src=x&gt;");
    expect(json).not.toContain("dangerouslySetInnerHTML");

    api.showProjectDocument.mockResolvedValue({ ...document, currentRevision: { ...document.currentRevision, format: "text" } });
    api.loadDocumentPreview.mockResolvedValue({ revisionId: "revision-3", format: "text", text: "Plain text", truncated: false });
    await controller.openDocument(document);
    // The view carries utilities after its class hook now, so the probe reads the hook and the copy.
    expect(markup(controller)).toMatch(/<pre class="plain-text-view[^"]*">Plain text<\/pre>/);
  });

  test("documents workbench owns independent virtual master/detail scroll and preserves selection position", async () => {
    const documents = Array.from({ length: 60 }, (_, index) => ({
      ...document, id: `document-${index}`, title: `Document ${index}`, currentRevisionId: `revision-${index}`,
    }));
    const api = createApi();
    api.loadProjectPage
      .mockResolvedValueOnce({ items: documents, nextCursor: "documents-next" })
      .mockResolvedValueOnce({ items: [{ ...document, id: "document-tail", title: "Tail" }], nextCursor: null });
    api.showProjectDocument.mockImplementation(async (_project, id) => ({
      ...document, id, title: id, currentRevisionId: `revision-${id}`,
      currentRevision: { ...document.currentRevision, id: `revision-${id}`, documentId: id },
    }));
    api.loadDocumentPreview.mockImplementation(async (_project, revisionId) => ({ revisionId, format: "markdown", text: `# ${revisionId}`, truncated: false }));
    const controller = createController(api) as any;
    await controller.selectTab("documents");
    const memory = new Map<string, number>();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} memory={memory} />); await Promise.resolve(); await Promise.resolve(); });
      const outer = host.container.querySelector(".project-domain-body")!;
      const master = host.container.querySelector(".documents-master")!;
      const detail = host.container.querySelector(".documents-detail")!;
      expect(master).not.toBeNull();
      expect(detail).not.toBeNull();
      expect(master).not.toBe(detail);
      expect(master.getAttribute("role")).toBe("region");
      expect(master.getAttribute("aria-label")).toBe("Documents");
      expect(detail.tagName).toBe("SECTION");
      expect(detail.getAttribute("aria-label")).toBe("Document detail");
      expect(host.container.querySelectorAll(".document-row").length).toBeLessThan(documents.length);
      expect(host.intersectionObservers[0]?.root).toBe(master);

      master.scrollTop = 320;
      detail.scrollTop = 90;
      outer.scrollTop = 0;
      await act(async () => { master.dispatchEvent(new Event("scroll")); detail.dispatchEvent(new Event("scroll")); });
      await click(textButton(master, "Document 1"));
      expect(master.scrollTop).toBe(320);
      expect(detail.scrollTop).toBe(90);
      expect(globalThis.document.activeElement).toBe(host.container.querySelector(".document-detail-heading"));
      expect(memory).toMatchObject(new Map([["documents-master", 320], ["documents-detail", 90]]));

      const sentinel = master.querySelector(".auto-cursor-tail")!;
      act(() => host.intersectionObservers[0].deliver(sentinel as unknown as Element, true));
      await vi.waitFor(() => expect(api.loadProjectPage).toHaveBeenLastCalledWith(expect.objectContaining({ tab: "documents", cursor: "documents-next" })));
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("documents workbench debounces trimmed search and confirms one dirty tab discard", async () => {
    const api = createApi();
    api.loadProjectPage.mockImplementation(async ({ tab }: { tab: string }) => ({
      items: tab === "documents" ? [{ ...document }] : [], nextCursor: null,
    }));
    const controller = createController(api) as any;
    await controller.selectTab("documents");
    const host = createReactHost();
    const confirm = vi.fn(() => false);
    Object.assign(globalThis.window, { confirm });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      const search = host.container.querySelector("#document-search")! as HostNode & { value: string };
      search.value = "  c++ -draft NOT  ";
      await act(async () => { search.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 280)); });
      expect(api.searchProjectDocuments).toHaveBeenCalledOnce();
      expect(api.searchProjectDocuments).toHaveBeenCalledWith(
        { workspaceId: "workspace-1", projectId: "project-1" }, "c++ -draft NOT",
      );

      await click(textButton(host.container, "Units"));
      await click(textButton(host.container, "Documents"));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 280)); });
      expect(api.searchProjectDocuments).toHaveBeenCalledOnce();

      const restoredSearch = host.container.querySelector("#document-search")! as HostNode & { value: string };
      restoredSearch.value = "   ";
      await act(async () => { restoredSearch.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 280)); });
      expect(api.searchProjectDocuments).toHaveBeenCalledOnce();

      await act(async () => { await controller.openDocument(document); controller.beginDocumentEdit(); controller.setDocumentDraftBody("# Dirty"); });
      await click(textButton(host.container, "Media"));
      expect(confirm).toHaveBeenCalledOnce();
      expect(controller.getSnapshot().activeTab).toBe("documents");
      confirm.mockReturnValue(true);
      await click(textButton(host.container, "Media"));
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(controller.getSnapshot()).toMatchObject({ activeTab: "media", documentMode: "read", documentDraft: null });
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("documents workbench retains a dirty draft when the selected row reloads", async () => {
    const api = createApi();
    const controller = createController(api) as any;
    await controller.selectTab("documents");
    await controller.openDocument(document);
    controller.beginDocumentEdit();
    controller.setDocumentDraftBody("# Unsaved");
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      await click(textButton(host.container, "Launch brief"));
      expect(controller.getSnapshot()).toMatchObject({
        documentMode: "edit",
        documentDirty: true,
        documentDraft: { body: "# Unsaved" },
      });
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("documents workbench Retry preserves the conflict draft after preview reload fails", async () => {
    const current = { ...document, currentRevisionId: "revision-4", currentRevision: { ...document.currentRevision, id: "revision-4", revisionNo: 4, parentRevisionId: "revision-3" } };
    const api = createApi();
    api.reviseProjectDocument.mockRejectedValueOnce({ code: "E_CONFLICT", message: "Document head conflict" });
    api.showProjectDocument
      .mockResolvedValueOnce(document)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current);
    api.loadDocumentPreview
      .mockResolvedValueOnce({ revisionId: "revision-3", format: "markdown", text: "# Old head", truncated: false })
      .mockRejectedValueOnce(new Error("Current preview unavailable"))
      .mockResolvedValueOnce({ revisionId: "revision-4", format: "markdown", text: "# Current head", truncated: false });
    const controller = createController(api) as any;
    await controller.selectTab("documents");
    await controller.openDocument(document);
    controller.beginDocumentEdit();
    controller.setDocumentDraftBody("# My local draft");
    await controller.saveDocument();
    expect(controller.getSnapshot().documentPreview.status).toBe("error");
    expect(markup(controller)).not.toContain("Review current");

    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      await click(textButton(host.container, "Retry"));
      expect(controller.getSnapshot()).toMatchObject({
        documentMode: "edit",
        documentDirty: true,
        documentDraft: { body: "# My local draft" },
        documentPreview: { status: "ready", value: { text: "# Current head" } },
        documentConflict: expect.stringContaining("local draft was kept"),
        documentConflictReview: true,
      });
      expect(host.container.textContent).toContain("Review current");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("documents workbench reviews the authoritative conflict head without replacing the local draft", async () => {
    const current = { ...document, currentRevisionId: "revision-4", currentRevision: { ...document.currentRevision, id: "revision-4", revisionNo: 4, parentRevisionId: "revision-3" } };
    const api = createApi();
    api.reviseProjectDocument.mockRejectedValueOnce({ code: "E_CONFLICT", message: "Document head conflict" });
    api.showProjectDocument.mockResolvedValueOnce(document).mockResolvedValueOnce(current);
    api.loadDocumentPreview
      .mockResolvedValueOnce({ revisionId: "revision-3", format: "markdown", text: "# Old head", truncated: false })
      .mockResolvedValueOnce({ revisionId: "revision-4", format: "markdown", text: "# Current head", truncated: false });
    const controller = createController(api) as any;
    await controller.selectTab("documents");
    await controller.openDocument(document);
    controller.beginDocumentEdit();
    controller.setDocumentDraftBody("# My local draft");
    await controller.saveDocument();

    const host = createReactHost();
    const confirm = vi.fn(() => false);
    Object.assign(globalThis.window, { confirm });
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      await click(textButton(host.container, "Review current"));
      expect(host.container.querySelector(".markdown-view h1")?.textContent).toBe("Current head");
      expect(controller.getSnapshot().documentDraft?.body).toBe("# My local draft");
      await click(textButton(host.container, "Back to edit"));
      expect(host.container.querySelector(".document-editor")).not.toBeNull();
      expect(controller.getSnapshot().documentDraft?.body).toBe("# My local draft");
      await act(async () => { controller.setDocumentDraftBody("# Old head"); });
      expect(controller.getSnapshot().documentDirty).toBe(true);
      await click(textButton(host.container, "Media"));
      expect(confirm).toHaveBeenCalledOnce();
      expect(controller.getSnapshot().activeTab).toBe("documents");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
