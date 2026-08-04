import { Database } from "bun:sqlite";
import { MEDIA_ARTIFACT_KINDS } from "../schemas/media-artifact.js";
import { appendActivity } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import { resolveObjectPath } from "./internal-objects.js";
import { assertLimit, buildPage, decodeCursor } from "./pagination.js";
import { assertActiveSessionScope } from "./sessions.js";
import {
  resolveQueryContext,
  scopeVisibilityClause,
  type QueryContext,
  type ResolvedScope,
} from "./scope-context.js";
import {
  type ArtifactDto,
  type ArtifactKind,
  type ArtifactRelationDto,
  type ArtifactRevisionDto,
  type ArtifactRevisionState,
  type ArtifactUsageDto,
  type JsonValue,
  type Page,
  StoreConflictError,
} from "./types.js";
import type {
  ArtifactRelationRow,
  ArtifactRevisionRow,
  ArtifactRow,
  ObjectRow,
} from "./internal-types.js";

type ArtifactScope =
  | { workspaceId: string; projectId?: never }
  | { workspaceId?: never; projectId: string };

/** Narrows broad Workspace authority to the stable Artifact's immutable scope. */
export function artifactMutationContext(
  context: QueryContext,
  artifactId: string,
): QueryContext {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, context);
  const row = db
    .query<{ workspaceId: string; projectId: string | null }, [string]>(
      "SELECT workspace_id AS workspaceId, project_id AS projectId FROM artifacts WHERE id = ?",
    )
    .get(artifactId);
  if (
    !row ||
    row.workspaceId !== scope.workspaceId ||
    (scope.projectId !== null && row.projectId !== null && row.projectId !== scope.projectId)
  ) {
    throw new Error(`Artifact not found: ${artifactId}`);
  }
  if (context.sessionId !== undefined || row.projectId === null) return context;
  return { workspaceId: row.workspaceId, projectId: row.projectId };
}

export type CreateArtifactInput = ArtifactScope & {
  slug: string;
  kind: ArtifactKind;
};

export type AddArtifactRevisionInput = {
  artifactId: string;
  objectId: string;
  parentRevisionId?: string | null;
  iterationId?: string | null;
  state: ArtifactRevisionState;
  metadata?: JsonValue | null;
  authoredBySessionId?: string | null;
};

export type ArtifactRelationInput = {
  fromRevisionId: string;
  toRevisionId: string;
  relation: string;
  metadata?: JsonValue | null;
};

type ArtifactUsageTarget =
  | { workspaceId: string; projectId?: never; feedbackId?: never }
  | { workspaceId?: never; projectId: string; feedbackId?: never }
  | { workspaceId?: never; projectId?: never; feedbackId: string };

export type ArtifactUsageInput = ArtifactUsageTarget & {
  artifactRevisionId: string;
  role: string;
  lifecycle?: string | null;
};

type ArtifactDbRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  slug: string;
  kind: ArtifactKind;
  selected_revision_id: string | null;
  row_version: number;
  created_at: number;
  updated_at: number;
};

type ArtifactRevisionDbRow = {
  id: string;
  artifact_id: string;
  object_id: string;
  revision_no: number;
  parent_revision_id: string | null;
  iteration_id: string | null;
  state: ArtifactRevisionState;
  metadata_json: string | null;
  authored_by_session_id: string | null;
  created_at: number;
};

type PublicArtifactRevisionDbRow = Omit<
  ArtifactRevisionDbRow,
  "metadata_json"
>;

type ScopedArtifactRevisionDbRow = PublicArtifactRevisionDbRow & {
  workspace_id: string;
  project_id: string | null;
};

type ObjectDbRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  backend: "local";
  bucket: string;
  key: string;
  sha256: string;
  mime: string;
  bytes: number;
  storage_class: ObjectRow["storageClass"];
  original_name: string | null;
  metadata_json: string | null;
  created_at: number;
};

type ArtifactRelationDbRow = {
  id: string;
  from_revision_id: string;
  to_revision_id: string;
  relation: string;
  metadata_json: string | null;
  created_at: number;
};

type PublicArtifactRelationDbRow = Omit<
  ArtifactRelationDbRow,
  "metadata_json"
>;

type ArtifactUsageDbRow = {
  id: string;
  artifact_revision_id: string;
  workspace_id: string | null;
  project_id: string | null;
  feedback_id: string | null;
  role: string;
  lifecycle: string | null;
  created_at: number;
};

const ARTIFACT_COLUMNS =
  "id, workspace_id, project_id, slug, kind, selected_revision_id, row_version, created_at, updated_at";
const REVISION_COLUMNS =
  "id, artifact_id, object_id, revision_no, parent_revision_id, iteration_id, state, metadata_json, authored_by_session_id, created_at";
const PUBLIC_REVISION_COLUMNS =
  "r.id, r.artifact_id, r.object_id, r.revision_no, r.parent_revision_id, r.iteration_id, r.state, r.authored_by_session_id, r.created_at, a.workspace_id, a.project_id";
const OBJECT_COLUMNS =
  "id, workspace_id, project_id, backend, bucket, key, sha256, mime, bytes, storage_class, original_name, metadata_json, created_at";
const RELATION_COLUMNS =
  "id, from_revision_id, to_revision_id, relation, metadata_json, created_at";
const PUBLIC_RELATION_COLUMNS =
  "rel.id, rel.from_revision_id, rel.to_revision_id, rel.relation, rel.created_at";
const USAGE_COLUMNS =
  "id, artifact_revision_id, workspace_id, project_id, feedback_id, role, lifecycle, created_at";
const PUBLIC_USAGE_COLUMNS =
  "u.id, u.artifact_revision_id, u.workspace_id, u.project_id, u.feedback_id, u.role, u.lifecycle, u.created_at";
