import { renderToStaticMarkup } from "react-dom/server";
import { act, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import type { DocumentSearchDto } from "../electron/ralphy/types";
import type { ProjectSummary } from "../src/lib/ipc";
import * as screen from "../src/screens/ProjectScreen";
import { createReactHost } from "./react-host";

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

function findElement(node: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) return match;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (predicate(node)) return node;
  return findElement((node.props as { children?: ReactNode }).children, predicate);
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
    expect(markup(controller)).toContain("Revision 3 · Parent revision-2");
    expect(markup(controller)).toContain("<h1>Launch brief</h1>");
  });

  test("renders Markdown and pretty JSON/text, keeps an ordinary draft textarea, and revises with the selected head", async () => {
    const api = createApi();
    api.showProjectDocument.mockResolvedValue({ ...document, currentRevision: { ...document.currentRevision, format: "json" } });
    api.loadDocumentPreview.mockResolvedValue({ revisionId: "revision-3", format: "json", text: '{"stage":"draft","count":2}', truncated: false });
    api.reviseProjectDocument.mockResolvedValue({ ...document.currentRevision, id: "revision-4", revisionNo: 4, parentRevisionId: "revision-3", format: "json" });
    const controller = createController(api);

    await controller.selectTab("documents");
    await controller.openDocument(document);
    controller.setDocumentDraft('{"stage":"ready","count":2}');
    await controller.saveDocument();

    expect(api.reviseProjectDocument).toHaveBeenCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, {
      documentId: "document-1", expectedHeadId: "revision-3", format: "json", title: "Launch brief v3", body: { stage: "ready", count: 2 },
    });
    const output = markup(controller);
    expect(output).toContain("&quot;stage&quot;: &quot;ready&quot;");
    expect(output).toContain("textarea");
  });

  test("renders the active search, editor, and save action with established controls", async () => {
    const controller = createController(createApi());
    await controller.selectTab("documents");
    await controller.openDocument(document);
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
      expect(host.container.querySelector(".project-heading h2")?.textContent).toContain("Launch");
      const commands = host.container.findAll((node) => node.matches(".command-button"));
      expect(commands.map((node) => node.textContent)).toEqual(expect.arrayContaining(["Search", "Save revision"]));
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
    controller.setDocumentDraft("# My local draft");
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
    expect(markup(controller)).toContain("textarea");
    controller.setDocumentDraft("# First revision");
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

    expect(controller.getSnapshot().documentSearch).toMatchObject({ query: "new", status: "ready", results: [newResult] });
  });

  test("retries a failed Document search with the same query instead of reloading the page", async () => {
    const api = createApi();
    api.searchProjectDocuments
      .mockRejectedValueOnce(new Error("Search unavailable"))
      .mockResolvedValueOnce({ items: [result], nextCursor: null });
    const controller = createController(api);
    await controller.selectTab("documents");
    await controller.searchDocuments("launch hook");

    const tree = screen.ProjectScreenView({ project, controller, snapshot: controller.getSnapshot() });
    const searchError = findElement(tree, (element) => (
      (element.props as { error?: unknown }).error === "Search unavailable"
    ));
    expect(searchError).not.toBeNull();
    (searchError!.props as { onRetry(): void }).onRetry();
    await vi.waitFor(() => expect(api.searchProjectDocuments).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(controller.getSnapshot().documentSearch.status).toBe("ready"));

    expect(api.searchProjectDocuments).toHaveBeenNthCalledWith(2, { workspaceId: "workspace-1", projectId: "project-1" }, "launch hook");
    expect(api.loadProjectPage).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().documentSearch).toMatchObject({ query: "launch hook", status: "ready", results: [result] });
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
    controller.setDocumentDraft("# Saved A");
    const savingA = controller.saveDocument();
    await controller.openDocument(documentB);
    savedA.resolve({ ...document.currentRevision, id: "revision-4", revisionNo: 4, parentRevisionId: "revision-3" });
    await savingA;

    expect(controller.getSnapshot().selectedDocument?.id).toBe("document-2");
    expect(controller.getSnapshot().documentPreview.value?.text).toBe("# B");
  });
});
