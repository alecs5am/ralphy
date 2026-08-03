import { Database } from "bun:sqlite";
import { appendActivity } from "./activity.js";
import { canonicalSocialAccountConfig } from "./canonical-json.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import { assertLimit, buildPage, decodeCursor } from "./pagination.js";
import {
  resolveQueryContext,
  type QueryContext,
  type ResolvedScope,
} from "./scope-context.js";
import {
  type IterationRow,
  type ProjectRow,
  type WorkspaceRow,
} from "./internal-types.js";
import {
  type EntityReference,
  type FeedbackDto,
  type FeedbackResolutionLinkDto,
  type FeedbackTargetType,
  type IterationDto,
  type JsonValue,
  type Page,
  type OverviewAccountDto,
  type ProjectState,
  type ProjectStageDto,
  type ProjectSummaryDto,
  StoreConflictError,
  type TargetReference,
  type WorkspaceSummaryDto,
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

export type UpdateProjectInput = Partial<
  Pick<CreateProjectInput, "slug" | "name" | "metadata">
> & { state?: ProjectState };

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

const WORKSPACE_COLUMNS =
  "id, slug, name, metadata_json, row_version, created_at, updated_at";
const PROJECT_COLUMNS =
  "id, workspace_id, slug, name, state, metadata_json, row_version, created_at, updated_at";
const ITERATION_COLUMNS =
  "id, project_id, number, title, reason, state, created_at, closed_at";
const FEEDBACK_COLUMNS =
  "id, iteration_id, target_type, target_id, timecode_ms, body, status, resolution_note, created_at, resolved_at";
const FEEDBACK_DTO_SELECT = `SELECT feedback.id AS id,
       iteration.project_id AS projectId, feedback.iteration_id AS iterationId,
       feedback.target_type AS targetType, feedback.target_id AS targetId,
       feedback.timecode_ms AS timecodeMs, feedback.body AS body,
       feedback.status AS status, feedback.resolution_note AS resolutionNote,
       feedback.created_at AS createdAt, feedback.resolved_at AS resolvedAt
  FROM feedback_items feedback
  JOIN project_iterations iteration ON iteration.id = feedback.iteration_id`;
const FEEDBACK_RESOLUTION_LINK_SELECT = `SELECT link.id AS id,
       iteration.project_id AS projectId, link.feedback_id AS feedbackId,
       link.entity_type AS entityType, link.entity_id AS entityId,
       link.created_at AS createdAt
  FROM feedback_resolution_links link
  JOIN feedback_items feedback ON feedback.id = link.feedback_id
  JOIN project_iterations iteration ON iteration.id = feedback.iteration_id`;
const PROJECT_STAGE_DTO_SELECT = `SELECT id, project_id AS projectId, stage, state,
       entity_type AS entityType, entity_id AS entityId,
       row_version AS rowVersion, updated_at AS updatedAt
  FROM project_stages`;

export function createWorkspace(input: CreateWorkspaceInput): WorkspaceSummaryDto {
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
    return toWorkspaceSummaryDto(getWorkspaceRow(db, id)!);
  });
}

export function updateWorkspace(
  id: string,
  input: UpdateWorkspaceInput,
  expectedRowVersion: number,
): WorkspaceSummaryDto {
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
    return getWorkspace(id);
  });
}

export function getWorkspace(id: string): WorkspaceSummaryDto {
  const workspace = openDomainDb()
    .query<WorkspaceSummaryDto, [string]>(
      `SELECT id, slug, name, row_version AS rowVersion,
              created_at AS createdAt, updated_at AS updatedAt
       FROM workspaces WHERE id = ?`,
    )
    .get(id);
  if (!workspace) throw new Error(`Workspace not found: ${id}`);
  return workspace;
}

