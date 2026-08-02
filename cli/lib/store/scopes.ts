import { Database } from "bun:sqlite";
import { appendActivity, assertLimit } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import {
  type EntityReference,
  type FeedbackRow,
  type FeedbackTargetType,
  type IterationRow,
  type JsonValue,
  type Page,
  type ProjectRow,
  StoreConflictError,
  type SocialAccountRow,
  type TargetReference,
  type WorkspaceRow,
} from "./types.js";

export { listActivity } from "./activity.js";

export type CreateWorkspaceInput = {
  slug: string;
  name: string;
  metadata?: JsonValue | null;
};

export type UpdateWorkspaceInput = Partial<
  Pick<CreateWorkspaceInput, "slug" | "name" | "metadata">
>;

export type UpsertSocialAccountInput = {
  workspaceId: string;
  platform: string;
  externalId: string;
  displayName?: string | null;
  username?: string | null;
  config?: JsonValue | null;
};

export type CreateProjectInput = {
  workspaceId: string;
  slug: string;
  name: string;
  metadata?: JsonValue | null;
};

export type TransferProjectMetadataInput = {
  workspaceId: string;
  slug?: string;
};

export type CreateIterationInput = {
  projectId: string;
  title: string;
  reason?: string | null;
};

export type AddFeedbackInput = {
  iterationId: string;
  body: string;
  timecodeMs?: number | null;
  target?: TargetReference | EntityReference;
  targetType?: FeedbackTargetType;
  targetId?: string;
};

export type ResolveFeedbackInput = {
  note?: string | null;
  links?: Array<TargetReference | EntityReference>;
};

type WorkspaceDbRow = {
  id: string;
  slug: string;
  name: string;
  metadata_json: string | null;
  row_version: number;
  created_at: number;
  updated_at: number;
};

type SocialAccountDbRow = {
  id: string;
  workspace_id: string;
  platform: string;
  external_id: string;
  display_name: string | null;
  username: string | null;
  config_json: string | null;
  created_at: number;
  updated_at: number;
};

type ProjectDbRow = {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  state: ProjectRow["state"];
  metadata_json: string | null;
  row_version: number;
  created_at: number;
  updated_at: number;
};

type IterationDbRow = {
  id: string;
  project_id: string;
  number: number;
  title: string;
  reason: string | null;
  state: IterationRow["state"];
  created_at: number;
  closed_at: number | null;
};

type FeedbackDbRow = {
  id: string;
  iteration_id: string;
  target_type: FeedbackTargetType | null;
  target_id: string | null;
  timecode_ms: number | null;
  body: string;
  status: FeedbackRow["status"];
  resolution_note: string | null;
  created_at: number;
  resolved_at: number | null;
};

const WORKSPACE_COLUMNS =
  "id, slug, name, metadata_json, row_version, created_at, updated_at";
const PROJECT_COLUMNS =
  "id, workspace_id, slug, name, state, metadata_json, row_version, created_at, updated_at";
const ITERATION_COLUMNS =
  "id, project_id, number, title, reason, state, created_at, closed_at";
const FEEDBACK_COLUMNS =
  "id, iteration_id, target_type, target_id, timecode_ms, body, status, resolution_note, created_at, resolved_at";

