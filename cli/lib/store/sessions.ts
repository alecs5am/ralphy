import { Database } from "bun:sqlite";
import { appendActivity, assertLimit } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import {
  type AgentSessionRow,
  type JsonValue,
  type Page,
  StoreConflictError,
} from "./types.js";

type SessionDbRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  agent: string;
  metadata_json: string | null;
  started_at: number;
  ended_at: number | null;
};

const SESSION_COLUMNS =
  "id, workspace_id, project_id, agent, metadata_json, started_at, ended_at";

export function getStoreIdentity(): string {
  const row = openDomainDb()
    .query<{ storeId: string }, []>(
      "SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1",
    )
    .get();
  if (!row) throw new Error("Store identity is missing");
  return row.storeId;
}

export function startAgentSession(input: {
  workspaceId: string;
  projectId?: string | null;
  agent: string;
  metadata?: JsonValue | null;
}): AgentSessionRow {
  const agent = input.agent.trim();
  if (!agent) throw new Error("Agent label must not be empty");
  const metadata = canonicalMetadata(input.metadata);

  return withImmediateTransaction((db) => {
    assertSessionOwner(db, input.workspaceId, input.projectId ?? null);
    const id = newDomainId("session");
    const startedAt = Date.now();
    db.prepare(
      "INSERT INTO agent_sessions (id, workspace_id, project_id, agent, metadata_json, started_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      input.workspaceId,
      input.projectId ?? null,
      agent,
      metadata === null ? null : JSON.stringify(metadata),
      startedAt,
    );
    appendActivity(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      entityType: "agent_session",
      entityId: id,
      action: "agent_session.started",
      payload: { agent },
      createdAt: startedAt,
    });
    return getSessionRow(db, id)!;
  });
}

export function getAgentSession(id: string): AgentSessionRow {
  const session = getSessionRow(openDomainDb(), id);
  if (!session) throw new Error(`Agent Session not found: ${id}`);
  return session;
}

export function listAgentSessions(input: {
  workspaceId: string;
  projectId?: string;
  cursor?: string | null;
  limit?: number;
}): Page<AgentSessionRow> {
  const db = openDomainDb();
  assertSessionOwner(db, input.workspaceId, input.projectId ?? null);
  const limit = input.limit ?? 50;
  assertLimit(limit);
  if (input.cursor !== undefined && input.cursor !== null && !input.cursor) {
    throw new Error("Cursor must be a non-empty ID");
  }
  const cursor = input.cursor ?? "";
  const rows = input.projectId
    ? db
        .query<SessionDbRow, [string, string, string, number]>(
          `SELECT ${SESSION_COLUMNS} FROM agent_sessions
           WHERE workspace_id = ? AND project_id = ? AND id > ?
           ORDER BY id ASC LIMIT ?`,
        )
        .all(input.workspaceId, input.projectId, cursor, limit + 1)
    : db
        .query<SessionDbRow, [string, string, number]>(
          `SELECT ${SESSION_COLUMNS} FROM agent_sessions
           WHERE workspace_id = ? AND id > ? ORDER BY id ASC LIMIT ?`,
        )
        .all(input.workspaceId, cursor, limit + 1);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toSessionRow);
  return {
    items,
    nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
  };
}

export function endAgentSession(id: string): AgentSessionRow {
  return withImmediateTransaction((db) => {
    const session = getSessionRow(db, id);
    if (!session) throw new Error(`Agent Session not found: ${id}`);
    if (session.endedAt !== null) {
      throw new StoreConflictError("Agent Session is already ended");
    }
    const endedAt = Date.now();
    const result = db
      .prepare(
        "UPDATE agent_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
      )
      .run(endedAt, id);
    if (!result.changes) {
      throw new StoreConflictError("Agent Session is already ended");
    }
    appendActivity(db, {
      workspaceId: session.workspaceId,
      projectId: session.projectId,
      entityType: "agent_session",
      entityId: id,
      action: "agent_session.ended",
      payload: {},
      createdAt: endedAt,
    });
    return getSessionRow(db, id)!;
  });
}

export function assertActiveSessionScope(
  db: Database,
  sessionId: string,
  scope: { workspaceId: string; projectId: string | null },
): void {
  const session = getSessionRow(db, sessionId);
  if (!session) throw new Error(`Agent Session not found: ${sessionId}`);
  if (session.endedAt !== null) {
    throw new Error(`Agent Session is ended: ${sessionId}`);
  }
  const contained =
    session.workspaceId === scope.workspaceId &&
    (scope.projectId === null
      ? session.projectId === null
      : session.projectId === null || session.projectId === scope.projectId);
  if (!contained) {
    throw new Error("Agent Session does not contain the entity scope");
  }
}

function assertSessionOwner(
  db: Database,
  workspaceId: string,
  projectId: string | null,
): void {
  if (
    !db
      .query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?")
      .get(workspaceId)
  ) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
  if (projectId === null) return;
  const project = db
    .query<{ workspaceId: string }, [string]>(
      "SELECT workspace_id AS workspaceId FROM projects WHERE id = ?",
    )
    .get(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  if (project.workspaceId !== workspaceId) {
    throw new Error("Project does not belong to the Agent Session Workspace");
  }
}

function getSessionRow(db: Database, id: string): AgentSessionRow | null {
  const row = db
    .query<SessionDbRow, [string]>(
      `SELECT ${SESSION_COLUMNS} FROM agent_sessions WHERE id = ?`,
    )
    .get(id);
  return row ? toSessionRow(row) : null;
}

function toSessionRow(row: SessionDbRow): AgentSessionRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    agent: row.agent,
    metadata:
      row.metadata_json === null
        ? null
        : (JSON.parse(row.metadata_json) as JsonValue),
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function canonicalMetadata(
  value: JsonValue | null | undefined,
): JsonValue | null {
  return value === undefined || value === null
    ? null
    : canonicalJson(value, new Set<object>());
}

function canonicalJson(value: unknown, seen: Set<object>): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Agent Session metadata contains a non-finite number");
    return value;
  }
  if (typeof value !== "object") {
    throw new Error("Agent Session metadata must be JSON-compatible");
  }
  if (seen.has(value)) throw new Error("Agent Session metadata contains a cycle");
  seen.add(value);
  try {
    if (Array.isArray(value))
      return value.map((item) => canonicalJson(item, seen));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Agent Session metadata contains a non-JSON object");
    }
    const result = Object.create(null) as Record<string, JsonValue>;
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalJson(
        (value as Record<string, unknown>)[key],
        seen,
      );
    }
    return result;
  } finally {
    seen.delete(value);
  }
}
