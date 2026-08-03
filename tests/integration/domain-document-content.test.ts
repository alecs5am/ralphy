import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  addArtifactRevision,
  createArtifact,
} from "../../cli/lib/store/artifacts.js";
import {
  completeBuild,
  createComposition,
  putCompositionSource,
  reviseComposition,
  sealCompositionRevision,
  startBuild,
} from "../../cli/lib/store/compositions.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  getDocumentContent,
  getProjectDocumentBinding,
  replaceBuildDocumentBinding,
  replaceProjectDocumentBinding,
} from "../../cli/lib/store/document-content.js";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { startRun } from "../../cli/lib/store/runs.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { startAgentSession } from "../../cli/lib/store/sessions.js";
import { StoreConflictError } from "../../cli/lib/store/types.js";
import { verifyDomainStore } from "../../cli/lib/store/verify.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let roots: TmpRoot[] = [];

function makeRoot(): TmpRoot {
  const root = makeTmpRoot("ralphy-domain-document-content");
  roots.push(root);
  return root;
}

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

function fixture(body: string) {
  const workspace = createWorkspace({ slug: "docs", name: "Docs" });
  const project = createProject({
    workspaceId: workspace.id,
    slug: "docs",
    name: "Docs",
  });
  const document = createDocument({
    projectId: project.id,
    kind: "brief",
    slug: "brief",
    title: "Brief",
  });
  const revision = reviseDocument({
    documentId: document.id,
    expectedHeadId: null,
    format: "text",
    body,
  });
  return { workspace, project, document, revision };
}

function drain(
  context: { workspaceId: string; projectId: string },
  revisionId: string,
  limitBytes: number,
): { text: string; pages: number } {
  let text = "";
  let afterByte = 0;
  let pages = 0;
  for (;;) {
    const page = getDocumentContent({ context, revisionId, afterByte, limitBytes });
    text += page.text;
    pages += 1;
    if (page.nextByte === null) break;
    expect(page.nextByte).toBeGreaterThan(afterByte);
    afterByte = page.nextByte;
  }
  return { text, pages };
}

describe("bounded document content", () => {
  test("returns only the safe page shape", () => {
    makeRoot();
    const { workspace, project, revision } = fixture("hello world");
    const page = getDocumentContent({
      context: { workspaceId: workspace.id, projectId: project.id },
      revisionId: revision.id,
      afterByte: 0,
      limitBytes: 5,
    });
    expect(Object.keys(page).sort()).toEqual([
      "format",
      "nextByte",
      "revisionId",
      "text",
    ]);
    expect(page).toEqual({
      revisionId: revision.id,
      format: "text",
      text: "hello",
      nextByte: 5,
    });
  });

  test("reassembles multi-byte text at every limit including one byte", () => {
    makeRoot();
    // Two, three, and four-byte code points plus ASCII.
    const body = "aé中𝄞b";
    const { workspace, project, revision } = fixture(body);
    const context = { workspaceId: workspace.id, projectId: project.id };
    for (const limitBytes of [1, 2, 3, 4, 5, 7, 11, 64]) {
      const drained = drain(context, revision.id, limitBytes);
      expect(drained.text).toBe(body);
      expect(drained.pages).toBeGreaterThan(0);
    }
    // A one-byte limit never stalls and never exceeds limit + 3 bytes.
    const first = getDocumentContent({
      context,
      revisionId: revision.id,
      afterByte: 1,
      limitBytes: 1,
    });
    expect(first.text).toBe("é");
    expect(Buffer.byteLength(first.text, "utf8")).toBeLessThanOrEqual(1 + 3);
  });

  test("treats afterByte at the end as an empty terminal page", () => {
    makeRoot();
    const body = "hello";
    const { workspace, project, revision } = fixture(body);
    const context = { workspaceId: workspace.id, projectId: project.id };
    expect(
      getDocumentContent({
        context,
        revisionId: revision.id,
        afterByte: Buffer.byteLength(body),
        limitBytes: 10,
      }),
    ).toEqual({
      revisionId: revision.id,
      format: "text",
      text: "",
      nextByte: null,
    });
  });

  test("rejects a continuation-byte start, EOF overrun, and bad bounds", () => {
    makeRoot();
    const { workspace, project, revision } = fixture("é中");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const call = (afterByte: number, limitBytes: number) =>
      getDocumentContent({ context, revisionId: revision.id, afterByte, limitBytes });
    // Byte 1 is the continuation byte of "é".
    expect(() => call(1, 4)).toThrow(/splits a UTF-8 code point/i);
    expect(() => call(3, 4)).toThrow(/splits a UTF-8 code point/i);
    expect(() => call(99, 4)).toThrow(/beyond the end/i);
    expect(() => call(-1, 4)).toThrow(/afterByte/i);
    expect(() => call(1.5, 4)).toThrow(/afterByte/i);
    expect(() => call(0, 0)).toThrow(/limitBytes/i);
    expect(() => call(0, 65_537)).toThrow(/limitBytes/i);
    expect(() => call(0, 2.5)).toThrow(/limitBytes/i);
    expect(() => call(0, 65_536)).not.toThrow();
  });

  test("authorizes the exact revision against Workspace, Project, and Session context", () => {
    makeRoot();
    const { workspace, project, revision } = fixture("secret body");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outside = createWorkspace({ slug: "outside", name: "Outside" });
    const args = { revisionId: revision.id, afterByte: 0, limitBytes: 10 };
    expect(() =>
      getDocumentContent({ context: { workspaceId: outside.id }, ...args }),
    ).toThrow(/not found/i);
    expect(() =>
      getDocumentContent({
        context: { workspaceId: workspace.id, projectId: sibling.id },
        ...args,
      }),
    ).toThrow(/not found/i);
    expect(() =>
      getDocumentContent({ context: { workspaceId: workspace.id }, ...args }),
    ).toThrow(/not found/i);
    const session = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "agent",
    });
    expect(
      getDocumentContent({ context: { sessionId: session.id }, ...args }).text,
    ).toBe("secret bod");
    expect(() =>
      getDocumentContent({
        context: { workspaceId: workspace.id, projectId: project.id },
        revisionId: "drev_missing",
        afterByte: 0,
        limitBytes: 10,
      }),
    ).toThrow(/not found/i);
  });
});

