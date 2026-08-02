import { Database } from "bun:sqlite";
import { openDomainDb } from "./db.js";
import type { ActivityEventRow, JsonValue } from "./types.js";

export type ActivityInput = {
  workspaceId?: string | null;
  projectId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  payload?: JsonValue;
  createdAt?: number;
};

type ActivityDbRow = {
  id: number;
  workspace_id: string | null;
  project_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  payload_json: string;
  created_at: number;
};

export function appendActivity(db: Database, input: ActivityInput): number {
  const result = db
    .prepare(
      "INSERT INTO activity_events (workspace_id, project_id, entity_type, entity_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.workspaceId ?? null,
      input.projectId ?? null,
      input.entityType,
      input.entityId,
      input.action,
      JSON.stringify(input.payload ?? {}),
      input.createdAt ?? Date.now(),
    );
  return Number(result.lastInsertRowid);
}

export function listActivity(input: {
  workspaceId?: string;
  projectId?: string;
  afterId?: number;
  limit?: number;
} = {}): ActivityEventRow[] {
  const afterId = input.afterId ?? 0;
  const limit = input.limit ?? 50;
  if (!Number.isInteger(afterId) || afterId < 0) {
    throw new Error("Activity afterId must be a non-negative integer");
  }
  assertLimit(limit);

  const clauses = ["id > ?"];
  const values: (number | string)[] = [afterId];
  if (input.workspaceId) {
    clauses.push("workspace_id = ?");
    values.push(input.workspaceId);
  }
  if (input.projectId) {
    clauses.push("project_id = ?");
    values.push(input.projectId);
  }
  values.push(limit);
  return openDomainDb()
    .query<ActivityDbRow, (number | string)[]>(
      `SELECT id, workspace_id, project_id, entity_type, entity_id, action, payload_json, created_at
       FROM activity_events WHERE ${clauses.join(" AND ")} ORDER BY id ASC LIMIT ?`,
    )
    .all(...values)
    .map(toActivityRow);
}

function toActivityRow(row: ActivityDbRow): ActivityEventRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    payload: JSON.parse(row.payload_json) as JsonValue,
    createdAt: row.created_at,
  };
}

export function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Limit must be an integer from 1 through 100");
  }
}