const ARTIFACT_KINDS = new Set<ArtifactKind>(
  MEDIA_ARTIFACT_KINDS.filter((kind) => kind !== "ref") as ArtifactKind[],
);
const REVISION_STATES = new Set<ArtifactRevisionState>([
  "working",
  "candidate",
  "approved",
  "rejected",
  "superseded",
  "archived",
]);
const BINARY_KEYS = new Set([
  "base64",
  "b64",
  "binary",
  "blob",
  "bytes",
  "dataurl",
  "filedata",
  "imagedata",
]);
const DATA_URL =
  /data:(?:[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+)?(?:;[a-z0-9!#$&^_.+-]+=[^;,\s]+)*(?:;base64)?,[^\s"'<>]*/i;

export function createArtifact(input: CreateArtifactInput): ArtifactDto {
  assertArtifactKind(input.kind);
  const slug = checkedText(input.slug, "Artifact slug");
  return withImmediateTransaction((db) => {
    const scope = resolveScope(db, input);
    const id = newDomainId("art");
    const now = Date.now();
    db.prepare(
      "INSERT INTO artifacts (id, workspace_id, project_id, slug, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, scope.workspaceId, scope.projectId, slug, input.kind, now, now);
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "artifact",
      entityId: id,
      action: "artifact.created",
      payload: { kind: input.kind },
      createdAt: now,
    });
    return toArtifactDto(getArtifactRow(db, id)!);
  });
}

export function getArtifact(input: {
  context: QueryContext;
  artifactId: string;
}): ArtifactDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const artifact = getVisibleArtifactRow(db, scope, input.artifactId);
  if (!artifact) {
    throw new Error(`Artifact not found: ${input.artifactId}`);
  }
  return toArtifactDto(artifact);
}

export function getArtifactRevision(input: {
  context: QueryContext;
  revisionId: string;
}): ArtifactRevisionDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const revision = getVisibleArtifactRevision(db, scope, input.revisionId);
  if (!revision) {
    throw new Error(`Artifact Revision not found: ${input.revisionId}`);
  }
  return revision;
}

/** Resolve the newest Object bytes for one exact Artifact slot and scope. */
export function resolveLatestArtifactObject(input: {
  context: ArtifactScope;
  slug: string;
  kind: ArtifactKind;
}): { artifact: ArtifactDto; revision: ArtifactRevisionDto; objectPath: string } {
  const db = openDomainDb();
  const scope = resolveScope(db, input.context);
  const artifact = db.query<ArtifactDbRow, [string, string | null, string, ArtifactKind]>(
    `SELECT ${ARTIFACT_COLUMNS} FROM artifacts
     WHERE workspace_id = ? AND project_id IS ? AND slug = ? AND kind = ?`,
  ).get(scope.workspaceId, scope.projectId, input.slug, input.kind);
  if (!artifact) throw new Error(`Artifact not found: ${input.slug}`);
  const revision = db.query<ArtifactRevisionDbRow, [string]>(
    `SELECT ${REVISION_COLUMNS} FROM artifact_revisions
     WHERE artifact_id = ? ORDER BY revision_no DESC LIMIT 1`,
  ).get(artifact.id);
  if (!revision) throw new Error(`Artifact has no revisions: ${input.slug}`);
  const revisionRow = toArtifactRevisionRow(revision);
  const object = getObjectRow(db, revisionRow.objectId);
  if (!object) throw new Error(`Object not found: ${revisionRow.objectId}`);
  return {
    artifact: toArtifactDto(toArtifactRow(artifact)),
    revision: toArtifactRevisionDto(revisionRow),
    objectPath: resolveObjectPath(object),
  };
}

export function listArtifacts(input: {
  context: QueryContext;
  after?: string | null;
  limit: number;
}): Page<ArtifactDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("c1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const visibility = scopeVisibilityClause(
    scope,
    "workspace_id",
    "project_id",
  );
  const rows = db
    .query<ArtifactDbRow, (string | number)[]>(
      `SELECT ${ARTIFACT_COLUMNS} FROM artifacts
       WHERE ${visibility.sql}
         AND (created_at > ? OR (created_at = ? AND id > ?))
       ORDER BY created_at ASC, id ASC LIMIT ?`,
    )
    .all(
      ...visibility.values,
      cursor?.ordinal ?? -1,
      cursor?.ordinal ?? -1,
      cursor?.id ?? "",
      input.limit + 1,
    );
  const page = buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.created_at,
    id: row.id,
  }));
  return {
    items: page.items.map((row) => toArtifactDto(toArtifactRow(row))),
    nextCursor: page.nextCursor,
  };
}

export function listArtifactRevisions(input: {
  context: QueryContext;
  artifactId: string;
  after?: string | null;
  limit: number;
}): Page<ArtifactRevisionDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("v1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const artifact = getVisibleArtifactRow(db, scope, input.artifactId);
  if (!artifact) {
    throw new Error(`Artifact not found: ${input.artifactId}`);
  }
  const rows = db
    .query<ScopedArtifactRevisionDbRow, [string, number, number, string, number]>(
      `SELECT ${PUBLIC_REVISION_COLUMNS}
       FROM artifact_revisions r JOIN artifacts a ON a.id = r.artifact_id
       WHERE r.artifact_id = ?
         AND (r.revision_no > ? OR (r.revision_no = ? AND r.id > ?))
       ORDER BY r.revision_no ASC, r.id ASC LIMIT ?`,
    )
    .all(
      artifact.id,
      cursor?.ordinal ?? -1,
      cursor?.ordinal ?? -1,
      cursor?.id ?? "",
      input.limit + 1,
    );
  const page = buildPage(rows, input.limit, "v1", (row) => ({
    ordinal: row.revision_no,
    id: row.id,
  }));
  return {
    items: page.items.map(toPublicArtifactRevisionDto),
    nextCursor: page.nextCursor,
  };
}

