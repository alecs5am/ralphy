import type { Database } from "bun:sqlite";
import type { ConsumerAuthority } from "./consumer-auth.js";

/**
 * The read authority a bounded query runs under. A Session context derives the
 * same visibility as the explicit scope it was opened with, so no caller can
 * widen its reach by naming a Workspace it does not hold.
 */
export type QueryContext =
  | {
      sessionId: string;
      consumerAuthority?: ConsumerAuthority;
      workspaceId?: never;
      projectId?: never;
    }
  | {
      sessionId?: never;
      consumerAuthority?: never;
      workspaceId: string;
      projectId?: string;
    };

export type ResolvedScope = { workspaceId: string; projectId: string | null };

export function resolveQueryContext(
  db: Database,
  context: QueryContext,
): ResolvedScope {
  if (context.sessionId !== undefined) {
    const session = db
      .query<
        { workspaceId: string; projectId: string | null; endedAt: number | null },
        [string]
      >(
        `SELECT workspace_id AS workspaceId, project_id AS projectId,
                ended_at AS endedAt
         FROM agent_sessions WHERE id = ?`,
      )
      .get(context.sessionId);
    if (!session) {
      throw new Error(`Agent Session not found: ${context.sessionId}`);
    }
    if (session.endedAt !== null) {
      throw new Error(`Agent Session is ended: ${context.sessionId}`);
    }
    return { workspaceId: session.workspaceId, projectId: session.projectId };
  }
  if (typeof context.workspaceId !== "string" || context.workspaceId === "") {
    throw new Error("Query context requires a Session or a Workspace");
  }
  if (
    !db
      .query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?")
      .get(context.workspaceId)
  ) {
    throw new Error(`Workspace not found: ${context.workspaceId}`);
  }
  if (context.projectId === undefined) {
    return { workspaceId: context.workspaceId, projectId: null };
  }
  const project = db
    .query<{ workspaceId: string }, [string]>(
      "SELECT workspace_id AS workspaceId FROM projects WHERE id = ?",
    )
    .get(context.projectId);
  if (!project) throw new Error(`Project not found: ${context.projectId}`);
  if (project.workspaceId !== context.workspaceId) {
    throw new Error("Project does not belong to the context Workspace");
  }
  return { workspaceId: context.workspaceId, projectId: context.projectId };
}

/**
 * A Workspace context sees Workspace-owned and shared rows; a Project context
 * additionally sees that Project's rows, never a sibling Project's.
 */
export function scopeVisibilityClause(
  scope: ResolvedScope,
  workspaceColumn: string,
  projectColumn: string,
): { sql: string; values: string[] } {
  if (scope.projectId === null) {
    return {
      sql: `${workspaceColumn} = ? AND ${projectColumn} IS NULL`,
      values: [scope.workspaceId],
    };
  }
  return {
    sql: `${workspaceColumn} = ? AND (${projectColumn} IS NULL OR ${projectColumn} = ?)`,
    values: [scope.workspaceId, scope.projectId],
  };
}
