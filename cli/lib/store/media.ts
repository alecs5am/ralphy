import type { Database } from "bun:sqlite";
import { setArtifactRevisionStateInTransaction } from "./artifacts.js";
import { appendActivity } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { createEvaluationInTransaction } from "./evaluations.js";
import { newDomainId } from "./ids.js";
import { assertLimit, buildPage, decodeCursor } from "./pagination.js";
import {
  resolveQueryContext,
  type QueryContext,
  type ResolvedScope,
} from "./scope-context.js";
import { assertActiveSessionScope } from "./sessions.js";
import type {
  ArtifactMediaCard,
  EvaluationDto,
  MediaCard,
  MediaRef,
  MediaRefType,
  ObjectMediaCard,
  Page,
  ReviewMediaInput,
  ReviewMediaResult,
  RunObjectMediaCard,
} from "./types.js";
import { StoreConflictError } from "./types.js";

/**
 * Every non-null direct foreign key to `objects(id)`. A schema-introspection
 * test fails if the database gains or loses one, so migration schema must extend
 * this registry before landing its own Object reference.
 */
export const OBJECT_REFERENCE_SOURCES = [
  { table: "artifact_revisions", column: "object_id" },
  { table: "composition_revision_files", column: "object_id" },
  { table: "run_objects", column: "object_id" },
  { table: "job_artifacts", column: "object_id" },
  { table: "storage_transfer_entries", column: "object_id" },
  { table: "migration_entries", column: "raw_evidence_object_id" },
] as const;

const REVIEW_VERDICTS = {
  shortlist: "candidate",
  approved: "approved",
  rejected: "rejected",
  "needs-work": "candidate",
} as const;

const MAX_REFS = 100;
const MAX_FEEDBACK_BYTES = 4_096;

export function getMediaCard(input: {
  context: QueryContext;
  ref: MediaRef;
}): MediaCard {
  return getMediaCards({ context: input.context, refs: [input.ref] })[0]!;
}

/**
 * Resolves a caller-ordered batch of mixed refs. Every ref is authorized before
 * any card is built, and a single invisible or unknown ref rejects the whole
 * request without revealing which one failed.
 */