export function getArtifactRelation(input: {
  context: QueryContext;
  relationId: string;
}): ArtifactRelationDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const relation = getVisibleArtifactRelation(db, scope, input.relationId);
  if (!relation) {
    throw new Error(`Artifact Relation not found: ${input.relationId}`);
  }
  return relation;
}

export function listArtifactRelations(input: {
  context: QueryContext;
  revisionId: string;
  after?: string | null;
  limit: number;
}): Page<ArtifactRelationDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("c1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisibleArtifactRevision(db, scope, input.revisionId)) {
    throw new Error(`Artifact Revision not found: ${input.revisionId}`);
  }
  const fromVisibility = scopeVisibilityClause(
    scope,
    "from_artifact.workspace_id",
    "from_artifact.project_id",
  );
  const toVisibility = scopeVisibilityClause(
    scope,
    "to_artifact.workspace_id",
    "to_artifact.project_id",
  );
  const rows = db
    .query<PublicArtifactRelationDbRow, (string | number)[]>(
      `SELECT ${PUBLIC_RELATION_COLUMNS}
       FROM artifact_relations rel
       JOIN artifact_revisions from_revision ON from_revision.id = rel.from_revision_id
       JOIN artifacts from_artifact ON from_artifact.id = from_revision.artifact_id
       JOIN artifact_revisions to_revision ON to_revision.id = rel.to_revision_id
       JOIN artifacts to_artifact ON to_artifact.id = to_revision.artifact_id
       WHERE (rel.from_revision_id = ? OR rel.to_revision_id = ?)
         AND ${fromVisibility.sql}
         AND ${toVisibility.sql}
         AND (rel.created_at > ? OR (rel.created_at = ? AND rel.id > ?))
       ORDER BY rel.created_at ASC, rel.id ASC LIMIT ?`,
    )
    .all(
      input.revisionId,
      input.revisionId,
      ...fromVisibility.values,
      ...toVisibility.values,
      cursor?.ordinal ?? -1,
      cursor?.ordinal ?? -1,
      cursor?.id ?? "",
      input.limit + 1,
    );
  const page = buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.created_at,
    id: row.id,
  }));
  return {
    items: page.items.map(toPublicArtifactRelationDto),
    nextCursor: page.nextCursor,
  };
}

export function getArtifactUsage(input: {
  context: QueryContext;
  usageId: string;
}): ArtifactUsageDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const usage = getVisibleArtifactUsage(db, scope, input.usageId);
  if (!usage) {
    throw new Error(`Artifact Usage not found: ${input.usageId}`);
  }
  return usage;
}

export function listArtifactUsages(input: {
  context: QueryContext;
  revisionId: string;
  after?: string | null;
  limit: number;
}): Page<ArtifactUsageDto> {
  assertLimit(input.limit);
  const cursor = input.after == null ? null : decodeCursor("c1", input.after);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  if (!getVisibleArtifactRevision(db, scope, input.revisionId)) {
    throw new Error(`Artifact Revision not found: ${input.revisionId}`);
  }
  const revisionVisibility = scopeVisibilityClause(
    scope,
    "a.workspace_id",
    "a.project_id",
  );
  const targetVisibility = usageTargetVisibilityClause(scope);
  const rows = db
    .query<ArtifactUsageDbRow, (string | number)[]>(
      `SELECT ${PUBLIC_USAGE_COLUMNS}
       FROM artifact_usages u
       JOIN artifact_revisions r ON r.id = u.artifact_revision_id
       JOIN artifacts a ON a.id = r.artifact_id
       LEFT JOIN feedback_items f ON f.id = u.feedback_id
       LEFT JOIN project_iterations i ON i.id = f.iteration_id
       WHERE u.artifact_revision_id = ?
         AND u.context_type IS NULL AND u.context_id IS NULL
         AND ${revisionVisibility.sql}
         AND ${targetVisibility.sql}
         AND (u.created_at > ? OR (u.created_at = ? AND u.id > ?))
       ORDER BY u.created_at ASC, u.id ASC LIMIT ?`,
    )
    .all(
      input.revisionId,
      ...revisionVisibility.values,
      ...targetVisibility.values,
      cursor?.ordinal ?? -1,
      cursor?.ordinal ?? -1,
      cursor?.id ?? "",
      input.limit + 1,
    );
  const page = buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.created_at,
    id: row.id,
  }));
  return {
    items: page.items.map(toArtifactUsageDto),
    nextCursor: page.nextCursor,
  };
}

export function addArtifactRevision(
  input: AddArtifactRevisionInput,
): ArtifactRevisionDto {
  assertRevisionState(input.state);
  const metadata = checkedJson(input.metadata);
  const initialDb = openDomainDb();
  const object = getObjectRow(initialDb, input.objectId);
  if (!object) throw new Error(`Object not found: ${input.objectId}`);
  resolveObjectPath(object);

  return withImmediateTransaction((db) => {
    const artifact = getArtifactRow(db, input.artifactId);
    if (!artifact) throw new Error(`Artifact not found: ${input.artifactId}`);
    const currentObject = getObjectRow(db, input.objectId);
    if (!currentObject) throw new Error(`Object not found: ${input.objectId}`);
    assertObjectVisibleToArtifact(currentObject, artifact);
    assertParent(db, artifact.id, input.parentRevisionId ?? null);
    assertIteration(db, artifact, input.iterationId ?? null);
    if (input.authoredBySessionId != null) {
      assertActiveSessionScope(db, input.authoredBySessionId, artifact);
    }
    const revision = insertRevision(db, artifact, {
      objectId: currentObject.id,
      parentRevisionId: input.parentRevisionId ?? null,
      iterationId: input.iterationId ?? null,
      state: input.state,
      metadata,
      authoredBySessionId: input.authoredBySessionId ?? null,
    });
    appendActivity(db, {
      workspaceId: artifact.workspaceId,
      projectId: artifact.projectId,
      entityType: "artifact",
      entityId: artifact.id,
      action: "artifact.revised",
      payload: {
        revisionId: revision.id,
        revisionNo: revision.revisionNo,
        objectId: revision.objectId,
        state: revision.state,
      },
      createdAt: revision.createdAt,
    });
    return toArtifactRevisionDto(revision);
  });
}

