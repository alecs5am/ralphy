// Workspace evaluator configurations are typed JSON Document revisions. The
// stable Document owns identity; every save appends an immutable revision.

import { createDocument, reviseDocument } from "./store/documents.js";
import { openDomainDb } from "./store/db.js";
import {
  parseWorkspaceEvaluators,
  type WorkspaceEvaluatorsConfig,
} from "./schemas/workspace-evaluators.js";

const DOCUMENT_SLUG = "workspace-evaluators";

type EvaluatorDocumentRow = {
  workspaceId: string;
  documentId: string;
  revisionId: string;
  body: string;
};

function evaluatorDocument(workspace: string): EvaluatorDocumentRow | null {
  return openDomainDb()
    .query<EvaluatorDocumentRow, [string, string, string, string]>(
      `SELECT workspace.id AS workspaceId, document.id AS documentId,
              revision.id AS revisionId, revision.body
       FROM workspaces workspace
       JOIN documents document
         ON document.workspace_id = workspace.id
        AND document.project_id IS NULL
        AND document.slug = ?
       JOIN document_revisions revision
         ON revision.id = document.current_revision_id
       WHERE workspace.id = ? OR workspace.slug = ?
       ORDER BY CASE WHEN workspace.id = ? THEN 0 ELSE 1 END
       LIMIT 1`,
    )
    .get(DOCUMENT_SLUG, workspace, workspace, workspace);
}

function workspaceId(workspace: string): string {
  const row = openDomainDb()
    .query<{ id: string }, [string, string, string]>(
      `SELECT id FROM workspaces WHERE id = ? OR slug = ?
       ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1`,
    )
    .get(workspace, workspace, workspace);
  if (!row) throw new Error(`Workspace not found: ${workspace}`);
  return row.id;
}

function parseStoredConfig(
  workspace: string,
  raw: unknown,
): WorkspaceEvaluatorsConfig | null {
  try {
    return parseWorkspaceEvaluators(raw);
  } catch (err) {
    console.warn(
      `[workspace-evaluators] malformed evaluator config for workspace "${workspace}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

/**
 * Load the custom-evaluator config for a workspace. Returns null when none is
 * configured OR when the configured one is malformed (with a warning) — callers
 * treat null as "no custom rubric for this workspace".
 */
export async function loadWorkspaceEvaluators(
  workspaceSlug: string,
): Promise<WorkspaceEvaluatorsConfig | null> {
  return loadWorkspaceEvaluatorsSync(workspaceSlug);
}

export function saveWorkspaceEvaluators(
  workspace: string,
  input: unknown,
  options: { authoredBySessionId?: string | null } = {},
): { documentId: string; revisionId: string; revisionNo: number } {
  const config = parseWorkspaceEvaluators(input);
  const existing = evaluatorDocument(workspace);
  const resolvedWorkspaceId = existing?.workspaceId ?? workspaceId(workspace);
  const document = existing
    ? { id: existing.documentId }
    : createDocument({
        workspaceId: resolvedWorkspaceId,
        kind: "custom",
        slug: DOCUMENT_SLUG,
        title: "Workspace evaluators",
      });
  const revision = reviseDocument({
    documentId: document.id,
    expectedHeadId: existing?.revisionId ?? null,
    format: "json",
    body: JSON.stringify(config),
    authoredBySessionId: options.authoredBySessionId ?? null,
  });
  return {
    documentId: document.id,
    revisionId: revision.id,
    revisionNo: revision.revisionNo,
  };
}

/**
 * Synchronous sibling of `loadWorkspaceEvaluators` (#472). It reads the
 * current SQL Document revision and returns null for an absent or malformed
 * rubric. The production contract calls this from synchronous gate checks.
 */
export function loadWorkspaceEvaluatorsSync(
  workspaceSlug: string,
): WorkspaceEvaluatorsConfig | null {
  const row = evaluatorDocument(workspaceSlug);
  if (!row) return null;
  try {
    return parseStoredConfig(workspaceSlug, JSON.parse(row.body));
  } catch (err) {
    return parseStoredConfig(workspaceSlug, err);
  }
}
