import { afterEach, describe, expect, test } from "bun:test";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  addFeedback,
  createIteration,
  createProject,
  createWorkspace,
  listActivity,
  listProjects,
  listSocialAccounts,
  listWorkspaces,
  resolveFeedback,
  transferProjectMetadata,
  upsertSocialAccount,
  updateWorkspace,
} from "../../cli/lib/store/scopes.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let roots: TmpRoot[] = [];

function makeRoot(): TmpRoot {
  const root = makeTmpRoot("ralphy-domain-scopes");
  roots.push(root);
  return root;
}

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("domain scope stores", () => {
  test("creates scoped work and records its activity atomically", () => {
    makeRoot();
    const workspace = createWorkspace({ slug: "denti-ai", name: "Denti.AI" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "perio-pitch",
      name: "Perio pitch",
    });
    const iteration = createIteration({
      projectId: project.id,
      title: "Client corrections",
      reason: "feedback",
    });
    addFeedback({ iterationId: iteration.id, body: "Shorten the opening." });

    expect(project.workspaceId).toBe(workspace.id);
    expect(() =>
      createProject({
        workspaceId: workspace.id,
        slug: "perio-pitch",
        name: "Duplicate",
      }),
    ).toThrow();
    expect(() =>
      updateWorkspace(workspace.id, { name: "Stale" }, workspace.rowVersion - 1),
    ).toThrow(/conflict/i);
    expect(
      listActivity({ projectId: project.id, afterId: 0, limit: 20 }).map(
        (event) => event.action,
      ),
    ).toEqual(["project.created", "iteration.created", "feedback.created"]);
  });

  test("paginates scopes, rejects secret account config, and resumes activity", () => {
    makeRoot();
    const workspaces = ["one", "two", "three"].map((slug) =>
      createWorkspace({ slug, name: slug }),
    );
    const firstWorkspacePage = listWorkspaces({ limit: 2 });
    expect(firstWorkspacePage.items).toHaveLength(2);
    expect(firstWorkspacePage.nextCursor).toBe(firstWorkspacePage.items[1]?.id);
    const secondWorkspacePage = listWorkspaces({
      cursor: firstWorkspacePage.nextCursor,
      limit: 2,
    });
    expect([...firstWorkspacePage.items, ...secondWorkspacePage.items].map((workspace) => workspace.id).sort()).toEqual(
      workspaces.map((workspace) => workspace.id).sort(),
    );
    expect(() => listWorkspaces({ limit: 0 })).toThrow(/1 through 100/);

    const projectOne = createProject({
      workspaceId: workspaces[0]!.id,
      slug: "one",
      name: "One",
    });
    const projectTwo = createProject({
      workspaceId: workspaces[0]!.id,
      slug: "two",
      name: "Two",
    });
    const firstProjectPage = listProjects({ workspaceId: workspaces[0]!.id, limit: 1 });
    const secondProjectPage = listProjects({
      workspaceId: workspaces[0]!.id,
      cursor: firstProjectPage.nextCursor,
      limit: 1,
    });
    expect([...firstProjectPage.items, ...secondProjectPage.items].map((project) => project.id).sort()).toEqual(
      [projectOne.id, projectTwo.id].sort(),
    );

    const account = upsertSocialAccount({
      workspaceId: workspaces[0]!.id,
      platform: "youtube",
      externalId: "channel-1",
      config: { profile: { color: "blue" } },
    });
    expect(listSocialAccounts(workspaces[0]!.id)).toEqual([account]);
    expect(() =>
      upsertSocialAccount({
        workspaceId: workspaces[0]!.id,
        platform: "youtube",
        externalId: "channel-2",
        config: { nested: { accessToken: "must-not-persist" } },
      }),
    ).toThrow(/credential/i);
    expect(listSocialAccounts(workspaces[0]!.id)).toHaveLength(1);
    expect(JSON.stringify(listActivity({ workspaceId: workspaces[0]!.id, afterId: 0, limit: 100 }))).not.toContain(
      "must-not-persist",
    );

    const events = listActivity({ workspaceId: workspaces[0]!.id, afterId: 0, limit: 100 });
    expect(listActivity({ workspaceId: workspaces[0]!.id, afterId: events[0]!.id, limit: 100 })).toEqual(
      events.slice(1),
    );
    expect(() => createProject({ workspaceId: "ws_missing", slug: "nope", name: "Nope" })).toThrow();
    expect(() => createIteration({ projectId: "prj_missing", title: "Nope" })).toThrow(/not found/i);
  });

  test("transfers project metadata only with the current row version", () => {
    makeRoot();
    const source = createWorkspace({ slug: "source", name: "Source" });
    const destination = createWorkspace({ slug: "destination", name: "Destination" });
    const project = createProject({ workspaceId: source.id, slug: "pitch", name: "Pitch" });

    expect(() =>
      transferProjectMetadata(project.id, { workspaceId: destination.id }, project.rowVersion - 1),
    ).toThrow(/conflict/i);
    const transferred = transferProjectMetadata(
      project.id,
      { workspaceId: destination.id, slug: "moved-pitch" },
      project.rowVersion,
    );
    expect(transferred).toMatchObject({
      workspaceId: destination.id,
      slug: "moved-pitch",
      rowVersion: project.rowVersion + 1,
    });
    expect(listActivity({ projectId: project.id, afterId: 0, limit: 20 }).at(-1)).toMatchObject({
      action: "project.transferred",
      payload: { fromWorkspaceId: source.id, toWorkspaceId: destination.id },
    });
  });

  test("validates exact feedback targets and rolls back cross-workspace feedback", () => {
    makeRoot();
    const workspace = createWorkspace({ slug: "source", name: "Source" });
    const project = createProject({ workspaceId: workspace.id, slug: "source", name: "Source" });
    const iteration = createIteration({ projectId: project.id, title: "Round" });
    const otherWorkspace = createWorkspace({ slug: "other", name: "Other" });
    const otherProject = createProject({ workspaceId: otherWorkspace.id, slug: "other", name: "Other" });
    insertDocumentRevision("drev_source", "doc_source", workspace.id, project.id);
    insertDocumentRevision("drev_other", "doc_other", otherWorkspace.id, otherProject.id);

    const feedback = addFeedback({
      iterationId: iteration.id,
      body: "Use the exact revision.",
      target: { type: "document_revision", id: "drev_source" },
    });
    const beforeFailure = openDomainDb().query("SELECT COUNT(*) AS count FROM feedback_items").get() as { count: number };
    const beforeActivity = listActivity({ projectId: project.id, afterId: 0, limit: 100 });
    expect(() =>
      addFeedback({
        iterationId: iteration.id,
        body: "Wrong workspace.",
        target: { type: "document_revision", id: "drev_other" },
      }),
    ).toThrow(/different workspace/);
    expect(openDomainDb().query("SELECT COUNT(*) AS count FROM feedback_items").get()).toEqual(beforeFailure);
    expect(listActivity({ projectId: project.id, afterId: 0, limit: 100 })).toEqual(beforeActivity);

    const resolved = resolveFeedback(feedback.id, {
      note: "Fixed in revision.",
      links: [{ entityType: "document_revision", entityId: "drev_source" }],
    });
    expect(resolved).toMatchObject({ status: "resolved", resolutionNote: "Fixed in revision." });
    expect(
      openDomainDb()
        .query("SELECT entity_type, entity_id FROM feedback_resolution_links WHERE feedback_id = ?")
        .all(feedback.id),
    ).toEqual([{ entity_type: "document_revision", entity_id: "drev_source" }]);
  });

  test("lets an otherwise empty workspace cascade its social accounts", () => {
    makeRoot();
    const db = openDomainDb();
    db.prepare("INSERT INTO workspaces (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
      "ws_fixture",
      "fixture",
      "Fixture",
      1,
      1,
    );
    db.prepare("INSERT INTO social_accounts (id, workspace_id, platform, external_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      "acct_fixture",
      "ws_fixture",
      "youtube",
      "fixture",
      1,
      1,
    );

    db.prepare("DELETE FROM workspaces WHERE id = ?").run("ws_fixture");
    expect(db.query("SELECT id FROM social_accounts WHERE id = 'acct_fixture'").get()).toBeNull();
  });
});

function insertDocumentRevision(
  revisionId: string,
  documentId: string,
  workspaceId: string,
  projectId: string,
): void {
  const db = openDomainDb();
  db.prepare("INSERT INTO documents (id, workspace_id, project_id, kind, slug, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    documentId,
    workspaceId,
    projectId,
    "brief",
    documentId,
    documentId,
    1,
    1,
  );
  db.prepare("INSERT INTO document_revisions (id, document_id, revision_no, format, body, content_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    revisionId,
    documentId,
    1,
    "markdown",
    "Body",
    "a".repeat(64),
    1,
  );
}