/** @internal Creates/reuses a slot Artifact and appends one revision in the caller's transaction. */
export function addArtifactRevisionInTransaction(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string | null;
    slug: string;
    kind: ArtifactKind;
    objectId: string;
    state: ArtifactRevisionState;
    metadata?: JsonValue | null;
    authoredBySessionId?: string | null;
  },
): { artifact: ArtifactDto; revision: ArtifactRevisionDto } {
  assertArtifactKind(input.kind);
  assertRevisionState(input.state);
  const slug = checkedText(input.slug, "Artifact slug");
  const metadata = checkedJson(input.metadata);
  const scope = resolveScope(
    db,
    input.projectId === null
      ? { workspaceId: input.workspaceId }
      : { projectId: input.projectId },
  );
  if (scope.workspaceId !== input.workspaceId) {
    throw new Error("Artifact scope does not match the Run Workspace");
  }
  let artifact = db
    .query<ArtifactDbRow, [string, string | null, string]>(
      `SELECT ${ARTIFACT_COLUMNS} FROM artifacts
       WHERE workspace_id = ? AND project_id IS ? AND slug = ?`,
    )
    .get(scope.workspaceId, scope.projectId, slug);
  if (!artifact) {
    const id = newDomainId("art");
    const now = Date.now();
    db.prepare(
      "INSERT INTO artifacts (id, workspace_id, project_id, slug, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, scope.workspaceId, scope.projectId, slug, input.kind, now, now);
    artifact = db
      .query<ArtifactDbRow, [string]>(
        `SELECT ${ARTIFACT_COLUMNS} FROM artifacts WHERE id = ?`,
      )
      .get(id);
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "artifact",
      entityId: id,
      action: "artifact.created",
      payload: { kind: input.kind },
      createdAt: now,
    });
  }
  if (!artifact) throw new Error(`Artifact was not created: ${slug}`);
  const artifactRow = toArtifactRow(artifact);
  if (artifactRow.kind !== input.kind) {
    throw new Error(`Artifact slot already exists with kind ${artifactRow.kind}: ${slug}`);
  }
  const object = getObjectRow(db, input.objectId);
  if (!object) throw new Error(`Object not found: ${input.objectId}`);
  assertObjectVisibleToArtifact(object, artifactRow);
  if (input.authoredBySessionId != null) {
    assertActiveSessionScope(db, input.authoredBySessionId, artifactRow);
  }
  const revision = insertRevision(db, artifactRow, {
    objectId: object.id,
    parentRevisionId: null,
    iterationId: null,
    state: input.state,
    metadata,
    authoredBySessionId: input.authoredBySessionId ?? null,
  });
  appendActivity(db, {
    workspaceId: artifactRow.workspaceId,
    projectId: artifactRow.projectId,
    entityType: "artifact",
    entityId: artifactRow.id,
    action: "artifact.revised",
    payload: {
      revisionId: revision.id,
      revisionNo: revision.revisionNo,
      objectId: revision.objectId,
      state: revision.state,
    },
    createdAt: revision.createdAt,
  });
  return {
    artifact: toArtifactDto(artifactRow),
    revision: toArtifactRevisionDto(revision),
  };
}

export function selectArtifactRevision(input: {
  artifactId: string;
  revisionId: string;
  expectedRevisionId: string | null;
}): ArtifactDto {
  return withImmediateTransaction((db) => {
    const artifact = getArtifactRow(db, input.artifactId);
    if (!artifact) throw new Error(`Artifact not found: ${input.artifactId}`);
    const revision = getArtifactRevisionRow(db, input.revisionId);
    if (!revision)
      throw new Error(`Artifact Revision not found: ${input.revisionId}`);
    if (revision.artifactId !== artifact.id) {
      throw new Error("Artifact Revision does not belong to the Artifact");
    }
    const now = Date.now();
    const result = db
      .prepare(
        "UPDATE artifacts SET selected_revision_id = ?, row_version = row_version + 1, updated_at = ? WHERE id = ? AND selected_revision_id IS ?",
      )
      .run(input.revisionId, now, artifact.id, input.expectedRevisionId);
    if (!result.changes)
      throw new StoreConflictError("Artifact selection conflict");
    appendActivity(db, {
      workspaceId: artifact.workspaceId,
      projectId: artifact.projectId,
      entityType: "artifact",
      entityId: artifact.id,
      action: "artifact.selected",
      payload: {
        fromRevisionId: input.expectedRevisionId,
        revisionId: input.revisionId,
      },
      createdAt: now,
    });
    return toArtifactDto(getArtifactRow(db, artifact.id)!);
  });
}

export function setArtifactRevisionState(input: {
  revisionId: string;
  state: ArtifactRevisionState;
  authoredBySessionId?: string | null;
}): ArtifactRevisionDto {
  assertRevisionState(input.state);
  const initialDb = openDomainDb();
  const source = getArtifactRevisionRow(initialDb, input.revisionId);
  if (!source)
    throw new Error(`Artifact Revision not found: ${input.revisionId}`);
  const object = getObjectRow(initialDb, source.objectId);
  if (!object) throw new Error(`Object not found: ${source.objectId}`);
  resolveObjectPath(object);

  return withImmediateTransaction((db) =>
    setArtifactRevisionStateInTransaction(db, input),
  );
}

/**
 * The same state transition inside the caller's transaction, so an atomic media
 * review can commit the revision, its Evaluation, and its feedback together.
 * The backing file is re-checked here rather than before the transaction.
 *
 * @internal
 */
