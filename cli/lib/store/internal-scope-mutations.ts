import { appendActivity } from "./activity.js";
import { withImmediateTransaction } from "./db.js";
import { getProject } from "./scopes.js";
import {
  type ProjectSummaryDto,
  StoreConflictError,
} from "./types.js";

export type TransferProjectMetadataInput = {
  workspaceId: string;
  slug?: string;
};

/**
 * Internal half of the journaled Project transfer flow. The caller must move
 * the bucket first; ordinary commands and public bridge methods cannot invoke
 * this metadata-only mutation.
 */
export function transferProjectMetadata(
  projectId: string,
  input: TransferProjectMetadataInput,
  expectedRowVersion: number,
): ProjectSummaryDto {
  return withImmediateTransaction((db) => {
    const before = db
      .query<{ workspaceId: string }, [string]>(
        "SELECT workspace_id AS workspaceId FROM projects WHERE id = ?",
      )
      .get(projectId);
    const now = Date.now();
    const result = input.slug === undefined
      ? db
          .prepare(
            "UPDATE projects SET workspace_id = ?, row_version = row_version + 1, updated_at = ? WHERE id = ? AND row_version = ?",
          )
          .run(input.workspaceId, now, projectId, expectedRowVersion)
      : db
          .prepare(
            "UPDATE projects SET workspace_id = ?, slug = ?, row_version = row_version + 1, updated_at = ? WHERE id = ? AND row_version = ?",
          )
          .run(input.workspaceId, input.slug, now, projectId, expectedRowVersion);
    if (!result.changes) throw new StoreConflictError();
    appendActivity(db, {
      workspaceId: input.workspaceId,
      projectId,
      entityType: "project",
      entityId: projectId,
      action: "project.transferred",
      payload: {
        fromWorkspaceId: before?.workspaceId ?? null,
        toWorkspaceId: input.workspaceId,
      },
      createdAt: now,
    });
    return getProject({ workspaceId: input.workspaceId, projectId });
  });
}
