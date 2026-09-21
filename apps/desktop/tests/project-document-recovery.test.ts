import { expect, test, vi } from "vitest";
import { createProjectScreenController, type ProjectScreenApi } from "@/pages/project/model/screen-controller";

function fixture() {
  const project = { workspaceId: "workspace", projectId: "project" };
  const document = { id: "document", ...project, kind: "brief", slug: "brief", title: "Brief", currentRevisionId: "revision-1", rowVersion: 1, createdAt: 1, updatedAt: 1, currentRevision: { id: "revision-1", documentId: "document", revisionNo: 1, parentRevisionId: null, iterationId: null, format: "markdown", title: null, authoredBySessionId: null, createdAt: 1 } };
  const api = {
    showProjectDocument: vi.fn(async () => document),
    loadDocumentPreview: vi.fn(async () => ({ revisionId: "revision-1", format: "markdown", text: "Saved content", truncated: false })),
    reviseProjectDocument: vi.fn(async () => ({ ...document.currentRevision, id: "revision-2" })),
  };
  const open = (rootEpoch = 1, workspaceId = project.workspaceId) => createProjectScreenController(api as unknown as ProjectScreenApi, { ...project, workspaceId }, 0, rootEpoch);
  return { api, open };
}

test("project document drafts survive route disposal with their original save revision and stay scoped", async () => {
  const { api, open } = fixture();
  const before = open();
  await before.openDocumentById("document");
  before.beginDocumentEdit();
  before.setDocumentDraftBody("Unsaved content");
  before.dispose();
  const otherWorkspace = open(1, "other"), otherRoot = open(2);
  expect(otherWorkspace.getSnapshot().documentDraft).toBeNull();
  expect(otherRoot.getSnapshot().documentDraft).toBeNull();
  otherWorkspace.dispose(); otherRoot.dispose();
  const returned = open();
  expect(returned.getSnapshot()).toMatchObject({ activeTab: "documents", documentDirty: true, documentMode: "edit", documentDraft: { body: "Unsaved content" } });
  await returned.saveDocument();
  expect(api.reviseProjectDocument).toHaveBeenCalledWith({ workspaceId: "workspace", projectId: "project" }, expect.objectContaining({ expectedHeadId: "revision-1", body: "Unsaved content" }));
  returned.dispose();
  const saved = open();
  expect(saved.getSnapshot().documentDraft).toBeNull();
  saved.dispose();
});

test("discarded project documents are not recovered", async () => {
  const { open } = fixture();
  const before = open(3);
  await before.openDocumentById("document");
  before.beginDocumentEdit(); before.setDocumentDraftBody("Discard me"); before.dispose();
  const returned = open(3);
  returned.cancelDocumentEdit(); returned.dispose();
  const discarded = open(3);
  expect(discarded.getSnapshot().documentDraft).toBeNull();
  discarded.dispose();
});

test("a save finishing after navigation clears the retained document draft", async () => {
  const { api, open } = fixture();
  let finish!: (value: Awaited<ReturnType<typeof api.reviseProjectDocument>>) => void;
  const revision = await api.reviseProjectDocument();
  api.reviseProjectDocument.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const before = open(4);
  await before.openDocumentById("document");
  before.beginDocumentEdit(); before.setDocumentDraftBody("Save me");
  const saving = before.saveDocument();
  before.dispose();
  finish(revision); await saving;
  const returned = open(4);
  expect(returned.getSnapshot().documentDraft).toBeNull();
  returned.dispose();
});