export function createWorkspace(input: CreateWorkspaceInput): WorkspaceRow {
  return withImmediateTransaction((db) => {
    const id = newDomainId("ws");
    const now = Date.now();
    db.prepare(
      "INSERT INTO workspaces (id, slug, name, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, input.slug, input.name, serializeJson(input.metadata), now, now);
    appendActivity(db, {
      workspaceId: id,
      entityType: "workspace",
      entityId: id,
      action: "workspace.created",
      payload: { slug: input.slug },
      createdAt: now,
    });
    return getWorkspace(db, id)!;
  });
}

export function updateWorkspace(
  id: string,
  input: UpdateWorkspaceInput,
  expectedRowVersion: number,
): WorkspaceRow {
  const fields: string[] = [];
  const values: (string | null)[] = [];
  if (input.slug !== undefined) {
    fields.push("slug = ?");
    values.push(input.slug);
  }
  if (input.name !== undefined) {
    fields.push("name = ?");
    values.push(input.name);
  }
  if (input.metadata !== undefined) {
    fields.push("metadata_json = ?");
    values.push(serializeJson(input.metadata));
  }
  if (!fields.length) throw new Error("Workspace update requires a field");

  return withImmediateTransaction((db) => {
    const now = Date.now();
    const result = db
      .prepare(
        `UPDATE workspaces SET ${fields.join(", ")}, row_version = row_version + 1, updated_at = ? WHERE id = ? AND row_version = ?`,
      )
      .run(...values, now, id, expectedRowVersion);
    if (!result.changes) throw new StoreConflictError();
    appendActivity(db, {
      workspaceId: id,
      entityType: "workspace",
      entityId: id,
      action: "workspace.updated",
      payload: { fields: Object.keys(input) },
      createdAt: now,
    });
    return getWorkspace(db, id)!;
  });
}

export function listWorkspaces(input: {
  cursor?: string | null;
  limit?: number;
} = {}): Page<WorkspaceRow> {
  const limit = input.limit ?? 50;
  assertLimit(limit);
  const cursor = input.cursor ?? "";
  if (input.cursor !== undefined && input.cursor !== null && !input.cursor) {
    throw new Error("Cursor must be a non-empty ID");
  }
  const rows = openDomainDb()
    .query<WorkspaceDbRow, [string, number]>(
      `SELECT ${WORKSPACE_COLUMNS} FROM workspaces WHERE id > ? ORDER BY id ASC LIMIT ?`,
    )
    .all(cursor, limit + 1);
  return page(rows.map(toWorkspaceRow), limit);
}

export function upsertSocialAccount(
  input: UpsertSocialAccountInput,
): SocialAccountRow {
  assertPublicConfig(input.config);
  return withImmediateTransaction((db) => {
    const now = Date.now();
    const existing = db
      .query<{ id: string }, [string, string, string]>(
        `SELECT id FROM social_accounts
         WHERE workspace_id = ? AND platform = ? AND external_id = ?`,
      )
      .get(input.workspaceId, input.platform, input.externalId);
    if (existing) {
      db.prepare(
        `UPDATE social_accounts
         SET display_name = ?, username = ?, config_json = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        input.displayName ?? null,
        input.username ?? null,
        serializeJson(input.config),
        now,
        existing.id,
      );
    } else {
      db.prepare(
        `INSERT INTO social_accounts
         (id, workspace_id, platform, external_id, display_name, username,
          config_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newDomainId("acct"),
        input.workspaceId,
        input.platform,
        input.externalId,
        input.displayName ?? null,
        input.username ?? null,
        serializeJson(input.config),
        now,
        now,
      );
    }
    const account = db
      .query<SocialAccountDbRow, [string, string, string]>(
        "SELECT id, workspace_id, platform, external_id, display_name, username, config_json, created_at, updated_at FROM social_accounts WHERE workspace_id = ? AND platform = ? AND external_id = ?",
      )
      .get(input.workspaceId, input.platform, input.externalId);
    if (!account) throw new Error("Social account was not created");
    appendActivity(db, {
      workspaceId: input.workspaceId,
      entityType: "social_account",
      entityId: account.id,
      action: "social_account.upserted",
      payload: {
        platform: input.platform,
        externalId: input.externalId,
      },
      createdAt: now,
    });
    return toSocialAccountRow(account);
  });
}

export function listSocialAccounts(workspaceId: string): SocialAccountRow[] {
  return openDomainDb()
    .query<SocialAccountDbRow, [string]>(
      "SELECT id, workspace_id, platform, external_id, display_name, username, config_json, created_at, updated_at FROM social_accounts WHERE workspace_id = ? ORDER BY id ASC",
    )
    .all(workspaceId)
    .map(toSocialAccountRow);
}

export function createProject(input: CreateProjectInput): ProjectRow {
  return withImmediateTransaction((db) => {
    const id = newDomainId("prj");
    const now = Date.now();
    db.prepare(
      "INSERT INTO projects (id, workspace_id, slug, name, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      input.workspaceId,
      input.slug,
      input.name,
      serializeJson(input.metadata),
      now,
      now,
    );
    appendActivity(db, {
      workspaceId: input.workspaceId,
      projectId: id,
      entityType: "project",
      entityId: id,
      action: "project.created",
      payload: { slug: input.slug },
      createdAt: now,
    });
    return getProject(db, id)!;
  });
}

export function listProjects(
  input: { workspaceId: string; cursor?: string | null; limit?: number },
): Page<ProjectRow> {
  const limit = input.limit ?? 50;
  assertLimit(limit);
  const cursor = input.cursor ?? "";
  if (input.cursor !== undefined && input.cursor !== null && !input.cursor) {
    throw new Error("Cursor must be a non-empty ID");
  }
  const rows = openDomainDb()
    .query<ProjectDbRow, [string, string, number]>(
      `SELECT ${PROJECT_COLUMNS} FROM projects WHERE workspace_id = ? AND id > ? ORDER BY id ASC LIMIT ?`,
    )
    .all(input.workspaceId, cursor, limit + 1);
  return page(rows.map(toProjectRow), limit);
}

export function transferProjectMetadata(
  projectId: string,
  input: TransferProjectMetadataInput,
  expectedRowVersion: number,
): ProjectRow {
  return withImmediateTransaction((db) => {
    const before = getProject(db, projectId);
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
    const project = getProject(db, projectId)!;
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
    return project;
  });
}

export function createIteration(input: CreateIterationInput): IterationRow {
  return withImmediateTransaction((db) => {
    const project = getProject(db, input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    const number =
      db.query<{ number: number }, [string]>(
        "SELECT COALESCE(MAX(number), 0) + 1 AS number FROM project_iterations WHERE project_id = ?",
      ).get(input.projectId)?.number ?? 1;
    const id = newDomainId("iter");
    const now = Date.now();
    db.prepare(
      "INSERT INTO project_iterations (id, project_id, number, title, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, input.projectId, number, input.title, input.reason ?? null, now);
    appendActivity(db, {
      workspaceId: project.workspaceId,
      projectId: project.id,
      entityType: "iteration",
      entityId: id,
      action: "iteration.created",
      payload: { number },
      createdAt: now,
    });
    return getIteration(db, id)!;
  });
}

export function addFeedback(input: AddFeedbackInput): FeedbackRow {
  const target = targetFromInput(input);
  if (input.timecodeMs !== undefined && input.timecodeMs !== null && input.timecodeMs < 0) {
    throw new Error("Feedback timecode must not be negative");
  }
  return withImmediateTransaction((db) => {
    const scope = iterationScope(db, input.iterationId);
    if (!scope) throw new Error(`Iteration not found: ${input.iterationId}`);
    if (target && resolveTargetWorkspaceId(db, target) !== scope.workspaceId) {
      throw new Error("Feedback target belongs to a different workspace");
    }
    const id = newDomainId("fb");
    const now = Date.now();
    db.prepare(
      `INSERT INTO feedback_items (${FEEDBACK_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, 'open', NULL, ?, NULL)`,
    ).run(
      id,
      input.iterationId,
      target?.entityType ?? null,
      target?.entityId ?? null,
      input.timecodeMs ?? null,
      input.body,
      now,
    );
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "feedback",
      entityId: id,
      action: "feedback.created",
      payload: target ?? {},
      createdAt: now,
    });
    return getFeedback(db, id)!;
  });
}

export function resolveFeedback(
  feedbackId: string,
  input: ResolveFeedbackInput = {},
): FeedbackRow {
  const links = (input.links ?? []).map(normalizeReference);
  return withImmediateTransaction((db) => {
    const scope = feedbackScope(db, feedbackId);
    if (!scope) throw new Error(`Feedback not found: ${feedbackId}`);
    for (const link of links) {
      if (resolveTargetWorkspaceId(db, link) !== scope.workspaceId) {
        throw new Error("Feedback resolution link belongs to a different workspace");
      }
    }
    const now = Date.now();
    db.prepare(
      "UPDATE feedback_items SET status = 'resolved', resolution_note = ?, resolved_at = ? WHERE id = ?",
    ).run(input.note ?? null, now, feedbackId);
    for (const link of links) {
      db.prepare(
        "INSERT INTO feedback_resolution_links (id, feedback_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(newDomainId("fblink"), feedbackId, link.entityType, link.entityId, now);
    }
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "feedback",
      entityId: feedbackId,
      action: "feedback.resolved",
      payload: { linkCount: links.length },
      createdAt: now,
    });
    return getFeedback(db, feedbackId)!;
  });
}

function getWorkspace(db: Database, id: string): WorkspaceRow | null {
  const row = db
    .query<WorkspaceDbRow, [string]>(
      `SELECT ${WORKSPACE_COLUMNS} FROM workspaces WHERE id = ?`,
    )
    .get(id);
  return row ? toWorkspaceRow(row) : null;
}

function getProject(db: Database, id: string): ProjectRow | null {
  const row = db
    .query<ProjectDbRow, [string]>(
      `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`,
    )
    .get(id);
  return row ? toProjectRow(row) : null;
}

function getIteration(db: Database, id: string): IterationRow | null {
  const row = db
    .query<IterationDbRow, [string]>(
      `SELECT ${ITERATION_COLUMNS} FROM project_iterations WHERE id = ?`,
    )
    .get(id);
  return row ? toIterationRow(row) : null;
}

function getFeedback(db: Database, id: string): FeedbackRow | null {
  const row = db
    .query<FeedbackDbRow, [string]>(
      `SELECT ${FEEDBACK_COLUMNS} FROM feedback_items WHERE id = ?`,
    )
    .get(id);
  return row ? toFeedbackRow(row) : null;
}

function iterationScope(
  db: Database,
  iterationId: string,
): { workspaceId: string; projectId: string } | null {
  return db
    .query<{ workspaceId: string; projectId: string }, [string]>(
      `SELECT p.workspace_id AS workspaceId, p.id AS projectId
       FROM project_iterations i JOIN projects p ON p.id = i.project_id WHERE i.id = ?`,
    )
    .get(iterationId);
}

function feedbackScope(
  db: Database,
  feedbackId: string,
): { workspaceId: string; projectId: string } | null {
  return db
    .query<{ workspaceId: string; projectId: string }, [string]>(
      `SELECT p.workspace_id AS workspaceId, p.id AS projectId
       FROM feedback_items f
       JOIN project_iterations i ON i.id = f.iteration_id
       JOIN projects p ON p.id = i.project_id WHERE f.id = ?`,
    )
    .get(feedbackId);
}

function resolveTargetWorkspaceId(db: Database, target: EntityReference): string {
  const queries: Record<FeedbackTargetType, string> = {
    document_revision:
      "SELECT d.workspace_id AS workspaceId FROM document_revisions r JOIN documents d ON d.id = r.document_id WHERE r.id = ?",
    artifact_revision:
      "SELECT a.workspace_id AS workspaceId FROM artifact_revisions r JOIN artifacts a ON a.id = r.artifact_id WHERE r.id = ?",
    composition_revision:
      "SELECT p.workspace_id AS workspaceId FROM composition_revisions r JOIN compositions c ON c.id = r.composition_id JOIN projects p ON p.id = c.project_id WHERE r.id = ?",
    build:
      "SELECT p.workspace_id AS workspaceId FROM builds b JOIN composition_revisions r ON r.id = b.composition_revision_id JOIN compositions c ON c.id = r.composition_id JOIN projects p ON p.id = c.project_id WHERE b.id = ?",
    build_output:
      "SELECT p.workspace_id AS workspaceId FROM build_outputs o JOIN builds b ON b.id = o.build_id JOIN composition_revisions r ON r.id = b.composition_revision_id JOIN compositions c ON c.id = r.composition_id JOIN projects p ON p.id = c.project_id WHERE o.id = ?",
    unit_item:
      "SELECT p.workspace_id AS workspaceId FROM unit_items i JOIN unit_revisions r ON r.id = i.unit_revision_id JOIN units u ON u.id = r.unit_id JOIN projects p ON p.id = u.project_id WHERE i.id = ?",
    unit_presentation:
      "SELECT p.workspace_id AS workspaceId FROM unit_presentations x JOIN unit_revisions r ON r.id = x.unit_revision_id JOIN units u ON u.id = r.unit_id JOIN projects p ON p.id = u.project_id WHERE x.id = ?",
  };
  const row = db.query<{ workspaceId: string }, [string]>(queries[target.entityType]).get(target.entityId);
  if (!row) throw new Error(`Feedback target not found: ${target.entityType}:${target.entityId}`);
  return row.workspaceId;
}

function targetFromInput(input: AddFeedbackInput): EntityReference | null {
  if (input.target) return normalizeReference(input.target);
  if (input.targetType || input.targetId) {
    if (!input.targetType || !input.targetId) {
      throw new Error("Feedback target requires both targetType and targetId");
    }
    return { entityType: input.targetType, entityId: input.targetId };
  }
  return null;
}

function normalizeReference(
  reference: TargetReference | EntityReference,
): EntityReference {
  return "entityType" in reference
    ? reference
    : { entityType: reference.type, entityId: reference.id };
}

function serializeJson(value: JsonValue | null | undefined): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function assertPublicConfig(value: JsonValue | null | undefined): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) assertPublicConfig(item);
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (["apikey", "accesstoken", "refreshtoken", "token", "secret", "password", "credential"].includes(key.toLowerCase())) {
      throw new Error(`Social account config must not contain credential key: ${key}`);
    }
    assertPublicConfig(item);
  }
}

