import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  getDocumentContent,
  replaceBuildDocumentBinding,
  replaceProjectDocumentBinding,
} from "../../cli/lib/store/document-content.js";
import {
  createDocument,
  getDocument,
  getDocumentRevision,
  listDocuments,
  listDocumentRevisions,
  reviseDocument,
  searchDocuments,
} from "../../cli/lib/store/documents.js";
import {
  createIteration,
  createProject,
  createWorkspace,
} from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import type { QueryContext } from "../../cli/lib/store/scope-context.js";
import type { ProjectRow, WorkspaceRow } from "../../cli/lib/store/types.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { scopedActivity } from "../helpers/activity.js";

let roots: TmpRoot[] = [];

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("domain document store", () => {
  test("publishes body-free Document and revision DTOs with one content seam", () => {
    const { workspace, project } = setupProject("safe-dtos");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const document = createDocument({
      projectId: project.id,
      kind: "brief",
      slug: "brief",
      title: "Brief",
    });
    const first = reviseDocument({
      documentId: document.id,
      format: "markdown",
      title: "First",
      body: "private first body",
    });
    const second = reviseDocument({
      documentId: document.id,
      expectedHeadId: first.id,
      format: "markdown",
      title: "Second",
      body: "private current body",
    });

    const revisionKeys = [
      "authoredBySessionId",
      "createdAt",
      "documentId",
      "format",
      "id",
      "iterationId",
      "parentRevisionId",
      "revisionNo",
      "title",
    ];
    expect(Object.keys(second).sort()).toEqual(revisionKeys);
    expect(Object.keys(getDocumentRevision({ context, revisionId: first.id })).sort()).toEqual(
      revisionKeys,
    );

    const detail = getDocument({ context, documentId: document.id });
    expect(Object.keys(detail).sort()).toEqual([
      "createdAt",
      "currentRevision",
      "currentRevisionId",
      "id",
      "kind",
      "projectId",
      "rowVersion",
      "slug",
      "title",
      "updatedAt",
      "workspaceId",
    ]);
    expect(detail.currentRevision).toEqual(second);
    expect(
      Object.keys(listDocuments({ context, limit: 10 }).items[0]!).sort(),
    ).toEqual([
      "createdAt",
      "currentRevisionId",
      "id",
      "kind",
      "projectId",
      "rowVersion",
      "slug",
      "title",
      "updatedAt",
      "workspaceId",
    ]);
    expect(
      Object.keys(
        searchDocuments({ context, query: "current", limit: 10 }).items[0]!,
      ).sort(),
    ).toEqual([
      "authoredBySessionId",
      "createdAt",
      "documentId",
      "documentTitle",
      "format",
      "iterationId",
      "kind",
      "parentRevisionId",
      "projectId",
      "revisionId",
      "revisionNo",
      "slug",
      "title",
      "workspaceId",
    ]);

    const safeValues = [
      second,
      detail,
      getDocumentRevision({ context, revisionId: first.id }),
      listDocumentRevisions({
        context,
        documentId: document.id,
        limit: 10,
      }),
      searchDocuments({ context, query: "current", limit: 10 }),
    ];
    const serialized = JSON.stringify(safeValues);
    expect(serialized).not.toContain("private first body");
    expect(serialized).not.toContain("private current body");
    expect(serialized).not.toMatch(
      /"(?:body|contentSha256|locator|path|metadata|config|secret)"/,
    );
    expect(
      getDocumentContent({
        context,
        revisionId: second.id,
        afterByte: 0,
        limitBytes: 65_536,
      }),
    ).toEqual({
      revisionId: second.id,
      format: "markdown",
      text: "private current body",
      nextByte: null,
    });
  });

  test("public Document detail and revision history project body-free SQL columns", () => {
    const { workspace, project } = setupProject("safe-query-boundary");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const document = createDocument({
      projectId: project.id,
      kind: "brief",
      slug: "brief",
      title: "Brief",
    });
    const revision = reviseDocument({
      documentId: document.id,
      format: "markdown",
      body: "must not cross the public query boundary",
    });
    const db = openDomainDb();
    const query = db.query.bind(db);
    const revisionReadColumns: string[][] = [];
    Object.defineProperty(db, "query", {
      configurable: true,
      value(sql: string) {
        const statement = query(sql);
        if (/\bFROM\s+document_revisions\b/i.test(sql)) {
          revisionReadColumns.push([...statement.columnNames]);
        }
        return statement;
      },
    });
    try {
      getDocument({ context, documentId: document.id });
      getDocumentRevision({ context, revisionId: revision.id });
      listDocumentRevisions({ context, documentId: document.id, limit: 10 });
    } finally {
      Reflect.deleteProperty(db, "query");
    }

    expect(revisionReadColumns).toHaveLength(3);
    for (const columns of revisionReadColumns) {
      expect(columns).not.toContain("body");
      expect(columns).not.toContain("content_sha256");
    }
  });

  test("authorizes Workspace, Project, and Session Document reads with slug shadowing", () => {
    const { workspace, project } = setupProject("safe-visibility");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outsideWorkspace = createWorkspace({
      slug: "safe-visibility-outside",
      name: "Outside",
    });
    const workspaceStyle = createDocument({
      workspaceId: workspace.id,
      kind: "style-guide",
      slug: "style",
      title: "Workspace style",
    });
    const workspaceNote = createDocument({
      workspaceId: workspace.id,
      kind: "note",
      slug: "shared",
      title: "Shared",
    });
    const projectStyle = createDocument({
      projectId: project.id,
      kind: "style-guide",
      slug: "style",
      title: "Project style",
    });
    const siblingDocument = createDocument({
      projectId: sibling.id,
      kind: "note",
      slug: "sibling",
      title: "Sibling",
    });
    const outsideDocument = createDocument({
      workspaceId: outsideWorkspace.id,
      kind: "note",
      slug: "outside",
      title: "Outside",
    });
    const revisions = [
      workspaceStyle,
      workspaceNote,
      projectStyle,
      siblingDocument,
      outsideDocument,
    ].map((document) =>
      reviseDocument({
        documentId: document.id,
        format: "text",
        body: "visibilityneedle",
      }),
    );
    const workspaceSession = startAgentSession({
      workspaceId: workspace.id,
      agent: "workspace-reader",
    });
    const projectSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "project-reader",
    });

    const ids = (context: { workspaceId: string; projectId?: string } | { sessionId: string }) =>
      listDocuments({ context, limit: 100 }).items.map((item) => item.id).sort();
    expect(ids({ workspaceId: workspace.id })).toEqual(
      [workspaceNote.id, workspaceStyle.id].sort(),
    );
    expect(ids({ sessionId: workspaceSession.id })).toEqual(
      [workspaceNote.id, workspaceStyle.id].sort(),
    );
    expect(ids({ workspaceId: workspace.id, projectId: project.id })).toEqual(
      [projectStyle.id, workspaceNote.id].sort(),
    );
    expect(ids({ sessionId: projectSession.id })).toEqual(
      [projectStyle.id, workspaceNote.id].sort(),
    );
    expect(
      searchDocuments({
        context: { sessionId: projectSession.id },
        query: "visibilityneedle",
        limit: 100,
      }).items.map((item) => item.documentId).sort(),
    ).toEqual([projectStyle.id, workspaceNote.id].sort());

    const projectContext = { workspaceId: workspace.id, projectId: project.id };
    const exactWorkspaceDocument = getDocument({
      context: projectContext,
      documentId: workspaceStyle.id,
    });
    expect(exactWorkspaceDocument.id).toBe(workspaceStyle.id);
    expect(exactWorkspaceDocument.currentRevision).toEqual(revisions[0]!);
    expect(
      getDocumentRevision({
        context: projectContext,
        revisionId: revisions[0]!.id,
      }),
    ).toEqual(revisions[0]!);
    expect(() =>
      getDocument({ context: projectContext, documentId: siblingDocument.id }),
    ).toThrow(`Document not found: ${siblingDocument.id}`);
    expect(() =>
      getDocument({ context: projectContext, documentId: "doc_missing" }),
    ).toThrow("Document not found: doc_missing");
    expect(() =>
      getDocumentRevision({ context: projectContext, revisionId: revisions[3]!.id }),
    ).toThrow(`Document Revision not found: ${revisions[3]!.id}`);
    expect(() =>
      getDocumentRevision({ context: projectContext, revisionId: "drev_missing" }),
    ).toThrow("Document Revision not found: drev_missing");
  });

  test("uses typed tuple cursors for Document roots, revisions, and current-head search", () => {
    const { workspace, project } = setupProject("safe-pagination");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const documents = ["a", "b", "c"].map((slug) =>
      createDocument({
        projectId: project.id,
        kind: "note",
        slug,
        title: slug,
      }),
    );
    openDomainDb()
      .prepare("UPDATE documents SET created_at = ? WHERE project_id = ?")
      .run(1234, project.id);
    const expectedIds = documents.map((document) => document.id).sort();
    const seenIds: string[] = [];
    let after: string | null | undefined;
    do {
      const page = listDocuments({ context, after, limit: 1 });
      seenIds.push(...page.items.map((item) => item.id));
      after = page.nextCursor;
    } while (after);
    expect(seenIds).toEqual(expectedIds);

    const revisionIds: string[] = [];
    let expectedHeadId: string | null = null;
    for (const body of ["one", "two", "three"]) {
      const revision = reviseDocument({
        documentId: documents[0]!.id,
        expectedHeadId,
        format: "text",
        body,
      });
      revisionIds.push(revision.id);
      expectedHeadId = revision.id;
    }
    const firstDocuments = listDocuments({ context, limit: 1 });
    const firstRevisions = listDocumentRevisions({
      context,
      documentId: documents[0]!.id,
      limit: 1,
    });
    expect(firstDocuments.nextCursor).toStartWith("c1.");
    expect(firstRevisions.nextCursor).toStartWith("v1.");
    expect(() =>
      listDocumentRevisions({
        context,
        documentId: documents[0]!.id,
        after: firstDocuments.nextCursor,
        limit: 1,
      }),
    ).toThrow(/family/i);
    expect(() =>
      listDocuments({
        context,
        after: firstRevisions.nextCursor,
        limit: 1,
      }),
    ).toThrow(/family/i);
    expect(
      listDocumentRevisions({
        context,
        documentId: documents[0]!.id,
        after: firstRevisions.nextCursor,
        limit: 100,
      }).items.map((revision) => revision.id),
    ).toEqual(revisionIds.slice(1));

    const searchable = documents.slice(1);
    const searchableRevisionIds: string[] = [];
    const realNow = Date.now;
    Date.now = () => 9999;
    try {
      for (const document of searchable) {
        const revision = reviseDocument({
          documentId: document.id,
          format: "text",
          body: "samecreatedsearch",
        });
        searchableRevisionIds.push(revision.id);
      }
    } finally {
      Date.now = realNow;
    }
    const expectedSearchIds = searchableRevisionIds.sort();
    const seenSearchIds: string[] = [];
    after = undefined;
    do {
      const page = searchDocuments({
        context,
        query: "samecreatedsearch",
        after,
        limit: 1,
      });
      seenSearchIds.push(...page.items.map((item) => item.revisionId));
      after = page.nextCursor;
    } while (after);
    expect(seenSearchIds).toEqual(expectedSearchIds);
    expect(() => listDocuments({ context, limit: 0 })).toThrow(/1 through 100/);
    expect(() => listDocuments({ context, limit: 101 })).toThrow(/1 through 100/);
    expect(() =>
      listDocumentRevisions({
        context,
        documentId: documents[0]!.id,
        limit: 0,
      }),
    ).toThrow(/1 through 100/);
    expect(() =>
      searchDocuments({ context, query: "samecreatedsearch", limit: 101 }),
    ).toThrow(/1 through 100/);
  });

  test("creates a scoped Document with no current revision", () => {
    const { workspace, project } = setupProject("create");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const document = createDocument({
      projectId: project.id,
      kind: "brief",
      slug: "brief",
      title: "Brief",
    });

    expect(getDocument({ context, documentId: document.id })).toEqual({
      ...document,
      currentRevision: null,
    });
    expect(() =>
      getDocument({ context, documentId: "doc_missing" }),
    ).toThrow(/Document not found/);
    expect(() =>
      createDocument({
        workspaceId: workspace.id,
        projectId: project.id,
        kind: "note",
        slug: "invalid",
        title: "Invalid",
      } as never),
    ).toThrow(/exactly one/);
    expect(() =>
      createDocument({
        projectId: project.id,
        kind: "note",
        slug: "data-title",
        title: "data:image/png;base64,SGVsbG8=",
      }),
    ).toThrow(/data URL/i);
    expect(
      openDomainDb()
        .query("SELECT id FROM documents WHERE slug = 'data-title'")
        .get(),
    ).toBeNull();
  });

  test("stores immutable revisions with exact-head conflicts, current FTS, and activity", () => {
    const { workspace, project } = setupProject("revision");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const iteration = createIteration({
      projectId: project.id,
      title: "Round two",
    });
    const document = createDocument({
      projectId: project.id,
      kind: "brief",
      slug: "brief",
      title: "Brief",
    });
    const v1 = reviseDocument({
      documentId: document.id,
      format: "markdown",
      title: "Launch brief",
      body: "Periodontal education launch baselineunique",
    });
    expect(() =>
      reviseDocument({
        documentId: createDocument({
          projectId: project.id,
          kind: "note",
          slug: "fresh",
          title: "Fresh",
        }).id,
        expectedHeadId: v1.id,
        format: "text",
        body: "invalid first head",
      }),
    ).toThrow(/conflict/i);
    const v2 = reviseDocument({
      documentId: document.id,
      expectedHeadId: v1.id,
      iterationId: iteration.id,
      format: "markdown",
      body: "Periodontal education launch with a shorter hook",
    });

    expect(v2).toMatchObject({ parentRevisionId: v1.id, revisionNo: 2 });
    expect(getDocument({ context, documentId: document.id }).currentRevision?.id).toBe(
      v2.id,
    );
    expect(
      searchDocuments({
        context: { workspaceId: workspace.id },
        query: "periodontal",
        limit: 50,
      }).items,
    ).toEqual([]);
    expect(
      searchDocuments({
        context,
        query: "periodontal",
        limit: 50,
      }).items.map((row) => row.revisionId),
    ).toEqual([v2.id]);
    expect(
      searchDocuments({ context, query: "baselineunique", limit: 50 }).items,
    ).toEqual([]);
    expect(
      searchDocuments({ context, query: "shorter", limit: 50 }).items[0],
    ).toMatchObject({
      revisionId: v2.id,
      documentTitle: "Brief",
      title: null,
    });
    expect(() =>
      reviseDocument({
        documentId: document.id,
        expectedHeadId: v1.id,
        format: "markdown",
        body: "stale revision",
      }),
    ).toThrow(/conflict/i);
    expect(() =>
      reviseDocument({
        documentId: document.id,
        format: "text",
        body: "missing expectation",
      }),
    ).toThrow(/conflict/i);
    expect(
      openDomainDb()
        .query(
          "SELECT id FROM document_revisions WHERE document_id = ? ORDER BY revision_no",
        )
        .all(document.id),
    ).toEqual([{ id: v1.id }, { id: v2.id }]);
    expect(
      searchDocuments({ context, query: "stale", limit: 50 }).items,
    ).toEqual([]);
    expect(
      scopedActivity({ projectId: project.id,})
        .filter((event) => event.entityId === document.id)
        .map((event) => event.action),
    ).toEqual(["document.created", "document.revised", "document.revised"]);
    expect(
      JSON.stringify(scopedActivity({ projectId: project.id,})),
    ).not.toContain("Periodontal education");
    expect(() =>
      openDomainDb()
        .prepare("UPDATE document_revisions SET body = 'changed' WHERE id = ?")
        .run(v1.id),
    ).toThrow(/immutable/i);
  });

  test("inherits Workspace Documents, shadows equal slugs, and paginates stable IDs", () => {
    const { workspace, project } = setupProject("visibility");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const workspaceStyle = createDocument({
      workspaceId: workspace.id,
      kind: "style-guide",
      slug: "style",
      title: "Workspace style",
    });
    const workspaceNote = createDocument({
      workspaceId: workspace.id,
      kind: "note",
      slug: "shared-note",
      title: "Shared note",
    });
    const projectStyle = createDocument({
      projectId: project.id,
      kind: "style-guide",
      slug: "style",
      title: "Project style",
    });
    const projectBrief = createDocument({
      projectId: project.id,
      kind: "brief",
      slug: "brief",
      title: "Project brief",
    });
    reviseDocument({
      documentId: workspaceStyle.id,
      format: "text",
      body: "workspace typography",
    });
    reviseDocument({
      documentId: workspaceNote.id,
      format: "text",
      body: "shared typography",
    });
    reviseDocument({
      documentId: projectStyle.id,
      format: "text",
      body: "project typography",
    });
    reviseDocument({
      documentId: projectBrief.id,
      format: "text",
      body: "project launch",
    });

    expect(
      listDocuments({ context: { workspaceId: workspace.id }, limit: 50 })
        .items.map((row) => row.id)
        .sort(),
    ).toEqual([workspaceNote.id, workspaceStyle.id].sort());
    const visible = listDocuments({ context, limit: 50 }).items;
    expect(visible.map((row) => row.id).sort()).toEqual(
      [workspaceNote.id, projectStyle.id, projectBrief.id].sort(),
    );
    expect(visible).not.toContainEqual(
      expect.objectContaining({ id: workspaceStyle.id }),
    );
    expect(
      searchDocuments({ context, query: "typography", limit: 50 })
        .items.map((row) => row.documentId)
        .sort(),
    ).toEqual([workspaceNote.id, projectStyle.id].sort());

    const first = listDocuments({ context, limit: 1 });
    const second = listDocuments({
      context,
      after: first.nextCursor,
      limit: 1,
    });
    expect(first.nextCursor).toStartWith("c1.");
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect(() => listDocuments({ context, limit: 101 })).toThrow(
      /1 through 100/,
    );
    const firstSearch = searchDocuments({
      context,
      query: "typography",
      limit: 1,
    });
    const secondSearch = searchDocuments({
      context,
      query: "typography",
      after: firstSearch.nextCursor,
      limit: 1,
    });
    expect(firstSearch.nextCursor).toStartWith("c1.");
    expect(secondSearch.items[0]?.revisionId).not.toBe(
      firstSearch.items[0]?.revisionId,
    );
    expect(() =>
      searchDocuments({ context, query: "typography", limit: 0 }),
    ).toThrow(/1 through 100/);
  });

  test("canonicalizes JSON and rejects embedded binary payloads without false positives", () => {
    const { workspace, project } = setupProject("json");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const document = createDocument({
      projectId: project.id,
      kind: "scenario",
      slug: "scenario",
      title: "Scenario",
    });
    const body = {
      z: 1,
      nested: { b: 2, a: [3, { y: true, x: null }] },
      prose: "SGVsbG8=",
    };
    const revision = reviseDocument({
      documentId: document.id,
      format: "json",
      title: "Structured",
      body,
    });
    const canonicalBody =
      '{"nested":{"a":[3,{"x":null,"y":true}],"b":2},"prose":"SGVsbG8=","z":1}';
    const envelope = JSON.stringify({
      format: "json",
      title: "Structured",
      body: canonicalBody,
    });

    expect(readDocumentText(context, revision.id)).toBe(canonicalBody);
    expect(revisionHash(revision.id)).toBe(
      createHash("sha256").update(envelope).digest("hex"),
    );
    const canonicalReplay = reviseDocument({
      documentId: document.id,
      expectedHeadId: revision.id,
      format: "json",
      title: "Structured",
      body: '{"z":1,"nested":{"b":2,"a":[3,{"y":true,"x":null}]},"prose":"SGVsbG8="}',
    });
    expect(revisionHash(canonicalReplay.id)).toBe(revisionHash(revision.id));
    expect(
      searchDocuments({ context, query: "SGVsbG8", limit: 50 }).items,
    ).toEqual([]);

    const rejectedBodies: unknown[] = [
      { value: Number.NaN },
      { value: Number.POSITIVE_INFINITY },
      { imageData: "SGVsbG8=" },
      { nested: { BLOB: ["SGVsbG8="] } },
      { value: "data:image/png;base64,SGVsbG8=" },
    ];
    const expectedHeadId = canonicalReplay.id;
    for (const rejectedBody of rejectedBodies) {
      expect(() =>
        reviseDocument({
          documentId: document.id,
          expectedHeadId,
          format: "json",
          body: rejectedBody as never,
        }),
      ).toThrow();
    }
    expect(() =>
      reviseDocument({
        documentId: document.id,
        expectedHeadId,
        format: "text",
        body: "data:text/plain,hello",
      }),
    ).toThrow(/data URL/i);
    expect(() =>
      reviseDocument({
        documentId: document.id,
        expectedHeadId,
        format: "text",
        title: "data:text/plain,hello",
        body: "safe body",
      }),
    ).toThrow(/data URL/i);

    const shared: unknown[] = ["same"];
    expect(() =>
      reviseDocument({
        documentId: document.id,
        expectedHeadId,
        format: "json",
        body: { first: shared, second: shared } as never,
      }),
    ).not.toThrow();
  });

  test("round-trips an own __proto__ JSON key without a hash collision", () => {
    const { workspace, project } = setupProject("json-proto-key");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const document = createDocument({
      projectId: project.id,
      kind: "custom",
      slug: "proto-key",
      title: "Proto key",
    });

    const keyed = reviseDocument({
      documentId: document.id,
      format: "json",
      body: '{"__proto__":"kept"}',
    });
    const empty = reviseDocument({
      documentId: document.id,
      expectedHeadId: keyed.id,
      format: "json",
      body: {},
    });

    expect(readDocumentText(context, keyed.id)).toBe('{"__proto__":"kept"}');
    expect(readDocumentText(context, empty.id)).toBe("{}");
    expect(revisionHash(keyed.id)).not.toBe(revisionHash(empty.id));
  });

  test("accepts parsed scalar strings and serialized JSON string text", () => {
    const { workspace, project } = setupProject("json-string-inputs");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const document = createDocument({
      projectId: project.id,
      kind: "custom",
      slug: "string-inputs",
      title: "String inputs",
    });

    const parsedScalar = reviseDocument({
      documentId: document.id,
      format: "json",
      body: "plain scalar",
    });
    const serializedString = reviseDocument({
      documentId: document.id,
      expectedHeadId: parsedScalar.id,
      format: "json",
      body: '"serialized scalar"',
    });

    expect(readDocumentText(context, parsedScalar.id)).toBe('"plain scalar"');
    expect(readDocumentText(context, serializedString.id)).toBe(
      '"serialized scalar"',
    );
    for (const dataUrl of [
      "data:text/plain,hello",
      '"data:text/plain,hello"',
    ]) {
      expect(() =>
        reviseDocument({
          documentId: document.id,
          expectedHeadId: serializedString.id,
          format: "json",
          body: dataUrl,
        }),
      ).toThrow(/data URL/i);
    }
  });

  test("validates revision Iterations against Document scope", () => {
    const { workspace, project } = setupProject("iteration-source");
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const otherWorkspace = createWorkspace({
      slug: "iteration-other-workspace",
      name: "Other",
    });
    const otherProject = createProject({
      workspaceId: otherWorkspace.id,
      slug: "other",
      name: "Other",
    });
    const ownIteration = createIteration({
      projectId: project.id,
      title: "Own",
    });
    const siblingIteration = createIteration({
      projectId: sibling.id,
      title: "Sibling",
    });
    const otherIteration = createIteration({
      projectId: otherProject.id,
      title: "Other",
    });
    const projectDocument = createDocument({
      projectId: project.id,
      kind: "note",
      slug: "project",
      title: "Project",
    });
    const workspaceDocument = createDocument({
      workspaceId: workspace.id,
      kind: "note",
      slug: "workspace",
      title: "Workspace",
    });

    const projectHead = reviseDocument({
      documentId: projectDocument.id,
      iterationId: ownIteration.id,
      format: "text",
      body: "own",
    });
    expect(() =>
      reviseDocument({
        documentId: projectDocument.id,
        expectedHeadId: projectHead.id,
        iterationId: siblingIteration.id,
        format: "text",
        body: "sibling",
      }),
    ).toThrow(/Iteration.*scope/i);
    const workspaceHead = reviseDocument({
      documentId: workspaceDocument.id,
      iterationId: siblingIteration.id,
      format: "text",
      body: "same Workspace",
    });
    expect(() =>
      reviseDocument({
        documentId: workspaceDocument.id,
        expectedHeadId: workspaceHead.id,
        iterationId: otherIteration.id,
        format: "text",
        body: "other Workspace",
      }),
    ).toThrow(/Iteration.*scope/i);
  });

  test("binds exact revisions to Projects and Builds and rejects ownership or role conflicts", () => {
    const { workspace, project } = setupProject("binding-source");
    const context = { workspaceId: workspace.id, projectId: project.id } as const;
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const otherWorkspace = createWorkspace({
      slug: "binding-other-workspace",
      name: "Other",
    });
    const otherProject = createProject({
      workspaceId: otherWorkspace.id,
      slug: "other",
      name: "Other",
    });
    const workspaceDocument = createDocument({
      workspaceId: workspace.id,
      kind: "style-guide",
      slug: "style",
      title: "Style",
    });
    const workspaceRevision = reviseDocument({
      documentId: workspaceDocument.id,
      format: "text",
      body: "shared",
    });
    const projectDocument = createDocument({
      projectId: project.id,
      kind: "brief",
      slug: "brief",
      title: "Brief",
    });
    const projectRevision = reviseDocument({
      documentId: projectDocument.id,
      format: "text",
      body: "project",
    });
    const siblingDocument = createDocument({
      projectId: sibling.id,
      kind: "note",
      slug: "sibling",
      title: "Sibling",
    });
    const siblingRevision = reviseDocument({
      documentId: siblingDocument.id,
      format: "text",
      body: "sibling",
    });
    const otherDocument = createDocument({
      projectId: otherProject.id,
      kind: "note",
      slug: "other",
      title: "Other",
    });
    const otherRevision = reviseDocument({
      documentId: otherDocument.id,
      format: "text",
      body: "other",
    });
    const buildId = insertBuild(project.id, "source");

    const projectBinding = replaceProjectDocumentBinding({
      context,
      projectId: project.id,
      revisionId: workspaceRevision.id,
      role: "style-guide",
      expectedRevisionId: null,
    });
    const buildBinding = replaceBuildDocumentBinding({
      context,
      buildId,
      revisionId: projectRevision.id,
      role: "brief",
      expectedRevisionId: null,
    });
    const buildWorkspaceBinding = replaceBuildDocumentBinding({
      context,
      buildId,
      revisionId: workspaceRevision.id,
      role: "style-guide",
      expectedRevisionId: null,
    });
    expect(projectBinding.boundRevisionId).toBe(workspaceRevision.id);
    expect(buildBinding.boundRevisionId).toBe(projectRevision.id);
    expect(buildWorkspaceBinding.boundRevisionId).toBe(workspaceRevision.id);
    expect(
      scopedActivity({ projectId: project.id,}).filter(
        (event) => event.action === "document.bound",
      ),
    ).toHaveLength(3);
    expect(() =>
      replaceProjectDocumentBinding({
        context,
        projectId: project.id,
        revisionId: projectRevision.id,
        role: "style-guide",
        expectedRevisionId: null,
      }),
    ).toThrow(/conflict/i);
    expect(() =>
      replaceProjectDocumentBinding({
        context,
        projectId: project.id,
        revisionId: siblingRevision.id,
        role: "sibling",
        expectedRevisionId: null,
      }),
    ).toThrow(/scope/i);
    expect(() =>
      replaceProjectDocumentBinding({
        context,
        projectId: project.id,
        revisionId: otherRevision.id,
        role: "other",
        expectedRevisionId: null,
      }),
    ).toThrow(/scope/i);
    expect(() =>
      replaceBuildDocumentBinding({
        context,
        buildId,
        revisionId: siblingRevision.id,
        role: "sibling",
        expectedRevisionId: null,
      }),
    ).toThrow(/scope/i);
    expect(() =>
      replaceBuildDocumentBinding({
        context,
        buildId,
        revisionId: otherRevision.id,
        role: "other",
        expectedRevisionId: null,
      }),
    ).toThrow(/scope/i);
    expect(() =>
      replaceBuildDocumentBinding({
        context,
        buildId,
        revisionId: workspaceRevision.id,
        role: "brief",
        expectedRevisionId: null,
      }),
    ).toThrow(/conflict/i);
    expect(
      openDomainDb()
        .query(
          "SELECT document_revision_id FROM project_document_bindings WHERE project_id = ? AND role = 'style-guide'",
        )
        .get(project.id),
    ).toEqual({ document_revision_id: workspaceRevision.id });
    expect(
      openDomainDb()
        .query(
          "SELECT document_revision_id FROM build_document_bindings WHERE build_id = ? AND role = 'brief'",
        )
        .get(buildId),
    ).toEqual({ document_revision_id: projectRevision.id });
  });

  test("rolls back revision, head, FTS, and activity when activity insertion aborts", () => {
    const { workspace, project } = setupProject("rollback");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const document = createDocument({
      projectId: project.id,
      kind: "brief",
      slug: "brief",
      title: "Brief",
    });
    const v1 = reviseDocument({
      documentId: document.id,
      format: "text",
      body: "stable searchable body",
    });
    const db = openDomainDb();
    const activityBefore = scopedActivity({ projectId: project.id,});
    db.exec(`
      CREATE TRIGGER abort_document_revision_activity
      BEFORE INSERT ON activity_events
      WHEN NEW.action = 'document.revised'
      BEGIN
        SELECT RAISE(ABORT, 'activity abort');
      END
    `);

    try {
      expect(() =>
        reviseDocument({
          documentId: document.id,
          expectedHeadId: v1.id,
          format: "text",
          body: "must roll back",
        }),
      ).toThrow("activity abort");
      expect(getDocument({ context, documentId: document.id }).currentRevisionId).toBe(
        v1.id,
      );
      expect(
        db
          .query(
            "SELECT COUNT(*) AS count FROM document_revisions WHERE document_id = ?",
          )
          .get(document.id),
      ).toEqual({ count: 1 });
      expect(
        searchDocuments({ context, query: "stable", limit: 50 }).items.map(
          (row) => row.revisionId,
        ),
      ).toEqual([v1.id]);
      expect(
        searchDocuments({ context, query: "roll", limit: 50 }).items,
      ).toEqual([]);
      expect(scopedActivity({ projectId: project.id,})).toEqual(
        activityBefore,
      );
    } finally {
      db.exec("DROP TRIGGER IF EXISTS abort_document_revision_activity");
    }
  });

  test("contains revision authors in active Workspace and Project sessions", () => {
    const { workspace, project } = setupProject("authorship");
    const context = { workspaceId: workspace.id, projectId: project.id };
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outsideWorkspace = createWorkspace({
      slug: "authorship-outside",
      name: "Outside",
    });
    const workspaceSession = startAgentSession({
      workspaceId: workspace.id,
      agent: "workspace-agent",
    });
    const projectSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "project-agent",
    });
    const siblingSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: sibling.id,
      agent: "sibling-agent",
    });
    const outsideSession = startAgentSession({
      workspaceId: outsideWorkspace.id,
      agent: "outside-agent",
    });
    const endedSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "ended-agent",
    });
    endAgentSession(endedSession.id);
    const projectDocument = createDocument({
      projectId: project.id,
      kind: "note",
      slug: "project-note",
      title: "Project note",
    });
    const workspaceDocument = createDocument({
      workspaceId: workspace.id,
      kind: "note",
      slug: "workspace-note",
      title: "Workspace note",
    });

    const projectV1 = reviseDocument({
      documentId: projectDocument.id,
      format: "text",
      body: "Exact Project author",
      authoredBySessionId: projectSession.id,
    });
    const projectV2 = reviseDocument({
      documentId: projectDocument.id,
      expectedHeadId: projectV1.id,
      format: "text",
      body: "Workspace author",
      authoredBySessionId: workspaceSession.id,
    });
    const workspaceV1 = reviseDocument({
      documentId: workspaceDocument.id,
      format: "text",
      body: "Workspace-only author",
      authoredBySessionId: workspaceSession.id,
    });
    expect(projectV1.authoredBySessionId).toBe(projectSession.id);
    expect(projectV2.authoredBySessionId).toBe(workspaceSession.id);
    expect(workspaceV1.authoredBySessionId).toBe(workspaceSession.id);

    const before = {
      revisions: openDomainDb()
        .query<{ count: number }, []>(
          "SELECT COUNT(*) AS count FROM document_revisions",
        )
        .get()!.count,
      activity: scopedActivity({ workspaceId: workspace.id,}).length,
    };
    for (const authoredBySessionId of [
      siblingSession.id,
      outsideSession.id,
      endedSession.id,
    ]) {
      expect(() =>
        reviseDocument({
          documentId: projectDocument.id,
          expectedHeadId: projectV2.id,
          format: "text",
          body: "Rejected author",
          authoredBySessionId,
        }),
      ).toThrow(/session/i);
    }
    expect(() =>
      reviseDocument({
        documentId: workspaceDocument.id,
        expectedHeadId: workspaceV1.id,
        format: "text",
        body: "Project Session cannot widen",
        authoredBySessionId: projectSession.id,
      }),
    ).toThrow(/session/i);
    expect(getDocument({ context, documentId: projectDocument.id }).currentRevisionId).toBe(
      projectV2.id,
    );
    expect(
      getDocument({
        context: { workspaceId: workspace.id },
        documentId: workspaceDocument.id,
      }).currentRevisionId,
    ).toBe(
      workspaceV1.id,
    );
    expect(
      openDomainDb()
        .query<{ count: number }, []>(
          "SELECT COUNT(*) AS count FROM document_revisions",
        )
        .get()!.count,
    ).toBe(before.revisions);
    expect(scopedActivity({ workspaceId: workspace.id,})).toHaveLength(
      before.activity,
    );
  });
});

