import { afterEach, describe, expect, test } from "bun:test";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  addFeedback,
  createIteration,
  createProject,
  createWorkspace,
  getProject,
  getWorkspace,
  listProjects,
  listSocialAccounts,
  listWorkspaces,
  resolveFeedback,
  upsertSocialAccount,
  updateProject,
  updateSocialAccountCredential,
  updateWorkspace,
} from "../../cli/lib/store/scopes.js";
import { credentialSecretRef } from "../../cli/lib/providers/credentials.js";
import { transferProjectMetadata } from "../../cli/lib/store/internal-scope-mutations.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { scopedActivity } from "../helpers/activity.js";
import { listActivity } from "../../cli/lib/store/activity.js";
import { decodeCursor } from "../../cli/lib/store/pagination.js";

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
  test("links and clears an account credential optimistically without exposing its ref", () => {
    makeRoot();
    const workspace = createWorkspace({ slug: "account-auth", name: "Account auth" });
    const outside = createWorkspace({ slug: "account-auth-outside", name: "Outside" });
    const account = upsertSocialAccount({
      workspaceId: workspace.id,
      platform: "postiz",
      externalId: "postiz-account",
    });
    const ref = credentialSecretRef("postiz", {
      kind: "scope",
      workspaceId: workspace.id,
      accountId: account.id,
    });
    openDomainDb()
      .prepare(
        `UPDATE social_accounts
         SET credential_ref = ?, relink_required = 1, row_version = row_version + 1
         WHERE id = ?`,
      )
      .run(ref, account.id);

    expect(listSocialAccounts({ workspaceId: workspace.id }).items[0]).toMatchObject({
      credentialConfigured: true,
      credentialSource: "encrypted",
      relinkRequired: true,
      rowVersion: 2,
    });
    const linked = updateSocialAccountCredential({
      workspaceId: workspace.id,
      accountId: account.id,
      credentialRef: ref,
      expectedRowVersion: 2,
    });
    expect(linked).toMatchObject({
      credentialConfigured: true,
      credentialSource: "encrypted",
      relinkRequired: false,
      rowVersion: 3,
    });
    expect(JSON.stringify(linked)).not.toContain(ref);
    expect(() =>
      updateSocialAccountCredential({
        workspaceId: workspace.id,
        accountId: account.id,
        credentialRef: ref,
        expectedRowVersion: 2,
      }),
    ).toThrow();
    expect(() =>
      updateSocialAccountCredential({
        workspaceId: outside.id,
        accountId: account.id,
        credentialRef: ref,
        expectedRowVersion: 3,
      }),
    ).toThrow();
    const cleared = updateSocialAccountCredential({
      workspaceId: workspace.id,
      accountId: account.id,
      credentialRef: null,
      expectedRowVersion: 3,
    });
    expect(cleared).toMatchObject({
      credentialConfigured: false,
      credentialSource: "missing",
      relinkRequired: false,
      rowVersion: 4,
    });
    expect(JSON.stringify(cleared)).not.toContain("credentialRef");
  });
  test("returns a safe Workspace DTO while persisting update metadata", () => {
    makeRoot();
    const workspace = createWorkspace({
      slug: "workspace-mutation",
      name: "Workspace mutation",
      metadata: { privateNote: "old" },
    });

    const updated = updateWorkspace(
      workspace.id,
      { name: "Updated workspace", metadata: { privateNote: "new" } },
      workspace.rowVersion,
    );

    expect(Object.keys(updated).sort()).toEqual([
      "createdAt",
      "id",
      "name",
      "rowVersion",
      "slug",
      "updatedAt",
    ]);
    expect(
      openDomainDb()
        .query<{ metadata: string | null }, [string]>(
          "SELECT metadata_json AS metadata FROM workspaces WHERE id = ?",
        )
        .get(workspace.id)?.metadata,
    ).toBe('{"privateNote":"new"}');
  });

  test("returns a safe Social Account DTO while persisting public config", () => {
    makeRoot();
    const workspace = createWorkspace({
      slug: "account-mutation",
      name: "Account mutation",
    });

    const account = upsertSocialAccount({
      workspaceId: workspace.id,
      platform: "youtube",
      externalId: "channel-safe",
      displayName: "Safe channel",
      username: "safe-channel",
      config: { profile: { color: "blue" } },
    });

    expect(Object.keys(account).sort()).toEqual([
      "createdAt",
      "credentialConfigured",
      "credentialSource",
      "displayName",
      "externalId",
      "id",
      "platform",
      "relinkRequired",
      "rowVersion",
      "updatedAt",
      "username",
      "workspaceId",
    ]);
    expect(account).toMatchObject({
      credentialConfigured: false,
      credentialSource: "missing",
      relinkRequired: false,
      rowVersion: 1,
    });
    openDomainDb()
      .prepare(
        `UPDATE social_accounts
         SET credential_ref = ?, relink_required = 1, row_version = row_version + 1
         WHERE id = ?`,
      )
      .run(
        `provider/postiz/workspace/${workspace.id}/account/${account.id}`,
        account.id,
      );
    const configured = listSocialAccounts({
      workspaceId: workspace.id,
      limit: 10,
    }).items[0]!;
    expect(configured).toMatchObject({
      credentialConfigured: true,
      credentialSource: "encrypted",
      relinkRequired: true,
      rowVersion: 2,
    });
    expect(JSON.stringify(configured)).not.toContain("credential_ref");
    expect(JSON.stringify(configured)).not.toContain("provider/postiz");
    expect(
      openDomainDb()
        .query<{ config: string | null }, [string]>(
          "SELECT config_json AS config FROM social_accounts WHERE id = ?",
        )
        .get(account.id)?.config,
    ).toBe('{"profile":{"color":"blue"}}');
  });

  test("canonicalizes structurally safe social config and rejects normalized credentials", () => {
    makeRoot();
    const workspace = createWorkspace({
      slug: "account-public-config",
      name: "Account public config",
    });
    const account = upsertSocialAccount({
      workspaceId: workspace.id,
      platform: "youtube",
      externalId: "public-config",
      config: {
        profile: {
          platformUrl: "https://example.test/channel",
          requestId: "public-request",
          errorStyle: "inline",
          error: "visible profile state",
        },
        display: { color: "blue" },
      },
    });
    const db = openDomainDb();
    const storedConfig = db
      .query<{ config: string }, [string]>(
        "SELECT config_json AS config FROM social_accounts WHERE id = ?",
      )
      .get(account.id)?.config;
    const missed: string[] = [];

    for (const [index, key] of [
      "api_key",
      "access-token",
      "refresh.token",
      "ａｐｉ＿ｋｅｙ",
    ].entries()) {
      try {
        upsertSocialAccount({
          workspaceId: workspace.id,
          platform: "youtube",
          externalId: `rejected-${index}`,
          config: { nested: { [key]: "must-not-persist" } },
        });
        missed.push(`credential ${key}`);
      } catch (error) {
        if (!/credential/i.test(String(error))) throw error;
      }
    }

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const sparse: unknown[] = [];
    sparse.length = 1;
    for (const value of [
      { value: undefined },
      { value: Number.NaN },
      { value: 1n },
      { value: new Date(0) },
      cyclic,
      sparse,
      JSON.parse('{"__proto__":{"token":"must-not-persist"}}'),
      JSON.parse('{"\\ud800":1}'),
    ]) {
      try {
        upsertSocialAccount({
          workspaceId: workspace.id,
          platform: "youtube",
          externalId: "structurally-invalid",
          config: value as never,
        });
        missed.push("structural value");
      } catch (error) {
        if (!/social account config/i.test(String(error))) {
          missed.push(`structural error: ${String(error)}`);
        }
      }
    }
    expect(storedConfig).toBe(
      '{"display":{"color":"blue"},"profile":{"error":"visible profile state","errorStyle":"inline","platformUrl":"https://example.test/channel","requestId":"public-request"}}',
    );
    expect(missed).toEqual([]);
    expect(
      db.query("SELECT id FROM social_accounts WHERE external_id LIKE 'rejected-%'").all(),
    ).toEqual([]);
    expect(
      db.query("SELECT id FROM social_accounts WHERE external_id = 'structurally-invalid'").all(),
    ).toEqual([]);
  });

  test("shows safe Workspace and Workspace-scoped Project summaries", () => {
    makeRoot();
    const workspace = createWorkspace({
      slug: "safe",
      name: "Safe",
      metadata: { privateNote: "not a DTO field" },
    });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "safe-project",
      name: "Safe project",
      metadata: { privateNote: "not a DTO field" },
    });
    const otherWorkspace = createWorkspace({ slug: "other", name: "Other" });

    expect(getWorkspace(workspace.id)).toEqual({
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      rowVersion: workspace.rowVersion,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    });
    expect(getProject({ workspaceId: workspace.id, projectId: project.id })).toEqual({
      id: project.id,
      workspaceId: workspace.id,
      slug: project.slug,
      name: project.name,
      state: project.state,
      rowVersion: project.rowVersion,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
    expect(() =>
      getProject({ workspaceId: otherWorkspace.id, projectId: project.id }),
    ).toThrow(/not found/i);
    expect(() => getWorkspace("ws_missing")).toThrow(/not found/i);
  });

  test("updates only mutable Project fields with optimistic concurrency", () => {
    makeRoot();
    const workspace = createWorkspace({ slug: "project-update", name: "Project update" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "draft",
      name: "Draft",
      metadata: { privateNote: "old" },
    });

    const updated = updateProject(
      project.id,
      {
        slug: "approved",
        name: "Approved",
        state: "archived",
        metadata: { privateNote: "new" },
      },
      project.rowVersion,
    );

    expect(updated).toEqual({
      id: project.id,
      workspaceId: workspace.id,
      slug: "approved",
      name: "Approved",
      state: "archived",
      rowVersion: project.rowVersion + 1,
      createdAt: project.createdAt,
      updatedAt: expect.any(Number),
    });
    expect(
      openDomainDb()
        .query<{ metadata: string | null }, [string]>(
          "SELECT metadata_json AS metadata FROM projects WHERE id = ?",
        )
        .get(project.id)?.metadata,
    ).toBe('{"privateNote":"new"}');
    expect(() =>
      updateProject(project.id, { name: "Stale" }, project.rowVersion),
    ).toThrow(/conflict/i);
    expect(scopedActivity({ projectId: project.id }).at(-1)).toMatchObject({
      workspaceId: workspace.id,
      projectId: project.id,
      entityType: "project",
      entityId: project.id,
      action: "project.updated",
    });
  });

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
      scopedActivity({ projectId: project.id,}).map(
        (event) => event.action,
      ),
    ).toEqual(["project.created", "iteration.created", "feedback.created"]);
  });

  test("paginates scopes, rejects secret account config, and resumes activity", () => {
    makeRoot();
    const workspaces = ["one", "two", "three"].map((slug) =>
      createWorkspace({ slug, name: slug }),
    );
    const db = openDomainDb();
    const [lowWorkspace, middleWorkspace, highWorkspace] = [...workspaces].sort(
      (left, right) => left.id.localeCompare(right.id),
    );
    db.prepare("UPDATE workspaces SET created_at = ? WHERE id = ?").run(1000, highWorkspace!.id);
    db.prepare("UPDATE workspaces SET created_at = ? WHERE id IN (?, ?)").run(
      2000,
      lowWorkspace!.id,
      middleWorkspace!.id,
    );
    const firstWorkspacePage = listWorkspaces({ limit: 2 });
    expect(firstWorkspacePage.items.map((workspace) => workspace.id)).toEqual([
      highWorkspace!.id,
      lowWorkspace!.id,
    ]);
    expect(decodeCursor("c1", firstWorkspacePage.nextCursor!)).toEqual({
      ordinal: 2000,
      id: lowWorkspace!.id,
    });
    expect(Object.keys(firstWorkspacePage.items[0]!).sort()).toEqual([
      "createdAt",
      "id",
      "name",
      "rowVersion",
      "slug",
      "updatedAt",
    ]);
    const insertedWorkspaceId = `${lowWorkspace!.id}!`;
    db.prepare(
      `INSERT INTO workspaces
       (id, slug, name, created_at, updated_at)
       VALUES (?, 'between-pages', 'Between pages', 2000, 2000)`,
    ).run(insertedWorkspaceId);
    const secondWorkspacePage = listWorkspaces({
      cursor: firstWorkspacePage.nextCursor,
      limit: 2,
    });
    expect(secondWorkspacePage.items.map((workspace) => workspace.id)).toEqual([
      insertedWorkspaceId,
      middleWorkspace!.id,
    ]);
    expect(secondWorkspacePage.nextCursor).toBeNull();
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
    const [lowProject, highProject] = [projectOne, projectTwo].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    db.prepare("UPDATE projects SET created_at = ? WHERE id = ?").run(2000, highProject!.id);
    db.prepare("UPDATE projects SET created_at = ? WHERE id = ?").run(3000, lowProject!.id);
    const firstProjectPage = listProjects({ workspaceId: workspaces[0]!.id, limit: 1 });
    expect(firstProjectPage.items.map((project) => project.id)).toEqual([highProject!.id]);
    expect(decodeCursor("c1", firstProjectPage.nextCursor!)).toEqual({
      ordinal: 2000,
      id: highProject!.id,
    });
    expect(Object.keys(firstProjectPage.items[0]!).sort()).toEqual([
      "createdAt",
      "id",
      "name",
      "rowVersion",
      "slug",
      "state",
      "updatedAt",
      "workspaceId",
    ]);
    const secondProjectPage = listProjects({
      workspaceId: workspaces[0]!.id,
      cursor: firstProjectPage.nextCursor,
      limit: 1,
    });
    expect(secondProjectPage.items.map((project) => project.id)).toEqual([lowProject!.id]);

    const account = upsertSocialAccount({
      workspaceId: workspaces[0]!.id,
      platform: "youtube",
      externalId: "channel-1",
      config: { profile: { color: "blue" } },
    });
    const secondAccount = {
      id: "acct_!",
      workspaceId: workspaces[0]!.id,
      platform: "tiktok",
      externalId: "channel-2",
      displayName: null,
      username: null,
      createdAt: account.createdAt + 1,
      updatedAt: account.updatedAt + 1,
    };
    db.prepare(
      `INSERT INTO social_accounts
       (id, workspace_id, platform, external_id, display_name, username,
        config_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      secondAccount.id,
      secondAccount.workspaceId,
      secondAccount.platform,
      secondAccount.externalId,
      secondAccount.displayName,
      secondAccount.username,
      secondAccount.createdAt,
      secondAccount.updatedAt,
    );
    const accounts = listSocialAccounts({ workspaceId: workspaces[0]!.id, limit: 1 });
    expect(accounts.items).toEqual([
      {
        id: account.id,
        workspaceId: account.workspaceId,
        platform: account.platform,
        externalId: account.externalId,
        displayName: account.displayName,
        username: account.username,
        credentialConfigured: false,
        credentialSource: "missing",
        relinkRequired: false,
        rowVersion: 1,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      },
    ]);
    expect(decodeCursor("c1", accounts.nextCursor!)).toEqual({
      ordinal: account.createdAt,
      id: account.id,
    });
    expect(
      listSocialAccounts({
        workspaceId: workspaces[0]!.id,
        cursor: accounts.nextCursor,
        limit: 1,
      }).items.map((item) => item.id),
    ).toEqual([secondAccount.id]);
    expect(() =>
      upsertSocialAccount({
        workspaceId: workspaces[0]!.id,
        platform: "youtube",
        externalId: "channel-2",
        config: { nested: { accessToken: "must-not-persist" } },
      }),
    ).toThrow(/credential/i);
    expect(listSocialAccounts({ workspaceId: workspaces[0]!.id, limit: 100 }).items).toHaveLength(2);
    expect(JSON.stringify(scopedActivity({ workspaceId: workspaces[0]!.id,}))).not.toContain(
      "must-not-persist",
    );

    const events = scopedActivity({ workspaceId: workspaces[0]!.id });
    expect(
      listActivity({ afterSequence: events[0]!.sequence, limit: 100 }).items.filter(
        (event) => event.workspaceId === workspaces[0]!.id,
      ),
    ).toEqual(events.slice(1));
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
    expect(transferred).toEqual({
      id: project.id,
      workspaceId: destination.id,
      slug: "moved-pitch",
      name: project.name,
      state: project.state,
      rowVersion: project.rowVersion + 1,
      createdAt: project.createdAt,
      updatedAt: expect.any(Number),
    });
    expect(scopedActivity({ projectId: project.id }).at(-1)).toMatchObject({
      action: "project.transferred",
      entityType: "project",
      entityId: project.id,
      workspaceId: destination.id,
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
    const beforeActivity = scopedActivity({ projectId: project.id,});
    expect(() =>
      addFeedback({
        iterationId: iteration.id,
        body: "Wrong workspace.",
        target: { type: "document_revision", id: "drev_other" },
      }),
    ).toThrow(/different workspace/);
    expect(openDomainDb().query("SELECT COUNT(*) AS count FROM feedback_items").get()).toEqual(beforeFailure);
    expect(scopedActivity({ projectId: project.id,})).toEqual(beforeActivity);

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

  test("rolls back state when activity insertion aborts", () => {
    makeRoot();
    const db = openDomainDb();
    db.exec(`
      CREATE TRIGGER abort_workspace_activity
      BEFORE INSERT ON activity_events
      BEGIN
        SELECT RAISE(ABORT, 'activity abort');
      END
    `);

    try {
      expect(() => createWorkspace({ slug: "aborted", name: "Aborted" })).toThrow(
        "activity abort",
      );
      expect(db.query("SELECT id FROM workspaces WHERE slug = 'aborted'").get()).toBeNull();
      expect(db.query("SELECT id FROM activity_events").all()).toEqual([]);
    } finally {
      db.exec("DROP TRIGGER IF EXISTS abort_workspace_activity");
    }
  });

  test("rolls back feedback resolution links and state when validation or activity fails", () => {
    makeRoot();
    const workspace = createWorkspace({ slug: "resolution-source", name: "Source" });
    const project = createProject({ workspaceId: workspace.id, slug: "source", name: "Source" });
    const iteration = createIteration({ projectId: project.id, title: "Round" });
    const feedback = addFeedback({ iterationId: iteration.id, body: "Resolve me." });
    const otherWorkspace = createWorkspace({ slug: "resolution-other", name: "Other" });
    const otherProject = createProject({ workspaceId: otherWorkspace.id, slug: "other", name: "Other" });
    insertDocumentRevision("drev_resolution_source", "doc_resolution_source", workspace.id, project.id);
    insertDocumentRevision("drev_resolution_other", "doc_resolution_other", otherWorkspace.id, otherProject.id);
    const beforeValidationActivity = scopedActivity({ projectId: project.id,});

    expect(() =>
      resolveFeedback(feedback.id, {
        links: [{ entityType: "document_revision", entityId: "drev_resolution_missing" }],
      }),
    ).toThrow(/target not found/);
    expect(feedbackState(feedback.id)).toEqual({ status: "open", resolution_note: null });
    expect(resolutionLinks(feedback.id)).toEqual([]);
    expect(scopedActivity({ projectId: project.id,})).toEqual(
      beforeValidationActivity,
    );

    expect(() =>
      resolveFeedback(feedback.id, {
        links: [{ entityType: "document_revision", entityId: "drev_resolution_other" }],
      }),
    ).toThrow(/different workspace/);
    expect(feedbackState(feedback.id)).toEqual({ status: "open", resolution_note: null });
    expect(resolutionLinks(feedback.id)).toEqual([]);
    expect(scopedActivity({ projectId: project.id,})).toEqual(
      beforeValidationActivity,
    );

    dbWithAbortActivity(() =>
      expect(() =>
        resolveFeedback(feedback.id, {
          note: "This must roll back.",
          links: [{ entityType: "document_revision", entityId: "drev_resolution_source" }],
        }),
      ).toThrow("activity abort"),
    );
    expect(feedbackState(feedback.id)).toEqual({ status: "open", resolution_note: null });
    expect(resolutionLinks(feedback.id)).toEqual([]);
    expect(scopedActivity({ projectId: project.id,})).toEqual(
      beforeValidationActivity,
    );
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

function feedbackState(feedbackId: string): {
  status: string;
  resolution_note: string | null;
} {
  return openDomainDb()
    .query("SELECT status, resolution_note FROM feedback_items WHERE id = ?")
    .get(feedbackId) as { status: string; resolution_note: string | null };
}

function resolutionLinks(feedbackId: string): unknown[] {
  return openDomainDb()
    .query("SELECT entity_type, entity_id FROM feedback_resolution_links WHERE feedback_id = ?")
    .all(feedbackId);
}

function dbWithAbortActivity(run: () => void): void {
  const db = openDomainDb();
  db.exec(`
    CREATE TRIGGER abort_resolution_activity
    BEFORE INSERT ON activity_events
    BEGIN
      SELECT RAISE(ABORT, 'activity abort');
    END
  `);
  try {
    run();
  } finally {
    db.exec("DROP TRIGGER IF EXISTS abort_resolution_activity");
  }
}