export function setArtifactRevisionStateInTransaction(
  db: Database,
  input: {
    revisionId: string;
    state: ArtifactRevisionState;
    authoredBySessionId?: string | null;
  },
): ArtifactRevisionDto {
  assertRevisionState(input.state);
  {
    const currentSource = getArtifactRevisionRow(db, input.revisionId);
    if (!currentSource)
      throw new Error(`Artifact Revision not found: ${input.revisionId}`);
    const artifact = getArtifactRow(db, currentSource.artifactId)!;
    if (input.authoredBySessionId != null) {
      assertActiveSessionScope(db, input.authoredBySessionId, artifact);
    }
    const revision = insertRevision(db, artifact, {
      objectId: currentSource.objectId,
      parentRevisionId: currentSource.id,
      iterationId: currentSource.iterationId,
      state: input.state,
      metadata: currentSource.metadata,
      authoredBySessionId: input.authoredBySessionId ?? null,
    });
    const selectionAdvanced = artifact.selectedRevisionId === currentSource.id;
    if (selectionAdvanced) {
      db.prepare(
        "UPDATE artifacts SET selected_revision_id = ?, row_version = row_version + 1, updated_at = ? WHERE id = ? AND selected_revision_id = ?",
      ).run(revision.id, revision.createdAt, artifact.id, currentSource.id);
    }
    appendActivity(db, {
      workspaceId: artifact.workspaceId,
      projectId: artifact.projectId,
      entityType: "artifact",
      entityId: artifact.id,
      action: "artifact.state_changed",
      payload: {
        sourceRevisionId: currentSource.id,
        revisionId: revision.id,
        from: currentSource.state,
        to: revision.state,
        selectionAdvanced,
      },
      createdAt: revision.createdAt,
    });
    return toArtifactRevisionDto(revision);
  }
}

export function addArtifactRelation(
  input: ArtifactRelationInput,
): ArtifactRelationDto {
  const relation = checkedText(input.relation, "Artifact relation");
  const metadata = checkedJson(input.metadata);
  return withImmediateTransaction((db) => {
    const from = revisionScope(db, input.fromRevisionId);
    if (!from)
      throw new Error(`Artifact Revision not found: ${input.fromRevisionId}`);
    const to = revisionScope(db, input.toRevisionId);
    if (!to)
      throw new Error(`Artifact Revision not found: ${input.toRevisionId}`);
    if (from.workspaceId !== to.workspaceId) {
      throw new Error("Artifact relations must stay inside one Workspace");
    }
    if (
      db
        .query<
          { id: string },
          [string, string, string]
        >("SELECT id FROM artifact_relations WHERE from_revision_id = ? AND to_revision_id = ? AND relation = ?")
        .get(from.revisionId, to.revisionId, relation)
    ) {
      throw new StoreConflictError("Artifact relation already exists");
    }
    const id = newDomainId("rel");
    const now = Date.now();
    db.prepare(
      "INSERT INTO artifact_relations (id, from_revision_id, to_revision_id, relation, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      from.revisionId,
      to.revisionId,
      relation,
      serializeJson(metadata),
      now,
    );
    appendActivity(db, {
      workspaceId: from.workspaceId,
      projectId: from.projectId === to.projectId ? from.projectId : null,
      entityType: "artifact_relation",
      entityId: id,
      action: "artifact.relation_added",
      payload: {
        fromRevisionId: from.revisionId,
        toRevisionId: to.revisionId,
        relation,
      },
      createdAt: now,
    });
    return toArtifactRelationDto(getArtifactRelationRow(db, id)!);
  });
}

