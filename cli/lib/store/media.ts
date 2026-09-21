import type { Database } from "bun:sqlite";
import { setArtifactRevisionStateInTransaction } from "./artifacts.js";
import { appendActivity } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { createEvaluationInTransaction } from "./evaluations.js";
import { newDomainId } from "./ids.js";
import { assertLimit } from "./pagination.js";
import { MEDIA_SORTS, decodeMediaCursor, descendingMediaSort, encodeMediaCursor, mediaCursorScope, type MediaCursor, type MediaSort } from "./media-query.js";
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
  MediaFilter,
  MediaKind,
  MediaProvenance,
  MediaRef,
  MediaRefType,
  ObjectMediaCard,
  Page,
  ReviewMediaInput,
  ReviewMediaResult,
  RunObjectMediaCard,
} from "./types.js";
import { StoreConflictError } from "./types.js";
import {
  ARTIFACT_REVISION_PRODUCERS_SQL,
  resolveRunQueryAccess,
  runObjectLocationClass,
} from "./runs.js";

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
const MEDIA_KINDS = new Set<MediaKind>(["image", "video", "audio", "document", "other"]);
const MEDIA_PROVENANCE = new Set<MediaProvenance>(["generation", "not-generation", "unknown"]);

type MediaIdentity = {
  type: MediaRefType;
  id: string;
  createdAt: number;
  sortValue: string | number;
  mediaKind: MediaKind;
  provenance: MediaProvenance;
};
type RunAccess = ReturnType<typeof resolveRunQueryAccess>;

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
  const refs = input.refs.map((ref) => ({
    type: checkedRefType(ref),
    id: checkedId(ref.id),
  }));
  const keys = refs.map((ref) => `${ref.type}:${ref.id}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error("Media refs must be distinct");
  }
  const db = openDomainDb();
  return db.transaction(() => {
    const scope = resolveQueryContext(db, input.context);
    const runAccess = resolveRunQueryAccess(db, input.context);
    const identities = new Map<string, MediaIdentity>();
    for (const type of new Set(refs.map((ref) => ref.type))) {
      const ids = refs.filter((ref) => ref.type === type).map((ref) => ref.id);
      for (const identity of readIdentities(db, scope, runAccess, type, {
        ids,
        limit: ids.length,
      })) {
        identities.set(`${type}:${identity.id}`, identity);
      }
    }
    const cards = refs.map((ref, index) => {
      const identity = identities.get(keys[index]!);
      return identity === undefined
        ? null
        : readCard(db, input.context, scope, ref, identity, runAccess);
    });
    if (cards.some((card) => card === null)) {
      throw new Error("Media request contains an unresolvable ref");
    }
    return cards as MediaCard[];
  })();
}

export function listMedia(input: {
  context: QueryContext;
  types?: MediaRefType[];
  projectOnly?: boolean;
  filter?: MediaFilter;
  mediaKind?: MediaKind;
  provenance?: MediaProvenance;
  search?: string;
  sort?: MediaSort;
  after?: string | null;
  limit: number;
}): Page<MediaCard> {
  const db = openDomainDb();
  return db.transaction(() => listMediaInDatabase(
    db,
    input.context,
    resolveQueryContext(db, input.context),
    input,
  ))();
}

/** @internal Shared by bounded overview projections inside their read transaction. */
export function listMediaInDatabase(
  db: Database,
  context: QueryContext,
  scope: ResolvedScope,
  input: {
    types?: MediaRefType[];
    projectOnly?: boolean;
    filter?: MediaFilter;
    mediaKind?: MediaKind;
    provenance?: MediaProvenance;
    search?: string;
    sort?: MediaSort;
    after?: string | null;
    limit: number;
  },
): Page<MediaCard> {
  assertLimit(input.limit);
  if (input.search !== undefined && (typeof input.search !== "string" || input.search.length > 256)) throw new Error("Media search must be at most 256 characters");
  if (input.sort !== undefined && !MEDIA_SORTS.includes(input.sort)) throw new Error("Invalid Media sort");
  const search = input.search?.trim();
  const types = new Set<MediaRefType>(
    input.types === undefined
      ? ["artifact", "run-object", "object"]
      : input.types.map((type) => checkedRefType({ type })),
  );
  if (types.size === 0) throw new Error("Media request needs at least one type");
  const mediaKind = input.mediaKind === undefined ? undefined : checkedMediaKind(input.mediaKind);
  const provenance = input.provenance === undefined
    ? undefined
    : checkedMediaProvenance(input.provenance);
  const runAccess = resolveRunQueryAccess(db, context);
  const sort = input.sort ?? "oldest";
  if (input.projectOnly && scope.projectId === null) throw new Error("Project-only Media requires a Project context");
  const cursorScope = input.search !== undefined || input.sort !== undefined
    ? mediaCursorScope([scope, runAccess, [...types].sort(), input.projectOnly ?? false, input.filter ?? null, mediaKind ?? null, provenance ?? null, search?.toLowerCase() ?? "", sort])
    : null;
  const cursor = input.after == null ? null : decodeMediaCursor(input.after, cursorScope, sort);
  const rows: MediaIdentity[] = [];
  for (const type of types) {
    rows.push(...readIdentities(db, scope, runAccess, type, {
      filter: input.filter,
      projectOnly: input.projectOnly,
      mediaKind,
      provenance,
      search,
      sort: input.sort,
      cursor,
      limit: input.limit + 1,
    }));
  }
  rows.sort((left, right) => {
    const order = typeof left.sortValue === "string"
      ? Buffer.compare(Buffer.from(left.sortValue), Buffer.from(String(right.sortValue)))
      : left.sortValue - Number(right.sortValue);
    return (descendingMediaSort(sort) ? -1 : 1) * (order || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  });
  const items = rows.slice(0, input.limit);
  const last = items.at(-1);
  const nextCursor = rows.length > input.limit && last
    ? encodeMediaCursor({ value: last.sortValue, id: last.id }, cursorScope) : null;
  return {
    items: items.map(
      (row) => readCard(
        db,
        context,
        scope,
        { type: row.type, id: row.id },
        row,
        runAccess,
      )!,
    ),
    nextCursor,
  };
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
      card: readCard(
        db,
        input.context ?? { sessionId: input.authoredBySessionId },
        { workspaceId: artifact.workspaceId, projectId: artifact.projectId },
        { type: "artifact", id: artifact.id },
      ) as ReviewMediaResult["card"],
      revisionId: revision.id,
      evaluation,
      feedbackId,
    };
  });
}

function readIdentities(
  db: Database,
  scope: ResolvedScope,
  runAccess: RunAccess,
  type: MediaRefType,
  input: {
    filter?: MediaFilter;
    projectOnly?: boolean;
    mediaKind?: MediaKind;
    provenance?: MediaProvenance;
    search?: string;
    sort?: MediaSort;
    cursor?: MediaCursor | null;
    ids?: readonly string[];
    limit: number;
  },
): MediaIdentity[] {
  const source = mediaIdentitySource(scope, runAccess, type);
  const innerClauses = [source.visibilitySql, source.authorizationSql];
  const values: (string | number)[] = [
    ...source.joinValues,
    ...source.visibilityValues,
    ...source.authorizationValues,
  ];
  const predicate = mediaFilterClause(type, input.filter);
  innerClauses.push(predicate.sql);
  values.push(...predicate.values);
  if (input.projectOnly) {
    innerClauses.push(`${source.project} = ?`);
    values.push(scope.projectId!);
  }
  if (input.ids !== undefined) {
    innerClauses.push(`${source.id} IN (${input.ids.map(() => "?").join(", ")})`);
    values.push(...input.ids);
  }
  const clauses = ["1"];
  if (input.search) {
    clauses.push("instr(lower(identity.searchText || ' ' || identity.mediaKind || ' ' || identity.provenance), lower(?)) > 0");
    values.push(input.search);
  }
  if (input.mediaKind !== undefined) {
    clauses.push("identity.mediaKind = ?");
    values.push(input.mediaKind);
  }
  if (input.provenance !== undefined) {
    clauses.push("identity.provenance = ?");
    values.push(input.provenance);
  }
  if (input.cursor) {
    const comparator = descendingMediaSort(input.sort) ? "<" : ">";
    clauses.push(`(identity.sortValue ${comparator} ? OR (identity.sortValue = ? AND identity.id ${comparator} ?))`);
    values.push(input.cursor.value, input.cursor.value, input.cursor.id);
  }
  values.push(input.limit);
  const sortValue = input.sort === "name" ? `lower(${source.name})`
    : input.sort === "size" ? `COALESCE(${source.bytes}, -1)`
      : input.sort === "selected" ? source.selectedAt : source.createdAt;
  const direction = descendingMediaSort(input.sort) ? "DESC" : "ASC";
  return db
    .query<Omit<MediaIdentity, "type">, (string | number)[]>(
      `SELECT identity.id, identity.createdAt, identity.sortValue,
              identity.mediaKind, identity.provenance
       FROM (
         SELECT ${source.id} AS id, ${source.createdAt} AS createdAt,
                ${sortValue} AS sortValue, ${source.searchText} AS searchText,
                ${mediaKindSql(source.mime)} AS mediaKind,
                ${source.provenance} AS provenance
         FROM ${source.from}
         WHERE ${innerClauses.join(" AND ")}
       ) identity
       WHERE ${clauses.join(" AND ")}
       ORDER BY identity.sortValue ${direction}, identity.id ${direction} LIMIT ?`,
    )
    .all(...values)
    .map((row) => ({ type, ...row }));
}

function mediaFilterClause(
  type: MediaRefType,
  filter: MediaFilter | undefined,
): { sql: string; values: string[] } {
  if (filter === undefined) return { sql: "1", values: [] };
  if (filter === "advanced-objects") {
    return { sql: type === "object" ? "1" : "0", values: [] };
  }
  if (filter === "references") {
    return {
      sql: type === "artifact"
        ? `EXISTS (
            SELECT 1 FROM artifact_usages usage
            WHERE usage.artifact_revision_id = selectedMedia.id
              AND usage.role = 'reference'
          )`
        : "0",
      values: [],
    };
  }
  if (["candidate", "approved", "rejected", "superseded"].includes(filter)) {
    return {
      sql: type === "artifact"
        ? "selectedMedia.state = ?"
        : "0",
      values: type === "artifact" ? [filter] : [],
    };
  }
  if (filter === "working") {
    return {
      sql: type === "artifact"
        ? "selectedMedia.state = 'working'"
        : type === "run-object" ? "runObject.state = 'working'" : "0",
      values: [],
    };
  }
  if (filter === "run-diagnostics") {
    return {
      sql: type === "run-object"
        ? `(runObject.state IN ('diagnostic', 'failed')
            OR runObject.retention IN ('diagnostic', 'keep-on-failure'))`
        : "0",
      values: [],
    };
  }
  if (filter === "run-cache-temp") {
    return {
      sql: type === "run-object"
        ? `(runObject.path GLOB 'cache/*' OR runObject.path GLOB 'tmp/*')`
        : "0",
      values: [],
    };
  }
  throw new Error(`Invalid Media filter: ${String(filter)}`);
}

function mediaIdentitySource(
  scope: ResolvedScope,
  runAccess: RunAccess,
  type: MediaRefType,
): {
  from: string;
  id: string;
  createdAt: string;
  name: string;
  bytes: string;
  selectedAt: string;
  searchText: string;
  mime: string;
  provenance: string;
  project: string;
  joinValues: (string | number)[];
  visibilitySql: string;
  visibilityValues: (string | number)[];
  authorizationSql: string;
  authorizationValues: (string | number)[];
} {
  const shape =
    type === "artifact"
      ? {
          from: `artifacts
            LEFT JOIN artifact_revisions selectedMedia
              ON selectedMedia.id = COALESCE(
                artifacts.selected_revision_id,
                (SELECT latest.id FROM artifact_revisions latest
                 WHERE latest.artifact_id = artifacts.id
                 ORDER BY latest.revision_no DESC, latest.id DESC LIMIT 1)
              )
            LEFT JOIN objects mediaObject ON mediaObject.id = selectedMedia.object_id
            LEFT JOIN (
              SELECT producer.artifactRevisionId,
                     COUNT(*) AS producerCount,
                     CASE WHEN COUNT(*) = 1 THEN MIN(producer.runId) END AS soleRunId
              FROM (${ARTIFACT_REVISION_PRODUCERS_SQL}) producer
              GROUP BY producer.artifactRevisionId
            ) producer ON producer.artifactRevisionId = selectedMedia.id
            LEFT JOIN runs run
              ON run.id = producer.soleRunId AND (${runAccess.sql})`,
          id: "artifacts.id",
          createdAt: "artifacts.created_at",
          name: "artifacts.slug", bytes: "mediaObject.bytes",
          selectedAt: "COALESCE(selectedMedia.created_at, -1)",
          searchText: `artifacts.slug || ' ' || artifacts.kind || ' ' || COALESCE(mediaObject.mime, '') || ' ' ||
            COALESCE((SELECT group_concat(role, ' ') FROM artifact_usages WHERE artifact_revision_id = selectedMedia.id), '') || ' ' ||
            COALESCE((SELECT group_concat(unit.slug || ' ' || replace(unit.slug, '-', ' '), ' ') FROM unit_items item
              JOIN units unit ON COALESCE(unit.selected_revision_id, unit.latest_revision_id) = item.unit_revision_id
              WHERE item.artifact_revision_id = selectedMedia.id
                AND unit.workspace_id = artifacts.workspace_id
                AND (unit.project_id IS NULL OR unit.project_id = ?)), '')`,
          workspace: "artifacts.workspace_id",
          project: "artifacts.project_id",
          mime: "mediaObject.mime",
          provenance: `CASE
            WHEN COALESCE(producer.producerCount, 0) <> 1 OR run.id IS NULL THEN 'unknown'
            WHEN run.kind = 'generation' OR substr(run.kind, 1, 9) = 'generate.' THEN 'generation'
            ELSE 'not-generation'
          END`,
          joinValues: [scope.projectId ?? "", ...runAccess.values],
          authorizationSql: "1",
          authorizationValues: [],
        }
      : type === "object"
        ? {
            from: "objects",
            id: "objects.id",
            createdAt: "objects.created_at",
            name: "objects.id", bytes: "objects.bytes", selectedAt: "objects.created_at",
            searchText: "objects.id || ' ' || COALESCE(objects.mime, '')",
            workspace: "objects.workspace_id",
            project: "objects.project_id",
            mime: "objects.mime",
            provenance: "'unknown'",
            joinValues: [],
            authorizationSql: "1",
            authorizationValues: [],
          }
        : {
            from:
              "run_objects runObject JOIN runs run ON run.id = runObject.run_id",
            id: "runObject.id",
            createdAt: "runObject.created_at",
            name: "replace(runObject.purpose, '-', ' ')", bytes: "runObject.bytes", selectedAt: "runObject.created_at",
            searchText: "runObject.purpose || ' ' || replace(runObject.purpose, '-', ' ') || ' ' || runObject.path || ' ' || COALESCE(runObject.mime, '')",
            workspace: "run.workspace_id",
            project: "run.project_id",
            mime: "runObject.mime",
            provenance: `CASE
              WHEN run.kind = 'generation' OR substr(run.kind, 1, 9) = 'generate.' THEN 'generation'
              ELSE 'not-generation'
            END`,
            joinValues: [],
            authorizationSql: runAccess.sql,
            authorizationValues: runAccess.values,
          };
  const visibilitySql =
    scope.projectId === null
      ? `${shape.workspace} = ? AND ${shape.project} IS NULL`
      : `${shape.workspace} = ? AND (${shape.project} IS NULL OR ${shape.project} = ?)`;
  const visibilityValues =
    scope.projectId === null
      ? [scope.workspaceId]
      : [scope.workspaceId, scope.projectId];
  return { ...shape, visibilitySql, visibilityValues };
}

function mediaKindSql(mime: string): string {
  const value = `lower(COALESCE(${mime}, ''))`;
  return `CASE
    WHEN ${value} LIKE 'image/%' THEN 'image'
    WHEN ${value} LIKE 'video/%' THEN 'video'
    WHEN ${value} LIKE 'audio/%' THEN 'audio'
    WHEN ${value} LIKE 'text/%'
      OR ${value} LIKE 'application/%+json'
      OR ${value} LIKE 'application/%+xml'
      OR ${value} IN (
      'application/pdf', 'application/json', 'application/xml',
      'application/rtf', 'application/x-rtf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation'
    ) THEN 'document'
    ELSE 'other'
  END`;
}

function readCard(
  db: Database,
  context: QueryContext,
  scope: ResolvedScope,
  ref: MediaRef,
  identity?: MediaIdentity,
  runAccess = resolveRunQueryAccess(db, context),
): MediaCard | null {
  const type = checkedRefType(ref);
  const id = checkedId(ref.id);
  const classification = identity ?? readIdentities(db, scope, runAccess, type, {
    ids: [id],
    limit: 1,
  })[0];
  if (!classification) return null;
  const card = type === "artifact"
    ? readArtifactCard(db, scope, id)
    : type === "object"
      ? readObjectCard(db, scope, id)
      : readRunObjectCard(db, scope, id);
  return card === null ? null : {
    ...card,
    mediaKind: classification.mediaKind,
    provenance: classification.provenance,
  } as MediaCard;
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
        latestReviewVerdict: ArtifactMediaCard["latestReviewVerdict"] | null;
        mime: string | null;
        bytes: number | null;
        selectedObjectId: string | null;
        storageClass: string | null;
        createdAt: number | null;
        revisionCount: number;
      },
      [string]
    >(
      `SELECT artifact.workspace_id AS workspaceId, artifact.project_id AS projectId,
              artifact.slug AS slug, artifact.kind AS kind,
              selected.id AS selectedRevisionId,
              selected.state AS state, object.mime AS mime, object.bytes AS bytes,
              (SELECT verdict FROM evaluations
               WHERE artifact_revision_id = selected.id
                 AND kind = 'media-review' AND verdict IN ('approved', 'needs-work', 'rejected', 'shortlist')
               ORDER BY created_at DESC, id DESC LIMIT 1) AS latestReviewVerdict,
              selected.object_id AS selectedObjectId, object.storage_class AS storageClass,
              selected.created_at AS createdAt,
              (SELECT COUNT(*) FROM artifact_revisions revision
               WHERE revision.artifact_id = artifact.id) AS revisionCount
       FROM artifacts artifact
       LEFT JOIN artifact_revisions selected
         ON selected.id = COALESCE(
           artifact.selected_revision_id,
           (SELECT latest.id FROM artifact_revisions latest
            WHERE latest.artifact_id = artifact.id
            ORDER BY latest.revision_no DESC, latest.id DESC LIMIT 1)
         )
       LEFT JOIN objects object ON object.id = selected.object_id
       WHERE artifact.id = ?`,
    )
    .get(id);
  if (!row || !visible(scope, row.workspaceId, row.projectId)) return null;
  const usageRoles = db.query<{ role: string }, [string]>(
    `SELECT DISTINCT role FROM artifact_usages
     WHERE artifact_revision_id = ? ORDER BY role ASC`,
  ).all(row.selectedRevisionId ?? "").map((usage) => usage.role);
  return {
    ref: { type: "artifact", id },
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    slug: row.slug,
    kind: row.kind,
    selectedRevisionId: row.selectedRevisionId,
    selectedState: row.state,
    ...(row.latestReviewVerdict ? { latestReviewVerdict: row.latestReviewVerdict } : {}),
    mime: row.mime,
    bytes: row.bytes,
    selectedAt: row.createdAt,
    revisionCount: row.revisionCount,
    selectedObjectId: row.selectedObjectId,
    storageClass: row.storageClass,
    usageRoles,
    target: row.selectedObjectId === null ? null : { type: "object", id: row.selectedObjectId },
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
        logicalPath: string;
        createdAt: number;
        objectId: string | null;
      },
      [string]
    >(
      `SELECT run.workspace_id AS workspaceId, run.project_id AS projectId,
              runObject.run_id AS runId, runObject.purpose AS purpose,
              runObject.state AS state, runObject.retention AS retention,
              runObject.mime AS mime, runObject.bytes AS bytes,
              runObject.path AS logicalPath,
              runObject.created_at AS createdAt, runObject.object_id AS objectId
       FROM run_objects runObject JOIN runs run ON run.id = runObject.run_id
       WHERE runObject.id = ?`,
    )
    .get(id);
  if (!row || !visible(scope, row.workspaceId, row.projectId)) return null;
  const locationClass = runObjectLocationClass(row.logicalPath);
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
    logicalPath: row.logicalPath,
    locationClass,
    attemptId: null,
    attemptNo: null,
    createdAt: row.createdAt,
    objectId: row.objectId,
    target: row.objectId === null
      ? { type: "run-object", id }
      : { type: "object", id: row.objectId },
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
    target: { type: "object", id },
  };
}

function checkedMediaKind(value: MediaKind): MediaKind {
  if (!MEDIA_KINDS.has(value)) throw new Error(`Invalid media kind: ${String(value)}`);
  return value;
}

function checkedMediaProvenance(value: MediaProvenance): MediaProvenance {
  if (!MEDIA_PROVENANCE.has(value)) {
    throw new Error(`Invalid media provenance: ${String(value)}`);
  }
  return value;
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