export function listWorkspaces(input: {
  cursor?: string | null;
  limit?: number;
} = {}): Page<WorkspaceSummaryDto> {
  const limit = input.limit ?? 50;
  assertLimit(limit);
  const values: (string | number)[] = [];
  let after = "";
  if (input.cursor != null) {
    const cursor = decodeCursor("c1", input.cursor);
    after = "WHERE (created_at > ? OR (created_at = ? AND id > ?))";
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(limit + 1);
  const rows = openDomainDb()
    .query<WorkspaceSummaryDto, (string | number)[]>(
      `SELECT id, slug, name, row_version AS rowVersion,
              created_at AS createdAt, updated_at AS updatedAt
       FROM workspaces ${after} ORDER BY created_at ASC, id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows, limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function upsertSocialAccount(
  input: UpsertSocialAccountInput,
): OverviewAccountDto {
  const config =
    input.config == null ? null : canonicalSocialAccountConfig(input.config);
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
        serializeJson(config),
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
        serializeJson(config),
        now,
        now,
      );
    }
    const account = db
      .query<OverviewAccountDto, [string, string, string]>(
        `SELECT id, workspace_id AS workspaceId, platform,
                external_id AS externalId, display_name AS displayName, username,
                created_at AS createdAt, updated_at AS updatedAt
         FROM social_accounts
         WHERE workspace_id = ? AND platform = ? AND external_id = ?`,
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
    return account;
  });
}

export function listSocialAccounts(input: {
  workspaceId: string;
  cursor?: string | null;
  limit?: number;
}): Page<OverviewAccountDto> {
  const limit = input.limit ?? 50;
  assertLimit(limit);
  const clauses = ["workspace_id = ?"];
  const values: (string | number)[] = [input.workspaceId];
  if (input.cursor != null) {
    const cursor = decodeCursor("c1", input.cursor);
    clauses.push("(created_at > ? OR (created_at = ? AND id > ?))");
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(limit + 1);
  const rows = openDomainDb()
    .query<OverviewAccountDto, (string | number)[]>(
      `SELECT id, workspace_id AS workspaceId, platform,
              external_id AS externalId, display_name AS displayName, username,
              created_at AS createdAt, updated_at AS updatedAt
       FROM social_accounts WHERE ${clauses.join(" AND ")}
       ORDER BY created_at ASC, id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows, limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function createProject(input: CreateProjectInput): ProjectSummaryDto {
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
    return toProjectSummaryDto(getProjectRow(db, id)!);
  });
}

export function updateProject(
  id: string,
  input: UpdateProjectInput,
  expectedRowVersion: number,
): ProjectSummaryDto {
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
  if (input.state !== undefined) {
    fields.push("state = ?");
    values.push(input.state);
  }
  if (input.metadata !== undefined) {
    fields.push("metadata_json = ?");
    values.push(serializeJson(input.metadata));
  }
  if (!fields.length) throw new Error("Project update requires a field");

  return withImmediateTransaction((db) => {
    const now = Date.now();
    const result = db
      .prepare(
        `UPDATE projects SET ${fields.join(", ")}, row_version = row_version + 1, updated_at = ? WHERE id = ? AND row_version = ?`,
      )
      .run(...values, now, id, expectedRowVersion);
    if (!result.changes) throw new StoreConflictError();
    const project = getProjectRow(db, id)!;
    appendActivity(db, {
      workspaceId: project.workspaceId,
      projectId: id,
      entityType: "project",
      entityId: id,
      action: "project.updated",
      payload: { fields: Object.keys(input) },
      createdAt: now,
    });
    return toProjectSummaryDto(project);
  });
}

export function getProject(input: {
  workspaceId: string;
  projectId: string;
}): ProjectSummaryDto {
  const project = openDomainDb()
    .query<ProjectSummaryDto, [string, string]>(
      `SELECT id, workspace_id AS workspaceId, slug, name, state,
              row_version AS rowVersion, created_at AS createdAt,
              updated_at AS updatedAt
       FROM projects WHERE workspace_id = ? AND id = ?`,
    )
    .get(input.workspaceId, input.projectId);
  if (!project) throw new Error(`Project not found: ${input.projectId}`);
  return project;
}

export function listProjects(
  input: { workspaceId: string; cursor?: string | null; limit?: number },
): Page<ProjectSummaryDto> {
  const limit = input.limit ?? 50;
  assertLimit(limit);
  const clauses = ["workspace_id = ?"];
  const values: (string | number)[] = [input.workspaceId];
  if (input.cursor != null) {
    const cursor = decodeCursor("c1", input.cursor);
    clauses.push("(created_at > ? OR (created_at = ? AND id > ?))");
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(limit + 1);
  const rows = openDomainDb()
    .query<ProjectSummaryDto, (string | number)[]>(
      `SELECT id, workspace_id AS workspaceId, slug, name, state,
              row_version AS rowVersion, created_at AS createdAt,
              updated_at AS updatedAt
       FROM projects WHERE ${clauses.join(" AND ")}
       ORDER BY created_at ASC, id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows, limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function createIteration(input: CreateIterationInput): IterationDto {
  return withImmediateTransaction((db) => {
    const project = getProjectRow(db, input.projectId);
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
    return toIterationDto(getIterationRow(db, id)!);
  });
}

export function addFeedback(input: AddFeedbackInput): FeedbackDto {
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
    return getFeedbackDto(db, id)!;
  });
}

export function resolveFeedback(
  feedbackId: string,
  input: ResolveFeedbackInput = {},
): FeedbackDto {
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
    return getFeedbackDto(db, feedbackId)!;
  });
}

export function getIteration(input: {
  context: QueryContext;
  iterationId: string;
}): IterationDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const row = db
    .query<IterationDto, [string]>(
      `SELECT id, project_id AS projectId, number, title, reason, state,
              created_at AS createdAt, closed_at AS closedAt
       FROM project_iterations WHERE id = ?`,
    )
    .get(input.iterationId);
  if (!row || !canReadProject(db, scope, row.projectId)) {
    throw new Error(`Iteration not found: ${input.iterationId}`);
  }
  return row;
}

export function listIterations(input: {
  context: QueryContext;
  projectId: string;
  after?: string | null;
  limit: number;
}): Page<IterationDto> {
  assertLimit(input.limit);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!canReadProject(db, scope, input.projectId)) {
    throw new Error(`Project not found: ${input.projectId}`);
  }
  const clauses = ["project_id = ?"];
  const values: (string | number)[] = [input.projectId];
  appendCreationCursor(clauses, values, input.after);
  values.push(input.limit + 1);
  const rows = db
    .query<IterationDto, (string | number)[]>(
      `SELECT id, project_id AS projectId, number, title, reason, state,
              created_at AS createdAt, closed_at AS closedAt
       FROM project_iterations WHERE ${clauses.join(" AND ")}
       ORDER BY created_at ASC, id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function getFeedback(input: {
  context: QueryContext;
  feedbackId: string;
}): FeedbackDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const row = db
    .query<FeedbackDto, [string]>(
      `${FEEDBACK_DTO_SELECT}
       WHERE feedback.id = ?`,
    )
    .get(input.feedbackId);
  if (!row || !canReadProject(db, scope, row.projectId)) {
    throw new Error(`Feedback not found: ${input.feedbackId}`);
  }
  return row;
}

export function listFeedback(input: {
  context: QueryContext;
  projectId: string;
  after?: string | null;
  limit: number;
}): Page<FeedbackDto> {
  assertLimit(input.limit);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!canReadProject(db, scope, input.projectId)) {
    throw new Error(`Project not found: ${input.projectId}`);
  }
  const clauses = ["iteration.project_id = ?"];
  const values: (string | number)[] = [input.projectId];
  appendCreationCursor(clauses, values, input.after, "feedback");
  values.push(input.limit + 1);
  const rows = db
    .query<FeedbackDto, (string | number)[]>(
      `${FEEDBACK_DTO_SELECT}
       WHERE ${clauses.join(" AND ")}
       ORDER BY feedback.created_at ASC, feedback.id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function getFeedbackResolutionLink(input: {
  context: QueryContext;
  linkId: string;
}): FeedbackResolutionLinkDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const row = db
    .query<FeedbackResolutionLinkDto, [string]>(
      `${FEEDBACK_RESOLUTION_LINK_SELECT}
       WHERE link.id = ?`,
    )
    .get(input.linkId);
  if (!row || !canReadProject(db, scope, row.projectId)) {
    throw new Error(`Feedback resolution link not found: ${input.linkId}`);
  }
  return row;
}

export function listFeedbackResolutionLinks(input: {
  context: QueryContext;
  feedbackId: string;
  after?: string | null;
  limit: number;
}): Page<FeedbackResolutionLinkDto> {
  assertLimit(input.limit);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const feedback = db
    .query<{ projectId: string }, [string]>(
      `SELECT iteration.project_id AS projectId FROM feedback_items feedback
       JOIN project_iterations iteration ON iteration.id = feedback.iteration_id
       WHERE feedback.id = ?`,
    )
    .get(input.feedbackId);
  if (!feedback || !canReadProject(db, scope, feedback.projectId)) {
    throw new Error(`Feedback not found: ${input.feedbackId}`);
  }
  const clauses = ["link.feedback_id = ?"];
  const values: (string | number)[] = [input.feedbackId];
  appendCreationCursor(clauses, values, input.after, "link");
  values.push(input.limit + 1);
  const rows = db
    .query<FeedbackResolutionLinkDto, (string | number)[]>(
      `${FEEDBACK_RESOLUTION_LINK_SELECT}
       WHERE ${clauses.join(" AND ")}
       ORDER BY link.created_at ASC, link.id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function getProjectStage(input: {
  context: QueryContext;
  stageId: string;
}): ProjectStageDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const row = db
    .query<ProjectStageDto, [string]>(
      `${PROJECT_STAGE_DTO_SELECT} WHERE id = ?`,
    )
    .get(input.stageId);
  if (!row || !canReadProject(db, scope, row.projectId)) {
    throw new Error(`Project stage not found: ${input.stageId}`);
  }
  return row;
}

export function listProjectStages(input: {
  context: QueryContext;
  projectId: string;
  after?: string | null;
  limit: number;
}): Page<ProjectStageDto> {
  assertLimit(input.limit);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!canReadProject(db, scope, input.projectId)) {
    throw new Error(`Project not found: ${input.projectId}`);
  }
  const clauses = ["project_id = ?"];
  const values: (string | number)[] = [input.projectId];
  if (input.after != null) {
    const cursor = decodeCursor("c1", input.after);
    clauses.push("(updated_at > ? OR (updated_at = ? AND id > ?))");
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(input.limit + 1);
  const rows = db
    .query<ProjectStageDto, (string | number)[]>(
      `${PROJECT_STAGE_DTO_SELECT} WHERE ${clauses.join(" AND ")}
       ORDER BY updated_at ASC, id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.updatedAt,
    id: row.id,
  }));
}

function canReadProject(
  db: Database,
  scope: ResolvedScope,
  projectId: string,
): boolean {
  if (scope.projectId !== null) return scope.projectId === projectId;
  return db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM projects WHERE id = ? AND workspace_id = ?",
    )
    .get(projectId, scope.workspaceId) !== null;
}

function appendCreationCursor(
  clauses: string[],
  values: (string | number)[],
  after: string | null | undefined,
  table?: "feedback" | "link",
): void {
  if (after == null) return;
  const cursor = decodeCursor("c1", after);
  const prefix = table === undefined ? "" : `${table}.`;
  clauses.push(
    `(${prefix}created_at > ? OR (${prefix}created_at = ? AND ${prefix}id > ?))`,
  );
  values.push(cursor.ordinal, cursor.ordinal, cursor.id);
}

function getWorkspaceRow(db: Database, id: string): WorkspaceRow | null {
  const row = db
    .query<WorkspaceDbRow, [string]>(
      `SELECT ${WORKSPACE_COLUMNS} FROM workspaces WHERE id = ?`,
    )
    .get(id);
  return row ? toWorkspaceRow(row) : null;
}

function getProjectRow(db: Database, id: string): ProjectRow | null {
  const row = db
    .query<ProjectDbRow, [string]>(
      `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`,
    )
    .get(id);
  return row ? toProjectRow(row) : null;
}

function getIterationRow(db: Database, id: string): IterationRow | null {
  const row = db
    .query<IterationDbRow, [string]>(
      `SELECT ${ITERATION_COLUMNS} FROM project_iterations WHERE id = ?`,
    )
    .get(id);
  return row ? toIterationRow(row) : null;
}

function getFeedbackDto(db: Database, id: string): FeedbackDto | null {
  return db
    .query<FeedbackDto, [string]>(`${FEEDBACK_DTO_SELECT} WHERE feedback.id = ?`)
    .get(id);
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

function toWorkspaceSummaryDto(row: WorkspaceRow): WorkspaceSummaryDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    rowVersion: row.rowVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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

function toProjectSummaryDto(row: ProjectRow): ProjectSummaryDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    slug: row.slug,
    name: row.name,
    state: row.state,
    rowVersion: row.rowVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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

function toIterationDto(row: IterationRow): IterationDto {
  return {
    id: row.id,
    projectId: row.projectId,
    number: row.number,
    title: row.title,
    reason: row.reason,
    state: row.state,
    createdAt: row.createdAt,
    closedAt: row.closedAt,
  };
}

function parseJson(value: string | null): JsonValue | null {
  return value === null ? null : (JSON.parse(value) as JsonValue);
}
