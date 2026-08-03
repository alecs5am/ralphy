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
  selectCompositionRevision,
  startBuild,
} from "../../cli/lib/store/compositions.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  getBuildDocumentBinding,
  getDocumentContent,
  getProjectDocumentBinding,
  listBuildDocumentBindings,
  listProjectDocumentBindings,
  replaceBuildDocumentBinding,
  replaceProjectDocumentBinding,
} from "../../cli/lib/store/document-content.js";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { encodeCursor } from "../../cli/lib/store/pagination.js";
import { startRun } from "../../cli/lib/store/runs.js";
import {
  createProject,
  createWorkspace,
} from "../../cli/lib/store/scopes.js";
import { transferProjectMetadata } from "../../cli/lib/store/internal-scope-mutations.js";
import { endAgentSession, startAgentSession } from "../../cli/lib/store/sessions.js";
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

async function createRunningBuild(
  root: TmpRoot,
  workspaceId: string,
  projectId: string,
  suffix: string,
): Promise<string> {
  const sourcePath = path.join(root.dir, `${suffix}.html`);
  fs.writeFileSync(sourcePath, "<main>source</main>");
  const source = await ingestObject({
    scope: { workspaceId, projectId },
    sourcePath,
    originalName: `${suffix}.html`,
    mime: "text/html",
    storageClass: "durable",
  });
  const composition = createComposition({
    projectId,
    slug: `binding-${suffix}`,
    kind: "video",
  });
  const revision = reviseComposition({
    compositionId: composition.id,
    expectedLatestRevisionId: null,
    engine: "remotion",
  });
  putCompositionSource({
    revisionId: revision.id,
    logicalPath: `${suffix}.html`,
    objectId: source.id,
  });
  sealCompositionRevision({ revisionId: revision.id });
  const run = startRun({ projectId, kind: "build" });
  return startBuild({
    compositionRevisionId: revision.id,
    runId: run.id,
    profile: {},
  }).id;
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
      context,
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
    expect(
      listProjectDocumentBindings(context, {
        projectId: project.id,
        limit: 10,
      }).items,
    ).toEqual([created]);

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
        context,
        projectId: project.id,
        role: "brief",
        revisionId: second.id,
        expectedRevisionId: null,
      }),
    ).toThrow(StoreConflictError);
    expect(() =>
      replaceProjectDocumentBinding({
        context,
        projectId: project.id,
        role: "brief",
        revisionId: second.id,
        expectedRevisionId: "drev_stale",
      }),
    ).toThrow(StoreConflictError);

    const replaced = replaceProjectDocumentBinding({
      context,
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
    const context = { workspaceId: workspace.id, projectId: project.id };
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
      context,
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
      context,
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
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");
    const activityBefore = db
      .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM activity_events")
      .get()!.total;
    expect(() =>
      db
        .prepare(
          "UPDATE build_document_bindings SET document_revision_id = ? WHERE build_id = ? AND role = 'brief'",
        )
        .run(revision.id, build.id),
    ).toThrow(/immutable/i);
    expect(
      db
        .query<{ revisionId: string }, [string]>(
          "SELECT document_revision_id AS revisionId FROM build_document_bindings WHERE build_id = ? AND role = 'brief'",
        )
        .get(build.id)?.revisionId,
    ).toBe(second.id);
    expect(
      db.query<{ total: number }, []>("SELECT COUNT(*) AS total FROM activity_events").get()!.total,
    ).toBe(activityBefore);
    // A terminal Build freezes its bound Documents.
    expect(() =>
      replaceBuildDocumentBinding({
        context,
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
    const { workspace, project, revision } = fixture("one");
    const context = { workspaceId: workspace.id, projectId: project.id };
    expect(() =>
      replaceProjectDocumentBinding({
        context,
        projectId: project.id,
        role: "   ",
        revisionId: revision.id,
        expectedRevisionId: null,
      }),
    ).toThrow(/role/i);
    expect(() =>
      replaceBuildDocumentBinding({
        context,
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

  test("authorizes Workspace, exact Project, and active Session contexts", () => {
    makeRoot();
    const { workspace, project, revision } = fixture("one");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outsideWorkspace = createWorkspace({ slug: "outside", name: "Outside" });
    const outsideProject = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "outside",
      name: "Outside",
    });
    const broadContext = { workspaceId: workspace.id } as const;
    const exactContext = { workspaceId: workspace.id, projectId: project.id } as const;

    replaceProjectDocumentBinding({
      context: broadContext,
      projectId: project.id,
      role: "workspace",
      revisionId: revision.id,
      expectedRevisionId: null,
    });
    const exactSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "exact",
    });
    expect(() =>
      replaceProjectDocumentBinding({
        context: { sessionId: exactSession.id },
        projectId: project.id,
        role: "session",
        revisionId: revision.id,
        expectedRevisionId: null,
      }),
    ).not.toThrow();

    const siblingSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: sibling.id,
      agent: "sibling",
    });
    expect(() =>
      replaceProjectDocumentBinding({
        context: { sessionId: siblingSession.id },
        projectId: project.id,
        role: "sibling",
        revisionId: revision.id,
        expectedRevisionId: null,
      }),
    ).toThrow(/not found/i);
    expect(
      getProjectDocumentBinding(
        { workspaceId: workspace.id, projectId: sibling.id },
        { projectId: project.id, role: "workspace" },
      ),
    ).toBeNull();
    expect(() =>
      listProjectDocumentBindings(
        { workspaceId: workspace.id, projectId: sibling.id },
        { projectId: project.id, limit: 10 },
      ),
    ).toThrow(/not found/i);

    endAgentSession(exactSession.id);
    expect(() =>
      replaceProjectDocumentBinding({
        context: { sessionId: exactSession.id },
        projectId: project.id,
        role: "ended",
        revisionId: revision.id,
        expectedRevisionId: null,
      }),
    ).toThrow(/ended/i);
    expect(() =>
      replaceProjectDocumentBinding({
        context: { workspaceId: outsideWorkspace.id, projectId: outsideProject.id },
        projectId: project.id,
        role: "foreign",
        revisionId: revision.id,
        expectedRevisionId: null,
      }),
    ).toThrow(/not found/i);
    expect(
      getProjectDocumentBinding(
        { workspaceId: outsideWorkspace.id },
        { projectId: project.id, role: "workspace" },
      ),
    ).toBeNull();
    expect(
      getProjectDocumentBinding(exactContext, {
        projectId: project.id,
        role: "workspace",
      })?.ownerId,
    ).toBe(project.id);
  });

  test("guards Project binding scope and identity with recursive triggers disabled", () => {
    makeRoot();
    const { workspace, project, document, revision } = fixture("one");
    const context = { workspaceId: workspace.id, projectId: project.id } as const;
    const second = reviseDocument({
      documentId: document.id,
      expectedHeadId: revision.id,
      format: "text",
      body: "two",
    });
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling-guard",
      name: "Sibling",
    });
    const siblingDocument = createDocument({
      projectId: sibling.id,
      kind: "note",
      slug: "sibling-note",
      title: "Sibling note",
    });
    const siblingRevision = reviseDocument({
      documentId: siblingDocument.id,
      format: "text",
      body: "sibling",
    });
    const outsideWorkspace = createWorkspace({ slug: "foreign-guard", name: "Foreign" });
    const outsideProject = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "foreign-guard",
      name: "Foreign",
    });
    const outsideDocument = createDocument({
      projectId: outsideProject.id,
      kind: "note",
      slug: "outside-note",
      title: "Outside note",
    });
    const outsideRevision = reviseDocument({
      documentId: outsideDocument.id,
      format: "text",
      body: "outside",
    });
    const bound = replaceProjectDocumentBinding({
      context,
      projectId: project.id,
      role: "brief",
      revisionId: revision.id,
      expectedRevisionId: null,
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");
    const row = db
      .query<
        {
          id: string;
          project_id: string;
          document_revision_id: string;
          role: string;
          created_at: number;
        },
        [string, string]
      >(
        `SELECT id, project_id, document_revision_id, role, created_at
         FROM project_document_bindings WHERE project_id = ? AND role = ?`,
      )
      .get(project.id, "brief")!;
    const reject = (sql: string, values: (string | number)[] = []) =>
      expect(() => db.prepare(sql).run(...values)).toThrow(/scope|immutable|identity/i);

    reject(
      `INSERT INTO project_document_bindings
       (id, project_id, document_revision_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      ["bind_sibling", project.id, siblingRevision.id, "sibling", 1],
    );
    reject(
      `INSERT INTO project_document_bindings
       (id, project_id, document_revision_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      ["bind_foreign", project.id, outsideRevision.id, "foreign", 1],
    );
    reject(
      `INSERT OR REPLACE INTO project_document_bindings
       (id, project_id, document_revision_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [row.id, project.id, second.id, "changed", 2],
    );
    reject(
      `INSERT OR REPLACE INTO project_document_bindings
       (id, project_id, document_revision_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      ["bind_replacement", project.id, second.id, row.role, 2],
    );
    reject("UPDATE project_document_bindings SET id = ? WHERE id = ?", ["changed", row.id]);
    reject("UPDATE project_document_bindings SET project_id = ? WHERE id = ?", [sibling.id, row.id]);
    reject("UPDATE project_document_bindings SET role = ? WHERE id = ?", ["changed", row.id]);
    reject("UPDATE project_document_bindings SET created_at = ? WHERE id = ?", [2, row.id]);
    reject("UPDATE project_document_bindings SET document_revision_id = ? WHERE id = ?", [siblingRevision.id, row.id]);
    reject("DELETE FROM project_document_bindings WHERE id = ?", [row.id]);
    expect(
      db
        .query(
          `SELECT id, project_id, document_revision_id, role, created_at
           FROM project_document_bindings WHERE id = ?`,
        )
        .get(row.id),
    ).toEqual(row);

    const activityBefore = db
      .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM activity_events")
      .get()!.total;
    expect(() =>
      replaceProjectDocumentBinding({
        context,
        projectId: project.id,
        role: "brief",
        revisionId: second.id,
        expectedRevisionId: "drev_stale",
      }),
    ).toThrow(StoreConflictError);
    expect(
      db
        .query<{ revisionId: string }, [string]>(
          "SELECT document_revision_id AS revisionId FROM project_document_bindings WHERE id = ?",
        )
        .get(row.id)?.revisionId,
    ).toBe(bound.boundRevisionId);
    expect(
      db.query<{ total: number }, []>("SELECT COUNT(*) AS total FROM activity_events").get()!.total,
    ).toBe(activityBefore);
    expect(
      replaceProjectDocumentBinding({
        context,
        projectId: project.id,
        role: "brief",
        revisionId: second.id,
        expectedRevisionId: revision.id,
      }).boundRevisionId,
    ).toBe(second.id);
  });

  test("rejects parent scope changes that would poison immutable bindings", async () => {
    const root = makeRoot();
    const { workspace, project, document, revision } = fixture("project");
    const projectContext = { workspaceId: workspace.id, projectId: project.id } as const;
    replaceProjectDocumentBinding({
      context: projectContext,
      projectId: project.id,
      role: "brief",
      revisionId: revision.id,
      expectedRevisionId: null,
    });

    const buildProject = createProject({
      workspaceId: workspace.id,
      slug: "build-parent",
      name: "Build parent",
    });
    const buildDocument = createDocument({
      projectId: buildProject.id,
      kind: "brief",
      slug: "build-brief",
      title: "Build brief",
    });
    const buildRevision = reviseDocument({
      documentId: buildDocument.id,
      format: "text",
      body: "build",
    });
    const buildId = await createRunningBuild(
      root,
      workspace.id,
      buildProject.id,
      "parent-scope",
    );
    const buildContext = {
      workspaceId: workspace.id,
      projectId: buildProject.id,
    } as const;
    replaceBuildDocumentBinding({
      context: buildContext,
      buildId,
      role: "brief",
      revisionId: buildRevision.id,
      expectedRevisionId: null,
    });

    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "parent-sibling",
      name: "Sibling",
    });
    const destination = createWorkspace({
      slug: "parent-destination",
      name: "Destination",
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");
    const activityBefore = db
      .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM activity_events")
      .get()!.total;
    const reject = (sql: string, values: string[]) =>
      expect(() => db.prepare(sql).run(...values)).toThrow(/binding|scope|provenance/i);

    reject("UPDATE projects SET workspace_id = ? WHERE id = ?", [destination.id, project.id]);
    reject("UPDATE projects SET workspace_id = ? WHERE id = ?", [destination.id, buildProject.id]);
    expect(() =>
      transferProjectMetadata(
        project.id,
        { workspaceId: destination.id, slug: "transferred" },
        project.rowVersion,
      ),
    ).toThrow(/binding|scope|provenance/i);
    reject("UPDATE documents SET workspace_id = ? WHERE id = ?", [destination.id, document.id]);
    reject("UPDATE documents SET project_id = ? WHERE id = ?", [sibling.id, document.id]);
    reject("UPDATE documents SET workspace_id = ? WHERE id = ?", [destination.id, buildDocument.id]);

    expect(() =>
      db.prepare("UPDATE documents SET title = ? WHERE id = ?").run("Updated", document.id),
    ).not.toThrow();
    const next = reviseDocument({
      documentId: document.id,
      expectedHeadId: revision.id,
      format: "text",
      body: "updated",
    });
    expect(
      db.query<{ workspaceId: string }, [string]>(
        "SELECT workspace_id AS workspaceId FROM projects WHERE id = ?",
      ).get(project.id)?.workspaceId,
    ).toBe(workspace.id);
    expect(
      db.query<{ workspaceId: string }, [string]>(
        "SELECT workspace_id AS workspaceId FROM projects WHERE id = ?",
      ).get(buildProject.id)?.workspaceId,
    ).toBe(workspace.id);
    expect(
      db.query<{ workspaceId: string; projectId: string }, [string]>(
        "SELECT workspace_id AS workspaceId, project_id AS projectId FROM documents WHERE id = ?",
      ).get(document.id),
    ).toEqual({ workspaceId: workspace.id, projectId: project.id });
    expect(getProjectDocumentBinding(projectContext, { projectId: project.id, role: "brief" })).toMatchObject({
      currentHeadRevisionId: next.id,
      hasNewerHead: true,
    });
    expect(listProjectDocumentBindings(projectContext, { projectId: project.id, limit: 10 }).items).toHaveLength(1);
    expect(getBuildDocumentBinding(buildContext, { buildId, role: "brief" })?.boundRevisionId).toBe(
      buildRevision.id,
    );
    expect(listBuildDocumentBindings(buildContext, { buildId, limit: 10 }).items).toHaveLength(1);
    expect(
      db.query<{ total: number }, []>("SELECT COUNT(*) AS total FROM activity_events").get()!.total,
    ).toBe(activityBefore + 1);
    expect(verifyDomainStore().brokenRevisionChains).toEqual([]);
    expect(verifyDomainStore().brokenBuildChains).toEqual([]);
  });

  test("rejects Composition Project changes that would poison Build bindings", async () => {
    const root = makeRoot();
    const { workspace, project, document, revision } = fixture("composition-parent");
    const context = { workspaceId: workspace.id, projectId: project.id } as const;
    const buildId = await createRunningBuild(
      root,
      workspace.id,
      project.id,
      "composition-parent",
    );
    replaceBuildDocumentBinding({
      context,
      buildId,
      role: "brief",
      revisionId: revision.id,
      expectedRevisionId: null,
    });
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "composition-sibling",
      name: "Sibling",
    });
    const outsideWorkspace = createWorkspace({
      slug: "composition-outside",
      name: "Outside",
    });
    const outsideProject = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "composition-outside",
      name: "Outside",
    });
    const db = openDomainDb();
    db.exec("PRAGMA recursive_triggers = OFF");
    const ancestry = db
      .query<{ compositionId: string; revisionId: string }, [string]>(
        `SELECT composition.id AS compositionId, revision.id AS revisionId
         FROM builds build
         JOIN composition_revisions revision
           ON revision.id = build.composition_revision_id
         JOIN compositions composition ON composition.id = revision.composition_id
         WHERE build.id = ?`,
      )
      .get(buildId)!;
    const activityBefore = db
      .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM activity_events")
      .get()!.total;
    for (const projectId of [sibling.id, outsideProject.id]) {
      expect(() =>
        db
          .prepare("UPDATE compositions SET project_id = ? WHERE id = ?")
          .run(projectId, ancestry.compositionId),
      ).toThrow(/binding|scope|provenance/i);
    }
    expect(
      db
        .query<{ projectId: string }, [string]>(
          "SELECT project_id AS projectId FROM compositions WHERE id = ?",
        )
        .get(ancestry.compositionId)?.projectId,
    ).toBe(project.id);
    expect(
      db.query<{ total: number }, []>("SELECT COUNT(*) AS total FROM activity_events").get()!.total,
    ).toBe(activityBefore);
    expect(getBuildDocumentBinding(context, { buildId, role: "brief" })?.boundRevisionId).toBe(
      revision.id,
    );
    expect(listBuildDocumentBindings(context, { buildId, limit: 10 }).items).toHaveLength(1);

    selectCompositionRevision({
      compositionId: ancestry.compositionId,
      revisionId: ancestry.revisionId,
      expectedSelectedRevisionId: null,
    });
    const next = reviseComposition({
      compositionId: ancestry.compositionId,
      expectedLatestRevisionId: ancestry.revisionId,
      engine: "remotion",
    });
    expect(next.revisionNo).toBe(2);
    expect(
      db
        .query<{ projectId: string; selectedRevisionId: string; rowVersion: number }, [string]>(
          `SELECT project_id AS projectId, selected_revision_id AS selectedRevisionId,
                  row_version AS rowVersion
           FROM compositions WHERE id = ?`,
        )
        .get(ancestry.compositionId),
    ).toEqual({
      projectId: project.id,
      selectedRevisionId: ancestry.revisionId,
      rowVersion: 2,
    });
    expect(
      db.query<{ total: number }, []>("SELECT COUNT(*) AS total FROM activity_events").get()!.total,
    ).toBe(activityBefore + 2);
    expect(getBuildDocumentBinding(context, { buildId, role: "brief" })?.documentId).toBe(
      document.id,
    );
    expect(verifyDomainStore().brokenBuildChains).toEqual([]);
  });

  test("pages Project and Build bindings by hidden creation identity", async () => {
    const root = makeRoot();
    const { workspace, project, document, revision } = fixture("one");
    const context = { workspaceId: workspace.id, projectId: project.id } as const;
    const buildId = await createRunningBuild(root, workspace.id, project.id, "paging");
    const db = openDomainDb();
    for (const [id, role] of [
      ["bind_project_a", "project-a"],
      ["bind_project_b", "project-b"],
      ["bind_project_c", "project-c"],
    ] as const) {
      db.prepare(
        `INSERT INTO project_document_bindings
         (id, project_id, document_revision_id, role, created_at)
         VALUES (?, ?, ?, ?, 100)`,
      ).run(id, project.id, revision.id, role);
    }
    for (const [id, role] of [
      ["bind_build_a", "build-a"],
      ["bind_build_b", "build-b"],
      ["bind_build_c", "build-c"],
    ] as const) {
      db.prepare(
        `INSERT INTO build_document_bindings
         (id, build_id, document_revision_id, role, created_at)
         VALUES (?, ?, ?, ?, 100)`,
      ).run(id, buildId, revision.id, role);
    }

    const first = listProjectDocumentBindings(context, {
      projectId: project.id,
      limit: 1,
    });
    expect(first.items.map((item) => item.role)).toEqual(["project-a"]);
    expect(first.nextCursor).not.toBeNull();
    const second = listProjectDocumentBindings(context, {
      projectId: project.id,
      after: first.nextCursor,
      limit: 1,
    });
    const third = listProjectDocumentBindings(context, {
      projectId: project.id,
      after: second.nextCursor,
      limit: 1,
    });
    expect([...first.items, ...second.items, ...third.items].map((item) => item.role)).toEqual([
      "project-a",
      "project-b",
      "project-c",
    ]);
    expect(third.nextCursor).toBeNull();
    expect(Object.keys(first.items[0]!).sort()).toEqual([
      "boundRevisionId",
      "currentHeadRevisionId",
      "documentId",
      "hasNewerHead",
      "ownerId",
      "ownerType",
      "role",
    ]);

    const buildPage = listBuildDocumentBindings(context, { buildId, limit: 2 });
    expect(buildPage.items.map((item) => item.role)).toEqual(["build-a", "build-b"]);
    expect(
      listBuildDocumentBindings(context, {
        buildId,
        after: buildPage.nextCursor,
        limit: 2,
      }).items.map((item) => item.role),
    ).toEqual(["build-c"]);
    expect(getBuildDocumentBinding(context, { buildId, role: "build-a" })).toEqual(
      buildPage.items[0],
    );
    expect(
      getBuildDocumentBinding({ workspaceId: workspace.id }, { buildId, role: "build-a" }),
    ).toEqual(buildPage.items[0]);
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "paging-sibling",
      name: "Paging sibling",
    });
    expect(
      getBuildDocumentBinding(
        { workspaceId: workspace.id, projectId: sibling.id },
        { buildId, role: "build-a" },
      ),
    ).toBeNull();
    expect(() =>
      listBuildDocumentBindings(
        { workspaceId: workspace.id, projectId: sibling.id },
        { buildId, limit: 10 },
      ),
    ).toThrow(/not found/i);
    const outside = createWorkspace({ slug: "paging-outside", name: "Outside" });
    expect(
      getBuildDocumentBinding({ workspaceId: outside.id }, { buildId, role: "build-a" }),
    ).toBeNull();
    const session = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "build-binding",
    });
    replaceBuildDocumentBinding({
      context: { sessionId: session.id },
      buildId,
      role: "session-build",
      revisionId: revision.id,
      expectedRevisionId: null,
    });
    endAgentSession(session.id);
    expect(() =>
      replaceBuildDocumentBinding({
        context: { sessionId: session.id },
        buildId,
        role: "ended-build",
        revisionId: revision.id,
        expectedRevisionId: null,
      }),
    ).toThrow(/ended/i);
    expect(() =>
      listProjectDocumentBindings(context, {
        projectId: project.id,
        after: encodeCursor("v1", { ordinal: 100, id: "bind_project_a" }),
        limit: 1,
      }),
    ).toThrow(/family/i);
    for (const limit of [0, 101]) {
      expect(() =>
        listProjectDocumentBindings(context, { projectId: project.id, limit }),
      ).toThrow(/limit/i);
      expect(() => listBuildDocumentBindings(context, { buildId, limit })).toThrow(/limit/i);
    }

    const head = reviseDocument({
      documentId: document.id,
      expectedHeadId: revision.id,
      format: "text",
      body: "two",
    });
    expect(getBuildDocumentBinding(context, { buildId, role: "build-a" })).toMatchObject({
      currentHeadRevisionId: head.id,
      hasNewerHead: true,
    });
    db.prepare("UPDATE builds SET state = 'failed', error = 'stop', ended_at = ? WHERE id = ?").run(
      Date.now(),
      buildId,
    );
    expect(getBuildDocumentBinding(context, { buildId, role: "build-a" })?.ownerId).toBe(buildId);
    expect(listBuildDocumentBindings(context, { buildId, limit: 10 }).items).toHaveLength(4);
    expect(() =>
      replaceBuildDocumentBinding({
        context,
        buildId,
        role: "build-a",
        revisionId: head.id,
        expectedRevisionId: revision.id,
      }),
    ).toThrow(/immutable/i);
  });
});