function readDocumentText(context: QueryContext, revisionId: string): string {
  return getDocumentContent({
    context,
    revisionId,
    afterByte: 0,
    limitBytes: 65_536,
  }).text;
}

function revisionHash(revisionId: string): string {
  return openDomainDb()
    .query<{ contentSha256: string }, [string]>(
      "SELECT content_sha256 AS contentSha256 FROM document_revisions WHERE id = ?",
    )
    .get(revisionId)!.contentSha256;
}

function setupProject(prefix: string): {
  workspace: WorkspaceRow;
  project: ProjectRow;
} {
  roots.push(makeTmpRoot(`ralphy-domain-documents-${prefix}`));
  const workspace = createWorkspace({
    slug: `${prefix}-workspace`,
    name: "Workspace",
  });
  const project = createProject({
    workspaceId: workspace.id,
    slug: `${prefix}-project`,
    name: "Project",
  });
  return { workspace, project };
}

function insertBuild(projectId: string, suffix: string): string {
  const db = openDomainDb();
  const now = Date.now();
  const compositionId = `comp_${suffix}`;
  const revisionId = `crev_${suffix}`;
  const buildId = `build_${suffix}`;
  db.prepare(
    "INSERT INTO compositions (id, project_id, slug, kind, created_at, updated_at) VALUES (?, ?, ?, 'video', ?, ?)",
  ).run(compositionId, projectId, suffix, now, now);
  db.prepare(
    `INSERT INTO composition_revisions
     (id, composition_id, revision_no, state, engine, manifest_sha256, created_at, sealed_at)
     VALUES (?, ?, 1, 'sealed', 'fixture', ?, ?, ?)`,
  ).run(revisionId, compositionId, "0".repeat(64), now, now);
  db.prepare(
    "INSERT INTO builds (id, composition_revision_id, state, profile_json, created_at) VALUES (?, ?, 'pending', '{}', ?)",
  ).run(buildId, revisionId, now);
  return buildId;
}