export function addArtifactUsage(input: ArtifactUsageInput): ArtifactUsageDto {
  const role = checkedText(input.role, "Artifact usage role");
  const lifecycle =
    input.lifecycle === undefined || input.lifecycle === null
      ? null
      : checkedText(input.lifecycle, "Artifact usage lifecycle");
  return withImmediateTransaction((db) => {
    const revision = revisionScope(db, input.artifactRevisionId);
    if (!revision) {
      throw new Error(
        `Artifact Revision not found: ${input.artifactRevisionId}`,
      );
    }
    const target = resolveUsageTarget(db, input);
    if (target.workspaceId !== revision.workspaceId) {
      throw new Error("Artifact usage target belongs to a different Workspace");
    }
    if (
      db
        .query<
          { id: string },
          [
            string,
            string | null,
            string | null,
            string | null,
            string,
            string | null,
          ]
        >(
          `SELECT id FROM artifact_usages
           WHERE artifact_revision_id = ? AND workspace_id IS ? AND project_id IS ?
             AND feedback_id IS ? AND role = ? AND lifecycle IS ?`,
        )
        .get(
          revision.revisionId,
          target.workspaceIdValue,
          target.projectIdValue,
          target.feedbackIdValue,
          role,
          lifecycle,
        )
    ) {
      throw new StoreConflictError("Artifact usage already exists");
    }
    const id = newDomainId("usage");
    const now = Date.now();
    db.prepare(
      `INSERT INTO artifact_usages
       (id, artifact_revision_id, workspace_id, project_id, feedback_id, context_type, context_id, role, lifecycle, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
    ).run(
      id,
      revision.revisionId,
      target.workspaceIdValue,
      target.projectIdValue,
      target.feedbackIdValue,
      role,
      lifecycle,
      now,
    );
    appendActivity(db, {
      workspaceId: revision.workspaceId,
      projectId: target.projectId ?? revision.projectId,
      entityType: "artifact_usage",
      entityId: id,
      action: "artifact.usage_added",
      payload: {
        artifactRevisionId: revision.revisionId,
        role,
        lifecycle,
        targetType: target.type,
        targetId: target.id,
      },
      createdAt: now,
    });
    return getArtifactUsageRow(db, id)!;
  });
}

function resolveScope(
  db: Database,
  input: { workspaceId?: string; projectId?: string },
): { workspaceId: string; projectId: string | null } {
  if (input.workspaceId && !input.projectId) {
    const workspace = db
      .query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?")
      .get(input.workspaceId);
    if (!workspace)
      throw new Error(`Workspace not found: ${input.workspaceId}`);
    return { workspaceId: workspace.id, projectId: null };
  }
  if (input.projectId && !input.workspaceId) {
    const project = db
      .query<
        { workspaceId: string },
        [string]
      >("SELECT workspace_id AS workspaceId FROM projects WHERE id = ?")
      .get(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    return { workspaceId: project.workspaceId, projectId: input.projectId };
  }
  throw new Error(
    "Artifact scope requires exactly one workspaceId or projectId",
  );
}

function assertArtifactKind(kind: ArtifactKind): void {
  if (kind === ("ref" as ArtifactKind)) {
    throw new Error(
      "Artifact kind ref is legacy; use an intrinsic kind plus reference usage",
    );
  }
  if (!ARTIFACT_KINDS.has(kind))
    throw new Error(`Invalid Artifact kind: ${kind}`);
}

function assertRevisionState(state: ArtifactRevisionState): void {
  if (!REVISION_STATES.has(state))
    throw new Error(`Invalid Artifact revision state: ${state}`);
}

function assertObjectVisibleToArtifact(
  object: ObjectRow,
  artifact: ArtifactRow,
): void {
  const visible =
    object.workspaceId === artifact.workspaceId &&
    (artifact.projectId === null
      ? object.projectId === null
      : object.projectId === null || object.projectId === artifact.projectId);
  if (!visible) {
    throw new Error(
      artifact.projectId === null
        ? "Workspace Artifact requires a shared Object from its Workspace"
        : "Object is outside the Artifact scope",
    );
  }
}

function assertParent(
  db: Database,
  artifactId: string,
  parentId: string | null,
): void {
  if (!parentId) return;
  const parent = getArtifactRevisionRow(db, parentId);
  if (!parent || parent.artifactId !== artifactId) {
    throw new Error(
      "Artifact revision parent must belong to the same Artifact",
    );
  }
}

function assertIteration(
  db: Database,
  artifact: ArtifactRow,
  iterationId: string | null,
): void {
  if (!iterationId) return;
  const iteration = db
    .query<{ workspaceId: string; projectId: string }, [string]>(
      `SELECT p.workspace_id AS workspaceId, p.id AS projectId
       FROM project_iterations i JOIN projects p ON p.id = i.project_id WHERE i.id = ?`,
    )
    .get(iterationId);
  const valid =
    iteration &&
    (artifact.projectId === null
      ? iteration.workspaceId === artifact.workspaceId
      : iteration.projectId === artifact.projectId);
  if (!valid)
    throw new Error("Iteration does not belong to the Artifact scope");
}

function insertRevision(
  db: Database,
  artifact: ArtifactRow,
  input: {
    objectId: string;
    parentRevisionId: string | null;
    iterationId: string | null;
    state: ArtifactRevisionState;
    metadata: JsonValue | null;
    authoredBySessionId: string | null;
  },
): ArtifactRevisionRow {
  const revisionNo =
    db
      .query<
        { revisionNo: number },
        [string]
      >("SELECT COALESCE(MAX(revision_no), 0) + 1 AS revisionNo FROM artifact_revisions WHERE artifact_id = ?")
      .get(artifact.id)?.revisionNo ?? 1;
  const id = newDomainId("arev");
  const now = Date.now();
  db.prepare(
    `INSERT INTO artifact_revisions
     (id, artifact_id, object_id, revision_no, parent_revision_id, iteration_id, state, metadata_json, authored_by_session_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    artifact.id,
    input.objectId,
    revisionNo,
    input.parentRevisionId,
    input.iterationId,
    input.state,
    serializeJson(input.metadata),
    input.authoredBySessionId,
    now,
  );
  return getArtifactRevisionRow(db, id)!;
}

function revisionScope(
  db: Database,
  revisionId: string,
): {
  revisionId: string;
  workspaceId: string;
  projectId: string | null;
} | null {
  return db
    .query<
      { revisionId: string; workspaceId: string; projectId: string | null },
      [string]
    >(
      `SELECT r.id AS revisionId, a.workspace_id AS workspaceId, a.project_id AS projectId
       FROM artifact_revisions r JOIN artifacts a ON a.id = r.artifact_id WHERE r.id = ?`,
    )
    .get(revisionId);
}

function resolveUsageTarget(
  db: Database,
  input: { workspaceId?: string; projectId?: string; feedbackId?: string },
): {
  type: "workspace" | "project" | "feedback";
  id: string;
  workspaceId: string;
  projectId: string | null;
  workspaceIdValue: string | null;
  projectIdValue: string | null;
  feedbackIdValue: string | null;
} {
  const count = [input.workspaceId, input.projectId, input.feedbackId].filter(
    (id) => id !== undefined,
  ).length;
  if (count !== 1) {
    throw new Error(
      "Artifact usage requires exactly one Workspace, Project, or feedback target",
    );
  }
  if (input.workspaceId) {
    const workspace = db
      .query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?")
      .get(input.workspaceId);
    if (!workspace)
      throw new Error(`Workspace not found: ${input.workspaceId}`);
    return {
      type: "workspace",
      id: workspace.id,
      workspaceId: workspace.id,
      projectId: null,
      workspaceIdValue: workspace.id,
      projectIdValue: null,
      feedbackIdValue: null,
    };
  }
  if (input.projectId) {
    const project = db
      .query<
        { id: string; workspaceId: string },
        [string]
      >("SELECT id, workspace_id AS workspaceId FROM projects WHERE id = ?")
      .get(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    return {
      type: "project",
      id: project.id,
      workspaceId: project.workspaceId,
      projectId: project.id,
      workspaceIdValue: null,
      projectIdValue: project.id,
      feedbackIdValue: null,
    };
  }
  const feedback = db
    .query<{ id: string; workspaceId: string; projectId: string }, [string]>(
      `SELECT f.id, p.workspace_id AS workspaceId, p.id AS projectId
       FROM feedback_items f
       JOIN project_iterations i ON i.id = f.iteration_id
       JOIN projects p ON p.id = i.project_id
       WHERE f.id = ?`,
    )
    .get(input.feedbackId!);
  if (!feedback) throw new Error(`Feedback not found: ${input.feedbackId}`);
  return {
    type: "feedback",
    id: feedback.id,
    workspaceId: feedback.workspaceId,
    projectId: feedback.projectId,
    workspaceIdValue: null,
    projectIdValue: null,
    feedbackIdValue: feedback.id,
  };
}

function getArtifactRow(db: Database, id: string): ArtifactRow | null {
  const row = db
    .query<
      ArtifactDbRow,
      [string]
    >(`SELECT ${ARTIFACT_COLUMNS} FROM artifacts WHERE id = ?`)
    .get(id);
  return row ? toArtifactRow(row) : null;
}

function getVisibleArtifactRow(
  db: Database,
  scope: ResolvedScope,
  id: string,
): ArtifactRow | null {
  const visibility = scopeVisibilityClause(
    scope,
    "workspace_id",
    "project_id",
  );
  const row = db
    .query<ArtifactDbRow, string[]>(
      `SELECT ${ARTIFACT_COLUMNS} FROM artifacts
       WHERE id = ? AND ${visibility.sql}`,
    )
    .get(id, ...visibility.values);
  return row ? toArtifactRow(row) : null;
}

function getArtifactRevisionRow(
  db: Database,
  id: string,
): ArtifactRevisionRow | null {
  const row = db
    .query<
      ArtifactRevisionDbRow,
      [string]
    >(`SELECT ${REVISION_COLUMNS} FROM artifact_revisions WHERE id = ?`)
    .get(id);
  return row ? toArtifactRevisionRow(row) : null;
}

function getVisibleArtifactRevision(
  db: Database,
  scope: ResolvedScope,
  id: string,
): ArtifactRevisionDto | null {
  const visibility = scopeVisibilityClause(
    scope,
    "a.workspace_id",
    "a.project_id",
  );
  const row = db
    .query<ScopedArtifactRevisionDbRow, string[]>(
      `SELECT ${PUBLIC_REVISION_COLUMNS}
       FROM artifact_revisions r
       JOIN artifacts a ON a.id = r.artifact_id
       WHERE r.id = ? AND ${visibility.sql}`,
    )
    .get(id, ...visibility.values);
  if (!row) return null;
  return toPublicArtifactRevisionDto(row);
}

function getVisibleArtifactRelation(
  db: Database,
  scope: ResolvedScope,
  id: string,
): ArtifactRelationDto | null {
  const fromVisibility = scopeVisibilityClause(
    scope,
    "from_artifact.workspace_id",
    "from_artifact.project_id",
  );
  const toVisibility = scopeVisibilityClause(
    scope,
    "to_artifact.workspace_id",
    "to_artifact.project_id",
  );
  const row = db
    .query<PublicArtifactRelationDbRow, string[]>(
      `SELECT ${PUBLIC_RELATION_COLUMNS}
       FROM artifact_relations rel
       JOIN artifact_revisions from_revision ON from_revision.id = rel.from_revision_id
       JOIN artifacts from_artifact ON from_artifact.id = from_revision.artifact_id
       JOIN artifact_revisions to_revision ON to_revision.id = rel.to_revision_id
       JOIN artifacts to_artifact ON to_artifact.id = to_revision.artifact_id
       WHERE rel.id = ? AND ${fromVisibility.sql} AND ${toVisibility.sql}`,
    )
    .get(id, ...fromVisibility.values, ...toVisibility.values);
  return row ? toPublicArtifactRelationDto(row) : null;
}

function getVisibleArtifactUsage(
  db: Database,
  scope: ResolvedScope,
  id: string,
): ArtifactUsageDto | null {
  const revisionVisibility = scopeVisibilityClause(
    scope,
    "a.workspace_id",
    "a.project_id",
  );
  const targetVisibility = usageTargetVisibilityClause(scope);
  const row = db
    .query<ArtifactUsageDbRow, string[]>(
      `SELECT ${PUBLIC_USAGE_COLUMNS}
       FROM artifact_usages u
       JOIN artifact_revisions r ON r.id = u.artifact_revision_id
       JOIN artifacts a ON a.id = r.artifact_id
       LEFT JOIN feedback_items f ON f.id = u.feedback_id
       LEFT JOIN project_iterations i ON i.id = f.iteration_id
       WHERE u.id = ?
         AND u.context_type IS NULL AND u.context_id IS NULL
         AND ${revisionVisibility.sql}
         AND ${targetVisibility.sql}`,
    )
    .get(id, ...revisionVisibility.values, ...targetVisibility.values);
  return row ? toArtifactUsageDto(row) : null;
}

function usageTargetVisibilityClause(scope: ResolvedScope): {
  sql: string;
  values: string[];
} {
  if (scope.projectId === null) {
    return {
      sql: "(u.workspace_id = ? AND u.project_id IS NULL AND u.feedback_id IS NULL)",
      values: [scope.workspaceId],
    };
  }
  return {
    sql: `(
      (u.workspace_id = ? AND u.project_id IS NULL AND u.feedback_id IS NULL)
      OR (u.workspace_id IS NULL AND u.project_id = ? AND u.feedback_id IS NULL)
      OR (u.workspace_id IS NULL AND u.project_id IS NULL AND i.project_id = ?)
    )`,
    values: [scope.workspaceId, scope.projectId, scope.projectId],
  };
}

function getObjectRow(db: Database, id: string): ObjectRow | null {
  const row = db
    .query<
      ObjectDbRow,
      [string]
    >(`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?`)
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    backend: row.backend,
    bucket: row.bucket,
    key: row.key,
    sha256: row.sha256,
    mime: row.mime,
    bytes: row.bytes,
    storageClass: row.storage_class,
    originalName: row.original_name,
    metadata: parseJson(row.metadata_json),
    createdAt: row.created_at,
  };
}

function getArtifactRelationRow(
  db: Database,
  id: string,
): ArtifactRelationRow | null {
  const row = db
    .query<
      ArtifactRelationDbRow,
      [string]
    >(`SELECT ${RELATION_COLUMNS} FROM artifact_relations WHERE id = ?`)
    .get(id);
  return row
    ? {
        id: row.id,
        fromRevisionId: row.from_revision_id,
        toRevisionId: row.to_revision_id,
        relation: row.relation,
        metadata: parseJson(row.metadata_json),
        createdAt: row.created_at,
      }
    : null;
}

function getArtifactUsageRow(
  db: Database,
  id: string,
): ArtifactUsageDto | null {
  const row = db
    .query<
      ArtifactUsageDbRow,
      [string]
    >(`SELECT ${USAGE_COLUMNS} FROM artifact_usages WHERE id = ?`)
    .get(id);
  return row ? toArtifactUsageDto(row) : null;
}

function toArtifactRow(row: ArtifactDbRow): ArtifactRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    slug: row.slug,
    kind: row.kind,
    selectedRevisionId: row.selected_revision_id,
    rowVersion: row.row_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toArtifactDto(row: ArtifactRow): ArtifactDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    slug: row.slug,
    kind: row.kind,
    selectedRevisionId: row.selectedRevisionId,
    rowVersion: row.rowVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toArtifactRevisionRow(
  row: ArtifactRevisionDbRow,
): ArtifactRevisionRow {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    objectId: row.object_id,
    revisionNo: row.revision_no,
    parentRevisionId: row.parent_revision_id,
    iterationId: row.iteration_id,
    state: row.state,
    metadata: parseJson(row.metadata_json),
    authoredBySessionId: row.authored_by_session_id,
    createdAt: row.created_at,
  };
}

function toArtifactRevisionDto(row: ArtifactRevisionRow): ArtifactRevisionDto {
  return {
    id: row.id,
    artifactId: row.artifactId,
    objectId: row.objectId,
    revisionNo: row.revisionNo,
    parentRevisionId: row.parentRevisionId,
    iterationId: row.iterationId,
    state: row.state,
    authoredBySessionId: row.authoredBySessionId,
    createdAt: row.createdAt,
  };
}

function toPublicArtifactRevisionDto(
  row: PublicArtifactRevisionDbRow,
): ArtifactRevisionDto {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    objectId: row.object_id,
    revisionNo: row.revision_no,
    parentRevisionId: row.parent_revision_id,
    iterationId: row.iteration_id,
    state: row.state,
    authoredBySessionId: row.authored_by_session_id,
    createdAt: row.created_at,
  };
}

function toArtifactRelationDto(row: ArtifactRelationRow): ArtifactRelationDto {
  return {
    id: row.id,
    fromRevisionId: row.fromRevisionId,
    toRevisionId: row.toRevisionId,
    relation: row.relation,
    createdAt: row.createdAt,
  };
}

function toPublicArtifactRelationDto(
  row: PublicArtifactRelationDbRow,
): ArtifactRelationDto {
  return {
    id: row.id,
    fromRevisionId: row.from_revision_id,
    toRevisionId: row.to_revision_id,
    relation: row.relation,
    createdAt: row.created_at,
  };
}

function toArtifactUsageDto(row: ArtifactUsageDbRow): ArtifactUsageDto {
  return {
    id: row.id,
    artifactRevisionId: row.artifact_revision_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    feedbackId: row.feedback_id,
    role: row.role,
    lifecycle: row.lifecycle,
    createdAt: row.created_at,
  };
}

function checkedText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must not be empty`);
  return trimmed;
}

function checkedJson(value: JsonValue | null | undefined): JsonValue | null {
  if (value === undefined || value === null) return null;
  return checkedJsonValue(value, false, new Set<object>(), "Artifact metadata");
}

function parseJson(value: string | null): JsonValue | null {
  return value === null ? null : (JSON.parse(value) as JsonValue);
}

function serializeJson(value: JsonValue | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function checkedJsonValue(
  value: unknown,
  binaryContext: boolean,
  seen: Set<object>,
  label: string,
): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error(`${label} contains a non-finite number`);
    return value;
  }
  if (typeof value === "string") {
    if (DATA_URL.test(value))
      throw new Error(`${label} must not contain a data URL`);
    if (binaryContext && isStrictBase64(value)) {
      throw new Error(`${label} contains base64 beneath a binary key`);
    }
    return value;
  }
  if (typeof value !== "object") throw new Error(`${label} must be JSON`);
  if (seen.has(value)) throw new Error(`${label} must not contain cycles`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) =>
        checkedJsonValue(item, binaryContext, seen, label),
      );
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} contains a non-JSON object`);
    }
    const result = Object.create(null) as Record<string, JsonValue>;
    for (const key of Object.keys(value)) {
      if (DATA_URL.test(key))
        throw new Error(`${label} must not contain a data URL`);
      result[key] = checkedJsonValue(
        (value as Record<string, unknown>)[key],
        binaryContext || BINARY_KEYS.has(key.toLowerCase()),
        seen,
        label,
      );
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function isStrictBase64(value: string): boolean {
  return (
    value.length >= 4 &&
    value.length % 4 === 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    ) &&
    Buffer.from(value, "base64").toString("base64") === value
  );
}