export function getMediaCards(input: {
  context: QueryContext;
  refs: MediaRef[];
}): MediaCard[] {
  if (!Array.isArray(input.refs) || input.refs.length < 1 || input.refs.length > MAX_REFS) {
    throw new Error(`Media request must carry 1..${MAX_REFS} refs`);
  }
  const keys = input.refs.map((ref) => `${checkedRefType(ref)}:${checkedId(ref.id)}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error("Media refs must be distinct");
  }
  const db = openDomainDb();
  return db.transaction(() => {
    const scope = resolveQueryContext(db, input.context);
    const cards = input.refs.map((ref) => readCard(db, scope, ref));
    if (cards.some((card) => card === null)) {
      throw new Error("Media request contains an unresolvable ref");
    }
    return cards as MediaCard[];
  })();
}

export function listMedia(input: {
  context: QueryContext;
  types?: MediaRefType[];
  after?: string | null;
  limit: number;
}): Page<MediaCard> {
  assertLimit(input.limit);
  const types = new Set<MediaRefType>(
    input.types === undefined
      ? ["artifact", "run-object", "object"]
      : input.types.map((type) => checkedRefType({ type })),
  );
  if (types.size === 0) throw new Error("Media request needs at least one type");
  const db = openDomainDb();
  return db.transaction(() => {
    const scope = resolveQueryContext(db, input.context);
    const cursor = input.after == null ? null : decodeCursor("c1", input.after);
    const rows: { type: MediaRefType; id: string; createdAt: number }[] = [];
    for (const type of types) {
      rows.push(...readIdentities(db, scope, type, cursor, input.limit + 1));
    }
    rows.sort(
      (left, right) =>
        left.createdAt - right.createdAt ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
    const page = buildPage(rows.slice(0, input.limit + 1), input.limit, "c1", (row) => ({
      ordinal: row.createdAt,
      id: row.id,
    }));
    return {
      items: page.items.map(
        (row) => readCard(db, scope, { type: row.type, id: row.id })!,
      ),
      nextCursor: page.nextCursor,
    };
  })();
}

/**
 * One immediate transaction: a new immutable state revision from the selected
 * revision, advanced selection, one immutable Evaluation on the new revision,
 * optional Project feedback, and redacted activity. Any failure rolls back all
 * of it.
 */
export function reviewMedia(input: ReviewMediaInput): ReviewMediaResult {
  if (!Object.hasOwn(REVIEW_VERDICTS, input.verdict)) {
    throw new Error(`Invalid media review verdict: ${String(input.verdict)}`);
  }
  if (checkedRefType(input.ref) !== "artifact") {
    throw new Error("Only an Artifact ref is reviewable");
  }
  const feedbackBody =
    input.feedback === undefined || input.feedback === null
      ? null
      : checkedFeedback(input.feedback);
  return withImmediateTransaction((db) => {
    const artifact = db
      .query<
        {
          id: string;
          workspaceId: string;
          projectId: string | null;
          selectedRevisionId: string | null;
        },
        [string]
      >(
        `SELECT id, workspace_id AS workspaceId, project_id AS projectId,
                selected_revision_id AS selectedRevisionId
         FROM artifacts WHERE id = ?`,
      )
      .get(checkedId(input.ref.id));
    if (!artifact) throw new Error(`Artifact not found: ${input.ref.id}`);
    if (artifact.selectedRevisionId === null) {
      throw new Error("An unselected Artifact must be selected before review");
    }
    if (input.expectedSelectedRevisionId !== artifact.selectedRevisionId) {
      throw new StoreConflictError("Artifact selection conflict");
    }
    assertActiveSessionScope(db, input.authoredBySessionId, artifact);

    const projectOwned = artifact.projectId !== null;
    if (!projectOwned && (input.iterationId != null || feedbackBody !== null)) {
      throw new Error(
        "A Workspace Artifact review accepts no Iteration or feedback",
      );
    }
    if (projectOwned && input.verdict === "needs-work") {
      if (input.iterationId == null || feedbackBody === null) {
        throw new Error(
          "needs-work on a Project Artifact requires an Iteration and feedback",
        );
      }
    }
    if (feedbackBody !== null && input.iterationId == null) {
      throw new Error("Project feedback requires an Iteration");
    }

    const revision = setArtifactRevisionStateInTransaction(db, {
      revisionId: artifact.selectedRevisionId,
      state: REVIEW_VERDICTS[input.verdict],
      authoredBySessionId: input.authoredBySessionId,
    });
    const evaluation: EvaluationDto = createEvaluationInTransaction(db, {
      target: { type: "artifact_revision", id: revision.id },
      authoredBySessionId: input.authoredBySessionId,
      kind: "media-review",
      verdict: input.verdict,
      ...(input.favorite === undefined ? {} : { favorite: input.favorite }),
      ...(input.rating === undefined ? {} : { rating: input.rating }),
      ...(input.tags === undefined ? {} : { tags: input.tags }),
      ...(input.note === undefined ? {} : { note: input.note }),
    });

    let feedbackId: string | null = null;
    if (input.iterationId != null) {
      const iteration = db
        .query<{ projectId: string; state: string }, [string]>(
          "SELECT project_id AS projectId, state FROM project_iterations WHERE id = ?",
        )
        .get(input.iterationId);
      if (!iteration) {
        throw new Error(`Iteration not found: ${input.iterationId}`);
      }
      if (iteration.projectId !== artifact.projectId || iteration.state !== "active") {
        throw new Error(
          "Project feedback requires an active Iteration in the same Project",
        );
      }
      if (feedbackBody === null) {
        throw new Error("Project feedback requires non-empty text");
      }
      feedbackId = newDomainId("fb");
      db.prepare(
        `INSERT INTO feedback_items
         (id, iteration_id, target_type, target_id, timecode_ms, body, status,
          resolution_note, created_at, resolved_at)
         VALUES (?, ?, 'artifact_revision', ?, NULL, ?, 'open', NULL, ?, NULL)`,
      ).run(feedbackId, input.iterationId, revision.id, feedbackBody, revision.createdAt);
    }

    appendActivity(db, {
      workspaceId: artifact.workspaceId,
      projectId: artifact.projectId,
      entityType: "artifact",
      entityId: artifact.id,
      action: "artifact.reviewed",
      payload: {
        revisionId: revision.id,
        verdict: input.verdict,
        state: revision.state,
        feedbackAdded: feedbackId !== null,
      },
      createdAt: revision.createdAt,
    });
    return {
      card: readCard(db, { workspaceId: artifact.workspaceId, projectId: artifact.projectId }, {
        type: "artifact",
        id: artifact.id,
      }) as ArtifactMediaCard,
      revisionId: revision.id,
      evaluation,
      feedbackId,
    };
  });
}

function readIdentities(
  db: Database,
  scope: ResolvedScope,
  type: MediaRefType,
  cursor: { ordinal: number; id: string } | null,
  limit: number,
): { type: MediaRefType; id: string; createdAt: number }[] {
  const visibility = visibilityClause(scope, type);
  const clauses = [visibility.sql];
  const values: (string | number)[] = [...visibility.values];
  if (cursor) {
    clauses.push(`(${visibility.createdAt} > ? OR (${visibility.createdAt} = ? AND ${visibility.id} > ?))`);
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(limit);
  return db
    .query<{ id: string; createdAt: number }, (string | number)[]>(
      `SELECT ${visibility.id} AS id, ${visibility.createdAt} AS createdAt
       FROM ${visibility.from} WHERE ${clauses.join(" AND ")}
       ORDER BY ${visibility.createdAt} ASC, ${visibility.id} ASC LIMIT ?`,
    )
    .all(...values)
    .map((row) => ({ type, id: row.id, createdAt: row.createdAt }));
}

function visibilityClause(
  scope: ResolvedScope,
  type: MediaRefType,
): {
  from: string;
  id: string;
  createdAt: string;
  sql: string;
  values: (string | number)[];
} {
  const shape =
    type === "artifact"
      ? {
          from: "artifacts",
          id: "id",
          createdAt: "created_at",
          workspace: "workspace_id",
          project: "project_id",
        }
      : type === "object"
        ? {
            from: "objects",
            id: "id",
            createdAt: "created_at",
            workspace: "workspace_id",
            project: "project_id",
          }
        : {
            from:
              "run_objects runObject JOIN runs run ON run.id = runObject.run_id",
            id: "runObject.id",
            createdAt: "runObject.created_at",
            workspace: "run.workspace_id",
            project: "run.project_id",
          };
  const sql =
    scope.projectId === null
      ? `${shape.workspace} = ? AND ${shape.project} IS NULL`
      : `${shape.workspace} = ? AND (${shape.project} IS NULL OR ${shape.project} = ?)`;
  const values =
    scope.projectId === null
      ? [scope.workspaceId]
      : [scope.workspaceId, scope.projectId];
  return { from: shape.from, id: shape.id, createdAt: shape.createdAt, sql, values };
}

function readCard(
  db: Database,
  scope: ResolvedScope,
  ref: MediaRef,
): MediaCard | null {
  const type = checkedRefType(ref);
  const id = checkedId(ref.id);
  if (type === "artifact") return readArtifactCard(db, scope, id);
  if (type === "object") return readObjectCard(db, scope, id);
  return readRunObjectCard(db, scope, id);
}

function visible(scope: ResolvedScope, workspaceId: string | null, projectId: string | null): boolean {
  if (workspaceId !== scope.workspaceId) return false;
  return scope.projectId === null
    ? projectId === null
    : projectId === null || projectId === scope.projectId;
}

function readArtifactCard(
  db: Database,
  scope: ResolvedScope,
  id: string,
): ArtifactMediaCard | null {
  const row = db
    .query<
      {
        workspaceId: string;
        projectId: string | null;
        slug: string;
        kind: string;
        selectedRevisionId: string | null;
        state: string | null;
        mime: string | null;
        bytes: number | null;
        createdAt: number | null;
        revisionCount: number;
      },
      [string]
    >(
      `SELECT artifact.workspace_id AS workspaceId, artifact.project_id AS projectId,
              artifact.slug AS slug, artifact.kind AS kind,
              artifact.selected_revision_id AS selectedRevisionId,
              selected.state AS state, object.mime AS mime, object.bytes AS bytes,
              selected.created_at AS createdAt,
              (SELECT COUNT(*) FROM artifact_revisions revision
               WHERE revision.artifact_id = artifact.id) AS revisionCount
       FROM artifacts artifact
       LEFT JOIN artifact_revisions selected
         ON selected.id = artifact.selected_revision_id
       LEFT JOIN objects object ON object.id = selected.object_id
       WHERE artifact.id = ?`,
    )
    .get(id);
  if (!row || !visible(scope, row.workspaceId, row.projectId)) return null;
  return {
    ref: { type: "artifact", id },
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    slug: row.slug,
    kind: row.kind,
    selectedRevisionId: row.selectedRevisionId,
    selectedState: row.state,
    mime: row.mime,
    bytes: row.bytes,
    selectedAt: row.createdAt,
    revisionCount: row.revisionCount,
  };
}

function readRunObjectCard(
  db: Database,
  scope: ResolvedScope,
  id: string,
): RunObjectMediaCard | null {
  const row = db
    .query<
      {
        workspaceId: string | null;
        projectId: string | null;
        runId: string;
        purpose: string;
        state: string;
        retention: string;
        mime: string | null;
        bytes: number | null;
        createdAt: number;
        objectId: string | null;
      },
      [string]
    >(
      `SELECT run.workspace_id AS workspaceId, run.project_id AS projectId,
              runObject.run_id AS runId, runObject.purpose AS purpose,
              runObject.state AS state, runObject.retention AS retention,
              runObject.mime AS mime, runObject.bytes AS bytes,
              runObject.created_at AS createdAt, runObject.object_id AS objectId
       FROM run_objects runObject JOIN runs run ON run.id = runObject.run_id
       WHERE runObject.id = ?`,
    )
    .get(id);
  if (!row || !visible(scope, row.workspaceId, row.projectId)) return null;
  return {
    ref: { type: "run-object", id },
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    runId: row.runId,
    purpose: row.purpose,
    state: row.state,
    retention: row.retention,
    mime: row.mime,
    bytes: row.bytes,
    createdAt: row.createdAt,
    objectId: row.objectId,
  };
}

function readObjectCard(
  db: Database,
  scope: ResolvedScope,
  id: string,
): ObjectMediaCard | null {
  const row = db
    .query<
      {
        workspaceId: string;
        projectId: string | null;
        storageClass: string;
        mime: string;
        bytes: number;
        createdAt: number;
      },
      [string]
    >(
      `SELECT workspace_id AS workspaceId, project_id AS projectId,
              storage_class AS storageClass, mime, bytes, created_at AS createdAt
       FROM objects WHERE id = ?`,
    )
    .get(id);
  if (!row || !visible(scope, row.workspaceId, row.projectId)) return null;
  const referenceCount = OBJECT_REFERENCE_SOURCES.reduce(
    (total, source) =>
      total +
      db
        .query<{ total: number }, [string]>(
          `SELECT COUNT(*) AS total FROM ${source.table}
           WHERE ${source.column} = ?`,
        )
        .get(id)!.total,
    0,
  );
  return {
    ref: { type: "object", id },
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    storageClass: row.storageClass,
    mime: row.mime,
    bytes: row.bytes,
    createdAt: row.createdAt,
    referenceCount,
  };
}

function checkedRefType(ref: { type: string }): MediaRefType {
  if (ref.type === "artifact" || ref.type === "run-object" || ref.type === "object") {
    return ref.type;
  }
  throw new Error(`Invalid media ref type: ${String(ref.type)}`);
}

function checkedId(value: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128) {
    throw new Error("Media ref ID must be 1..128 characters");
  }
  return value;
}

function checkedFeedback(value: string): string {
  const body = value.trim();
  if (!body || Buffer.byteLength(body, "utf8") > MAX_FEEDBACK_BYTES) {
    throw new Error(`Media review feedback must be 1..${MAX_FEEDBACK_BYTES} bytes`);
  }
  return body;
}