function page<T extends { id: string }>(items: T[], limit: number): Page<T> {
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  return {
    items: pageItems,
    nextCursor: hasMore ? pageItems.at(-1)?.id ?? null : null,
  };
}

function toWorkspaceRow(row: WorkspaceDbRow): WorkspaceRow {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    metadata: parseJson(row.metadata_json),
    rowVersion: row.row_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSocialAccountRow(row: SocialAccountDbRow): SocialAccountRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    platform: row.platform,
    externalId: row.external_id,
    displayName: row.display_name,
    username: row.username,
    config: parseJson(row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProjectRow(row: ProjectDbRow): ProjectRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    name: row.name,
    state: row.state,
    metadata: parseJson(row.metadata_json),
    rowVersion: row.row_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toIterationRow(row: IterationDbRow): IterationRow {
  return {
    id: row.id,
    projectId: row.project_id,
    number: row.number,
    title: row.title,
    reason: row.reason,
    state: row.state,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

function toFeedbackRow(row: FeedbackDbRow): FeedbackRow {
  return {
    id: row.id,
    iterationId: row.iteration_id,
    targetType: row.target_type,
    targetId: row.target_id,
    timecodeMs: row.timecode_ms,
    body: row.body,
    status: row.status,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function parseJson(value: string | null): JsonValue | null {
  return value === null ? null : (JSON.parse(value) as JsonValue);
}
