import { afterEach, describe, expect, test } from "bun:test";
import {
  closeDomainDb,
  openDomainDb,
} from "../../cli/lib/store/db.js";
import {
  decodeCursor,
  encodeCursor,
} from "../../cli/lib/store/pagination.js";
import {
  endAgentSession,
  getAgentSession,
  getStoreIdentity,
  listAgentSessions,
  startAgentSession,
  startConsumerSession,
} from "../../cli/lib/store/sessions.js";
import {
  createProject,
  createWorkspace,
} from "../../cli/lib/store/scopes.js";
import {
  type AgentSessionDto,
  StoreConflictError,
} from "../../cli/lib/store/types.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { installConsumer } from "../helpers/consumer-auth.js";
import { scopedActivity } from "../helpers/activity.js";

let roots: TmpRoot[] = [];

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("domain Agent Session store", () => {
  test("keeps one path-independent store identity across reopen", () => {
    roots.push(makeTmpRoot("ralphy-domain-store-identity"));
    const first = getStoreIdentity();

    closeDomainDb();

    expect(getStoreIdentity()).toBe(first);
    expect(first).toMatch(/^store_[0-9a-f]{32}$/);
    expect(() =>
      openDomainDb().exec("UPDATE store_metadata SET store_id = 'changed'"),
    ).toThrow(/identity.*immutable/i);
  });

  test("returns metadata-free Session DTOs while retaining canonical metadata", () => {
    roots.push(makeTmpRoot("ralphy-domain-sessions-safe-dto"));
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const started = startAgentSession({
      workspaceId: workspace.id,
      agent: "codex",
      metadata: { secret: "private", order: { z: 2, a: 1 } },
    });

    expect(Object.keys(started).sort()).toEqual([
      "agent",
      "endedAt",
      "id",
      "projectId",
      "startedAt",
      "workspaceId",
    ]);
    expect(getAgentSession(started.id)).toEqual(started);
    expect(
      openDomainDb()
        .query<{ metadata: string }, [string]>(
          "SELECT metadata_json AS metadata FROM agent_sessions WHERE id = ?",
        )
        .get(started.id),
    ).toEqual({ metadata: '{"order":{"a":1,"z":2},"secret":"private"}' });

    const ended = endAgentSession(started.id);
    expect(Object.keys(ended).sort()).toEqual(Object.keys(started).sort());
    expect(ended.endedAt).toBeNumber();
    expect(JSON.stringify(ended)).not.toContain("private");
  });

  test("returns a metadata-free DTO when starting a consumer Session", () => {
    const root = makeTmpRoot("ralphy-domain-consumer-session-safe-dto");
    roots.push(root);
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const consumer = installConsumer(root);

    const session: AgentSessionDto = startConsumerSession(consumer.authority, {
      workspaceId: workspace.id,
      metadata: { mode: "private" },
    });

    expect(Object.keys(session).sort()).toEqual([
      "agent",
      "endedAt",
      "id",
      "projectId",
      "startedAt",
      "workspaceId",
    ]);
    expect(session.agent).toBe("consumer:test");
    expect(
      openDomainDb()
        .query<{ metadata: string }, [string]>(
          "SELECT metadata_json AS metadata FROM agent_sessions WHERE id = ?",
        )
        .get(session.id),
    ).toEqual({ metadata: '{"mode":"private"}' });
  });

  test("pages Sessions by chronological c1 order with exact safe list DTOs", () => {
    roots.push(makeTmpRoot("ralphy-domain-sessions-c1"));
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const outside = createWorkspace({ slug: "outside", name: "Outside" });
    const db = openDomainDb();
    const insert = db.prepare(
      `INSERT INTO agent_sessions
       (id, workspace_id, project_id, agent, metadata_json, started_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insert.run(
      "session_z_old",
      workspace.id,
      null,
      "shared",
      '{"secret":"chronology-private"}',
      100,
    );
    insert.run(
      "session_a_new",
      workspace.id,
      project.id,
      "project",
      '{"secret":"project-private"}',
      200,
    );
    insert.run("session_b_new", workspace.id, sibling.id, "sibling", null, 200);
    insert.run("session_0_other", outside.id, null, "outside", null, 50);

    const first = listAgentSessions({ workspaceId: workspace.id, limit: 1 });
    const second = listAgentSessions({
      workspaceId: workspace.id,
      cursor: first.nextCursor,
      limit: 1,
    });
    const third = listAgentSessions({
      workspaceId: workspace.id,
      cursor: second.nextCursor,
      limit: 1,
    });
    expect(first.items).toEqual([
      {
        id: "session_z_old",
        workspaceId: workspace.id,
        projectId: null,
        agent: "shared",
        startedAt: 100,
        endedAt: null,
      },
    ]);
    expect(Object.keys(first.items[0]!).sort()).toEqual([
      "agent",
      "endedAt",
      "id",
      "projectId",
      "startedAt",
      "workspaceId",
    ]);
    expect(JSON.stringify(first.items)).not.toContain("chronology-private");
    expect(
      db
        .query<{ metadata: string }, [string]>(
          "SELECT metadata_json AS metadata FROM agent_sessions WHERE id = ?",
        )
        .get("session_z_old"),
    ).toEqual({ metadata: '{"secret":"chronology-private"}' });
    expect(decodeCursor("c1", first.nextCursor!)).toEqual({
      ordinal: 100,
      id: "session_z_old",
    });
    expect(second.items.map((item) => item.id)).toEqual(["session_a_new"]);
    expect(decodeCursor("c1", second.nextCursor!)).toEqual({
      ordinal: 200,
      id: "session_a_new",
    });
    expect(third.items.map((item) => item.id)).toEqual(["session_b_new"]);
    expect(third.nextCursor).toBeNull();
    expect(
      listAgentSessions({
        workspaceId: workspace.id,
        projectId: project.id,
      }).items.map((item) => item.id),
    ).toEqual(["session_a_new"]);
  });

  test("rejects Session cursor families and limits outside 1 through 100", () => {
    roots.push(makeTmpRoot("ralphy-domain-sessions-c1-bounds"));
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    for (const limit of [0, 101, 1.5]) {
      expect(() => listAgentSessions({ workspaceId: workspace.id, limit })).toThrow(
        "Limit must be an integer from 1 through 100",
      );
    }
    expect(() =>
      listAgentSessions({
        workspaceId: workspace.id,
        cursor: encodeCursor("v1", { ordinal: 100, id: "session_a" }),
        limit: 1,
      }),
    ).toThrow("Cursor family is invalid");
  });

  test("starts, pages, reads, and ends immutable scoped sessions", () => {
    roots.push(makeTmpRoot("ralphy-domain-sessions-lifecycle"));
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const outsideWorkspace = createWorkspace({
      slug: "outside",
      name: "Outside",
    });
    const outsideProject = createProject({
      workspaceId: outsideWorkspace.id,
      slug: "outside",
      name: "Outside",
    });

    expect(() =>
      startAgentSession({ workspaceId: workspace.id, agent: " " }),
    ).toThrow(/agent.*empty/i);
    expect(() =>
      startAgentSession({
        workspaceId: workspace.id,
        projectId: outsideProject.id,
        agent: "codex",
      }),
    ).toThrow(/Project.*Workspace/i);
    expect(() =>
      startAgentSession({
        workspaceId: workspace.id,
        agent: "codex",
        metadata: { invalid: Number.NaN },
      }),
    ).toThrow(/metadata.*finite/i);
    expect(() =>
      openDomainDb()
        .prepare(
          "INSERT INTO agent_sessions (id, workspace_id, agent, started_at, ended_at) VALUES ('session_closed_direct', ?, 'direct', ?, ?)",
        )
        .run(workspace.id, Date.now(), Date.now()),
    ).toThrow(/start open/i);

    const workspaceSession = startAgentSession({
      workspaceId: workspace.id,
      agent: " codex ",
      metadata: { z: 2, a: 1 },
    });
    const projectSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "claude-code",
      metadata: { mode: "review" },
    });

    expect(workspaceSession).toMatchObject({
      workspaceId: workspace.id,
      projectId: null,
      agent: "codex",
      endedAt: null,
    });
    expect(getAgentSession(projectSession.id)).toEqual(projectSession);
    expect(
      openDomainDb()
        .query<{ metadata: string }, [string]>(
          "SELECT metadata_json AS metadata FROM agent_sessions WHERE id = ?",
        )
        .get(workspaceSession.id),
    ).toEqual({ metadata: '{"a":1,"z":2}' });

    const first = listAgentSessions({ workspaceId: workspace.id, limit: 1 });
    const second = listAgentSessions({
      workspaceId: workspace.id,
      cursor: first.nextCursor,
      limit: 1,
    });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toStartWith("c1.");
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((row) => row.id))).toEqual(
      new Set([workspaceSession.id, projectSession.id]),
    );
    expect(
      listAgentSessions({
        workspaceId: workspace.id,
        projectId: project.id,
      }).items.map((row) => row.id),
    ).toEqual([projectSession.id]);

    const db = openDomainDb();
    for (const sql of [
      `UPDATE agent_sessions SET workspace_id = '${outsideWorkspace.id}' WHERE id = '${projectSession.id}'`,
      `UPDATE agent_sessions SET project_id = NULL WHERE id = '${projectSession.id}'`,
      `UPDATE agent_sessions SET agent = 'other' WHERE id = '${projectSession.id}'`,
      `UPDATE agent_sessions SET metadata_json = '{}' WHERE id = '${projectSession.id}'`,
      `UPDATE agent_sessions SET started_at = started_at + 1 WHERE id = '${projectSession.id}'`,
    ]) {
      expect(() => db.exec(sql)).toThrow(/session.*immutable/i);
    }

    const ended = endAgentSession(projectSession.id);
    expect(ended.endedAt).toBeNumber();
    expect(() => endAgentSession(projectSession.id)).toThrow(StoreConflictError);
    expect(
      scopedActivity({ workspaceId: workspace.id })
        .filter((event) => event.entityType === "agent_session")
        .map((event) => event.action),
    ).toEqual([
      "agent_session.started",
      "agent_session.started",
      "agent_session.ended",
    ]);
  });

  test("rejects malformed cursors and Project filters outside the Workspace", () => {
    roots.push(makeTmpRoot("ralphy-domain-sessions-filters"));
    const workspace = createWorkspace({ slug: "one", name: "One" });
    const outside = createWorkspace({ slug: "two", name: "Two" });
    const outsideProject = createProject({
      workspaceId: outside.id,
      slug: "outside",
      name: "Outside",
    });

    expect(() =>
      listAgentSessions({ workspaceId: workspace.id, cursor: "" }),
    ).toThrow(/cursor/i);
    expect(() =>
      listAgentSessions({ workspaceId: workspace.id, limit: 0 }),
    ).toThrow(/limit/i);
    expect(() =>
      listAgentSessions({
        workspaceId: workspace.id,
        projectId: outsideProject.id,
      }),
    ).toThrow(/Project.*Workspace/i);
  });

  test("guards every provenance column for direct SQLite consumers", () => {
    roots.push(makeTmpRoot("ralphy-domain-sessions-sql"));
    const workspace = createWorkspace({ slug: "guarded", name: "Guarded" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "project",
      name: "Project",
    });
    const sibling = createProject({
      workspaceId: workspace.id,
      slug: "sibling",
      name: "Sibling",
    });
    const workspaceSession = startAgentSession({
      workspaceId: workspace.id,
      agent: "workspace-agent",
    });
    const siblingSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: sibling.id,
      agent: "sibling-agent",
    });
    const endedSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: project.id,
      agent: "ended-agent",
    });
    endAgentSession(endedSession.id);
    const db = openDomainDb();
    const now = Date.now();

    db.prepare(
      "INSERT INTO documents (id, workspace_id, project_id, kind, slug, title, created_at, updated_at) VALUES ('doc_guard', ?, ?, 'note', 'guard', 'Guard', ?, ?)",
    ).run(workspace.id, project.id, now, now);
    db.prepare(
      "INSERT INTO objects (id, workspace_id, project_id, backend, bucket, key, sha256, mime, bytes, storage_class, created_at) VALUES ('obj_guard', ?, ?, 'local', 'b', 'k', ?, 'application/octet-stream', 1, 'working', ?)",
    ).run(workspace.id, project.id, "0".repeat(64), now);
    db.prepare(
      "INSERT INTO artifacts (id, workspace_id, project_id, slug, kind, created_at, updated_at) VALUES ('art_guard', ?, ?, 'guard', 'data', ?, ?)",
    ).run(workspace.id, project.id, now, now);
    db.prepare(
      "INSERT INTO compositions (id, project_id, slug, kind, created_at, updated_at) VALUES ('comp_guard', ?, 'guard', 'video', ?, ?)",
    ).run(project.id, now, now);
    db.prepare(
      "INSERT INTO units (id, workspace_id, project_id, slug, format, created_at, updated_at) VALUES ('unit_guard', ?, ?, 'guard', 'video', ?, ?)",
    ).run(workspace.id, project.id, now, now);

    const attempts: Array<() => unknown> = [
      () =>
        db.prepare(
          "INSERT INTO document_revisions (id, document_id, revision_no, format, body, content_sha256, authored_by_session_id, created_at) VALUES ('drev_guard', 'doc_guard', 1, 'text', 'x', ?, ?, ?)",
        ).run("1".repeat(64), siblingSession.id, now),
      () =>
        db.prepare(
          "INSERT INTO artifact_revisions (id, artifact_id, object_id, revision_no, state, authored_by_session_id, created_at) VALUES ('arev_guard', 'art_guard', 'obj_guard', 1, 'working', ?, ?)",
        ).run(siblingSession.id, now),
      () =>
        db.prepare(
          "INSERT INTO composition_revisions (id, composition_id, revision_no, engine, authored_by_session_id, created_at) VALUES ('crev_guard', 'comp_guard', 1, 'fixture', ?, ?)",
        ).run(siblingSession.id, now),
      () =>
        db.prepare(
          "INSERT INTO unit_revisions (id, unit_id, revision_no, authored_by_session_id, created_at) VALUES ('urev_guard', 'unit_guard', 1, ?, ?)",
        ).run(endedSession.id, now),
      () =>
        db.prepare(
          "INSERT INTO runs (id, agent_session_id, kind, state, created_at) VALUES ('run_guard', ?, 'migration', 'pending', ?)",
        ).run(workspaceSession.id, now),
    ];

    for (const attempt of attempts) {
      expect(attempt).toThrow(/active Agent Session.*scope/i);
    }
    expect(
      db
        .query<{ count: number }, []>(
          `SELECT
             (SELECT COUNT(*) FROM document_revisions) +
             (SELECT COUNT(*) FROM artifact_revisions) +
             (SELECT COUNT(*) FROM composition_revisions) +
             (SELECT COUNT(*) FROM unit_revisions) +
             (SELECT COUNT(*) FROM runs) AS count`,
        )
        .get(),
    ).toEqual({ count: 0 });
  });
});
