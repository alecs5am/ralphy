import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  bindBuildDocument,
  bindProjectDocument,
  createDocument,
  getDocument,
  listDocuments,
  reviseDocument,
  searchDocuments,
} from "../../cli/lib/store/documents.js";
import {
  createIteration,
  createProject,
  createWorkspace,
  listActivity,
} from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  startAgentSession,
} from "../../cli/lib/store/sessions.js";
import type { ProjectRow, WorkspaceRow } from "../../cli/lib/store/types.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let roots: TmpRoot[] = [];

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("domain document store", () => {
  test("creates a scoped Document with no current revision", () => {
    const { workspace, project } = setupProject("create");
    const document = createDocument({
      projectId: project.id,
      kind: "brief",
      slug: "brief",
      title: "Brief",
    });

    expect(getDocument(document.id)).toEqual({
      ...document,
      currentRevision: null,
    });
    expect(() => getDocument("doc_missing")).toThrow(/Document not found/);
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
    expect(getDocument(document.id).currentRevision?.id).toBe(v2.id);
    expect(
      searchDocuments({ workspaceId: workspace.id, query: "periodontal" })
        .items,
    ).toEqual([]);
    expect(
      searchDocuments({
        projectId: project.id,
        query: "periodontal",
      }).items.map((row) => row.revisionId),
    ).toEqual([v2.id]);
    expect(
      searchDocuments({ projectId: project.id, query: "baselineunique" }).items,
    ).toEqual([]);
    expect(
      searchDocuments({ projectId: project.id, query: "shorter" }).items[0],
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
      searchDocuments({ projectId: project.id, query: "stale" }).items,
    ).toEqual([]);
    expect(
      listActivity({ projectId: project.id, limit: 100 })
        .filter((event) => event.entityId === document.id)
        .map((event) => event.action),
    ).toEqual(["document.created", "document.revised", "document.revised"]);
    expect(
      JSON.stringify(listActivity({ projectId: project.id, limit: 100 })),
    ).not.toContain("Periodontal education");
    expect(() =>
      openDomainDb()
        .prepare("UPDATE document_revisions SET body = 'changed' WHERE id = ?")
        .run(v1.id),
    ).toThrow(/immutable/i);
  });

  test("inherits Workspace Documents, shadows equal slugs, and paginates stable IDs", () => {
    const { workspace, project } = setupProject("visibility");
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
      listDocuments({ workspaceId: workspace.id })
        .items.map((row) => row.id)
        .sort(),
    ).toEqual([workspaceNote.id, workspaceStyle.id].sort());
    const visible = listDocuments({ projectId: project.id }).items;
    expect(visible.map((row) => row.id).sort()).toEqual(
      [workspaceNote.id, projectStyle.id, projectBrief.id].sort(),
    );
    expect(visible).not.toContainEqual(
      expect.objectContaining({ id: workspaceStyle.id }),
    );
    expect(
      searchDocuments({ projectId: project.id, query: "typography" })
        .items.map((row) => row.documentId)
        .sort(),
    ).toEqual([workspaceNote.id, projectStyle.id].sort());

    const first = listDocuments({ projectId: project.id, limit: 1 });
    const second = listDocuments({
      projectId: project.id,
      cursor: first.nextCursor,
      limit: 1,
    });
    expect(first.nextCursor).toBe(first.items[0]?.id);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect(() => listDocuments({ projectId: project.id, limit: 101 })).toThrow(
      /1 through 100/,
    );
    const firstSearch = searchDocuments({
      projectId: project.id,
      query: "typography",
      limit: 1,
    });
    const secondSearch = searchDocuments({
      projectId: project.id,
      query: "typography",
      cursor: firstSearch.nextCursor,
      limit: 1,
    });
    expect(firstSearch.nextCursor).toBe(firstSearch.items[0]?.revisionId);
    expect(secondSearch.items[0]?.revisionId).not.toBe(
      firstSearch.items[0]?.revisionId,
    );
    expect(() =>
      searchDocuments({ projectId: project.id, query: "typography", limit: 0 }),
    ).toThrow(/1 through 100/);
  });

  test("canonicalizes JSON and rejects embedded binary payloads without false positives", () => {
    const { project } = setupProject("json");
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

    expect(revision.body).toBe(canonicalBody);
    expect(revision.contentSha256).toBe(
      createHash("sha256").update(envelope).digest("hex"),
    );
    expect(
      reviseDocument({
        documentId: document.id,
        expectedHeadId: revision.id,
        format: "json",
        title: "Structured",
        body: '{"z":1,"nested":{"b":2,"a":[3,{"y":true,"x":null}]},"prose":"SGVsbG8="}',
      }).contentSha256,
    ).toBe(revision.contentSha256);
    expect(
      searchDocuments({ projectId: project.id, query: "SGVsbG8" }).items,
    ).toEqual([]);

    const rejectedBodies: unknown[] = [
      { value: Number.NaN },
      { value: Number.POSITIVE_INFINITY },
      { imageData: "SGVsbG8=" },
      { nested: { BLOB: ["SGVsbG8="] } },
      { value: "data:image/png;base64,SGVsbG8=" },
    ];
    let expectedHeadId = getDocument(document.id).currentRevision!.id;
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
    const { project } = setupProject("json-proto-key");
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

    expect(keyed.body).toBe('{"__proto__":"kept"}');
    expect(empty.body).toBe("{}");
    expect(keyed.contentSha256).not.toBe(empty.contentSha256);
  });

  test("accepts parsed scalar strings and serialized JSON string text", () => {
    const { project } = setupProject("json-string-inputs");
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

    expect(parsedScalar.body).toBe('"plain scalar"');
    expect(serializedString.body).toBe('"serialized scalar"');
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

    reviseDocument({
      documentId: projectDocument.id,
      iterationId: ownIteration.id,
      format: "text",
      body: "own",
    });
    expect(() =>
      reviseDocument({
        documentId: projectDocument.id,
        expectedHeadId: getDocument(projectDocument.id).currentRevisionId,
        iterationId: siblingIteration.id,
        format: "text",
        body: "sibling",
      }),
    ).toThrow(/Iteration.*scope/i);
    reviseDocument({
      documentId: workspaceDocument.id,
      iterationId: siblingIteration.id,
      format: "text",
      body: "same Workspace",
    });
    expect(() =>
      reviseDocument({
        documentId: workspaceDocument.id,
        expectedHeadId: getDocument(workspaceDocument.id).currentRevisionId,
        iterationId: otherIteration.id,
        format: "text",
        body: "other Workspace",
      }),
    ).toThrow(/Iteration.*scope/i);
  });

  test("binds exact revisions to Projects and Builds and rejects ownership or role conflicts", () => {
    const { workspace, project } = setupProject("binding-source");
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

    const projectBinding = bindProjectDocument({
      projectId: project.id,
      documentRevisionId: workspaceRevision.id,
      role: "style-guide",
    });
    const buildBinding = bindBuildDocument({
      buildId,
      documentRevisionId: projectRevision.id,
      role: "brief",
    });
    const buildWorkspaceBinding = bindBuildDocument({
      buildId,
      documentRevisionId: workspaceRevision.id,
      role: "style-guide",
    });
    expect(projectBinding.documentRevisionId).toBe(workspaceRevision.id);
    expect(buildBinding.documentRevisionId).toBe(projectRevision.id);
    expect(buildWorkspaceBinding.documentRevisionId).toBe(workspaceRevision.id);
    expect(
      listActivity({ projectId: project.id, limit: 100 }).filter(
        (event) => event.action === "document.bound",
      ),
    ).toHaveLength(3);
    expect(() =>
      bindProjectDocument({
        projectId: project.id,
        documentRevisionId: projectRevision.id,
        role: "style-guide",
      }),
    ).toThrow(/role/i);
    expect(() =>
      bindProjectDocument({
        projectId: project.id,
        documentRevisionId: siblingRevision.id,
        role: "sibling",
      }),
    ).toThrow(/scope/i);
    expect(() =>
      bindProjectDocument({
        projectId: project.id,
        documentRevisionId: otherRevision.id,
        role: "other",
      }),
    ).toThrow(/scope/i);
    expect(() =>
      bindBuildDocument({
        buildId,
        documentRevisionId: siblingRevision.id,
        role: "sibling",
      }),
    ).toThrow(/scope/i);
    expect(() =>
      bindBuildDocument({
        buildId,
        documentRevisionId: otherRevision.id,
        role: "other",
      }),
    ).toThrow(/scope/i);
    expect(() =>
      bindBuildDocument({
        buildId,
        documentRevisionId: workspaceRevision.id,
        role: "brief",
      }),
    ).toThrow(/role/i);
    expect(
      openDomainDb()
        .query(
          "SELECT document_revision_id FROM project_document_bindings WHERE id = ?",
        )
        .get(projectBinding.id),
    ).toEqual({ document_revision_id: workspaceRevision.id });
    expect(
      openDomainDb()
        .query(
          "SELECT document_revision_id FROM build_document_bindings WHERE id = ?",
        )
        .get(buildBinding.id),
    ).toEqual({ document_revision_id: projectRevision.id });
  });

  test("rolls back revision, head, FTS, and activity when activity insertion aborts", () => {
    const { project } = setupProject("rollback");
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
    const activityBefore = listActivity({ projectId: project.id, limit: 100 });
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
      expect(getDocument(document.id).currentRevisionId).toBe(v1.id);
      expect(
        db
          .query(
            "SELECT COUNT(*) AS count FROM document_revisions WHERE document_id = ?",
          )
          .get(document.id),
      ).toEqual({ count: 1 });
      expect(
        searchDocuments({ projectId: project.id, query: "stable" }).items.map(
          (row) => row.revisionId,
        ),
      ).toEqual([v1.id]);
      expect(
        searchDocuments({ projectId: project.id, query: "roll" }).items,
      ).toEqual([]);
      expect(listActivity({ projectId: project.id, limit: 100 })).toEqual(
        activityBefore,
      );
    } finally {
      db.exec("DROP TRIGGER IF EXISTS abort_document_revision_activity");
    }
  });

  test("contains revision authors in active Workspace and Project sessions", () => {
    const { workspace, project } = setupProject("authorship");
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
      activity: listActivity({ workspaceId: workspace.id, limit: 100 }).length,
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
    expect(getDocument(projectDocument.id).currentRevisionId).toBe(
      projectV2.id,
    );
    expect(getDocument(workspaceDocument.id).currentRevisionId).toBe(
      workspaceV1.id,
    );
    expect(
      openDomainDb()
        .query<{ count: number }, []>(
          "SELECT COUNT(*) AS count FROM document_revisions",
        )
        .get()!.count,
    ).toBe(before.revisions);
    expect(listActivity({ workspaceId: workspace.id, limit: 100 })).toHaveLength(
      before.activity,
    );
  });
});

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