describe("optimistic document bindings", () => {
  test("creates an empty role, replaces exactly, and reports a newer head", () => {
    makeRoot();
    const { workspace, project, document, revision } = fixture("one");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const created = replaceProjectDocumentBinding({
      projectId: project.id,
      role: "brief",
      revisionId: revision.id,
      expectedRevisionId: null,
    });
    expect(created).toEqual({
      ownerType: "project",
      ownerId: project.id,
      role: "brief",
      documentId: document.id,
      boundRevisionId: revision.id,
      currentHeadRevisionId: revision.id,
      hasNewerHead: false,
    });

    const second = reviseDocument({
      documentId: document.id,
      expectedHeadId: revision.id,
      format: "text",
      body: "two",
    });
    // A newer head never rewrites the binding implicitly.
    expect(getProjectDocumentBinding(context, { projectId: project.id, role: "brief" })).toEqual({
      ...created,
      currentHeadRevisionId: second.id,
      hasNewerHead: true,
    });

    expect(() =>
      replaceProjectDocumentBinding({
        projectId: project.id,
        role: "brief",
        revisionId: second.id,
        expectedRevisionId: null,
      }),
    ).toThrow(StoreConflictError);
    expect(() =>
      replaceProjectDocumentBinding({
        projectId: project.id,
        role: "brief",
        revisionId: second.id,
        expectedRevisionId: "drev_stale",
      }),
    ).toThrow(StoreConflictError);

    const replaced = replaceProjectDocumentBinding({
      projectId: project.id,
      role: "brief",
      revisionId: second.id,
      expectedRevisionId: revision.id,
    });
    expect(replaced).toMatchObject({
      boundRevisionId: second.id,
      currentHeadRevisionId: second.id,
      hasNewerHead: false,
    });
    expect(verifyDomainStore().brokenRevisionChains).toEqual([]);
  });

  test("rebinds an active Build and refuses a terminal one", async () => {
    const root = makeRoot();
    const { workspace, project, document, revision } = fixture("one");
    const filePath = path.join(root.dir, "video.mp4");
    fs.writeFileSync(filePath, "video");
    const object = await ingestObject({
      scope: { workspaceId: workspace.id, projectId: project.id },
      sourcePath: filePath,
      originalName: "video.mp4",
      mime: "video/mp4",
      storageClass: "durable",
    });
    const artifact = createArtifact({
      projectId: project.id,
      slug: "cut",
      kind: "video",
    });
    const artifactRevision = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      state: "approved",
    });
    const composition = createComposition({
      projectId: project.id,
      slug: "cut",
      kind: "video",
    });
    const compositionRevision = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "remotion",
    });
    putCompositionSource({
      revisionId: compositionRevision.id,
      logicalPath: "video.mp4",
      objectId: object.id,
    });
    sealCompositionRevision({ revisionId: compositionRevision.id });
    const run = startRun({ projectId: project.id, kind: "build" });
    const build = startBuild({
      compositionRevisionId: compositionRevision.id,
      runId: run.id,
      profile: {},
    });
    const second = reviseDocument({
      documentId: document.id,
      expectedHeadId: revision.id,
      format: "text",
      body: "two",
    });

    const bound = replaceBuildDocumentBinding({
      buildId: build.id,
      role: "brief",
      revisionId: revision.id,
      expectedRevisionId: null,
    });
    expect(bound).toMatchObject({
      ownerType: "build",
      ownerId: build.id,
      documentId: document.id,
      boundRevisionId: revision.id,
      hasNewerHead: true,
    });
    const rebound = replaceBuildDocumentBinding({
      buildId: build.id,
      role: "brief",
      revisionId: second.id,
      expectedRevisionId: revision.id,
    });
    expect(rebound.boundRevisionId).toBe(second.id);

    completeBuild({
      buildId: build.id,
      outputs: [
        { artifactRevisionId: artifactRevision.id, role: "final", position: 0 },
      ],
    });
    // A terminal Build freezes its bound Documents.
    expect(() =>
      replaceBuildDocumentBinding({
        buildId: build.id,
        role: "brief",
        revisionId: revision.id,
        expectedRevisionId: second.id,
      }),
    ).toThrow(/immutable/i);
    expect(verifyDomainStore().brokenBuildChains).toEqual([]);
  });

  test("rejects a missing owner and an empty role", () => {
    makeRoot();
    const { project, revision } = fixture("one");
    expect(() =>
      replaceProjectDocumentBinding({
        projectId: project.id,
        role: "   ",
        revisionId: revision.id,
        expectedRevisionId: null,
      }),
    ).toThrow(/role/i);
    expect(() =>
      replaceBuildDocumentBinding({
        buildId: "build_missing",
        role: "brief",
        revisionId: revision.id,
        expectedRevisionId: null,
      }),
    ).toThrow();
    expect(
      openDomainDb()
        .query<{ total: number }, []>(
          "SELECT COUNT(*) AS total FROM build_document_bindings",
        )
        .get()!.total,
    ).toBe(0);
  });
});
