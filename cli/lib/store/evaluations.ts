import type { Database } from "bun:sqlite";
import { appendActivity } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import { assertLimit, buildPage, decodeCursor } from "./pagination.js";
import {
  resolveQueryContext,
  scopeVisibilityClause,
  type QueryContext,
} from "./scope-context.js";
import { assertActiveSessionScope } from "./sessions.js";
import type {
  EvaluationDto,
  EvaluationTarget,
  EvaluationTargetType,
  JsonValue,
  Page,
} from "./types.js";

type EvaluationDbRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  artifact_revision_id: string | null;
  composition_revision_id: string | null;
  build_id: string | null;
  run_id: string | null;
  authored_by_session_id: string;
  kind: string;
  verdict: string | null;
  favorite: number;
  rating: number | null;
  tags_json: string;
  note: string | null;
  created_at: number;
};

const COLUMNS =
  "id, workspace_id, project_id, artifact_revision_id, composition_revision_id, " +
  "build_id, run_id, authored_by_session_id, kind, verdict, favorite, rating, " +
  "tags_json, note, created_at";

const TARGET_COLUMN: Record<EvaluationTargetType, keyof EvaluationDbRow> = {
  artifact_revision: "artifact_revision_id",
  composition_revision: "composition_revision_id",
  build: "build_id",
  run: "run_id",
};

const MAX_TAGS = 16;
const MAX_TAG_BYTES = 64;
const MAX_NOTE_BYTES = 2_048;
const TAG = /^[a-z0-9][a-z0-9._-]*$/;

export type CreateEvaluationInput = {
  target: EvaluationTarget;
  authoredBySessionId: string;
  kind: string;
  verdict?: string | null;
  favorite?: boolean;
  rating?: number | null;
  tags?: string[];
  note?: string | null;
  report?: JsonValue;
  createdAt?: number;
};

export function createEvaluation(input: CreateEvaluationInput): EvaluationDto {
  return withImmediateTransaction((db) =>
    createEvaluationInTransaction(db, input),
  );
}

/**
 * Transaction-aware so an atomic media review can create its state revision,
 * Evaluation, feedback, and activity in one immediate transaction.
 */
export function createEvaluationInTransaction(
  db: Database,
  input: CreateEvaluationInput,
): EvaluationDto {
  const kind = checkedText(input.kind, "Evaluation kind", 64);
  const verdict =
    input.verdict == null ? null : checkedText(input.verdict, "Evaluation verdict", 64);
  const rating = checkedRating(input.rating ?? null);
  const tags = checkedTags(input.tags ?? []);
  const note = checkedNote(input.note ?? null);
  const scope = deriveTargetScope(db, input.target);
  assertExactEvaluationSessionScope(db, input.authoredBySessionId, scope);
  const id = newDomainId("eval");
  const createdAt = input.createdAt ?? Date.now();
  db.prepare(
    `INSERT INTO evaluations
     (id, workspace_id, project_id, artifact_revision_id, composition_revision_id,
      build_id, run_id, authored_by_session_id, kind, verdict, favorite, rating,
      tags_json, note, report_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    scope.workspaceId,
    scope.projectId,
    input.target.type === "artifact_revision" ? input.target.id : null,
    input.target.type === "composition_revision" ? input.target.id : null,
    input.target.type === "build" ? input.target.id : null,
    input.target.type === "run" ? input.target.id : null,
    input.authoredBySessionId,
    kind,
    verdict,
    input.favorite ? 1 : 0,
    rating,
    JSON.stringify(tags),
    note,
    JSON.stringify(input.report ?? {}),
    createdAt,
  );
  appendActivity(db, {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    entityType: "evaluation",
    entityId: id,
    action: "evaluation.created",
    payload: { kind, targetType: input.target.type },
    createdAt,
  });
  return getEvaluationRow(db, id)!;
}

function assertExactEvaluationSessionScope(
  db: Database,
  sessionId: string,
  scope: { workspaceId: string; projectId: string | null },
): void {
  assertActiveSessionScope(db, sessionId, scope);
  const session = db
    .query<{ projectId: string | null }, [string]>(
      "SELECT project_id AS projectId FROM agent_sessions WHERE id = ?",
    )
    .get(sessionId)!;
  if (session.projectId !== scope.projectId) {
    throw new Error("Agent Session does not match the exact Evaluation scope");
  }
}

export function getEvaluation(
  context: QueryContext,
  evaluationId: string,
): EvaluationDto {
  const db = openDomainDb();
  const scope = resolveQueryContext(db, context);
  const row = getEvaluationRow(db, evaluationId);
  if (!row) throw new Error(`Evaluation not found: ${evaluationId}`);
  const visible =
    row.workspaceId === scope.workspaceId &&
    (scope.projectId === null
      ? row.projectId === null
      : row.projectId === null || row.projectId === scope.projectId);
  if (!visible) throw new Error(`Evaluation not found: ${evaluationId}`);
  return row;
}

export function listEvaluations(input: {
  context: QueryContext;
  targetType?: EvaluationTargetType;
  after?: string | null;
  limit: number;
}): Page<EvaluationDto> {
  assertLimit(input.limit);
  const db = openDomainDb();
  const scope = resolveQueryContext(db, input.context);
  const visibility = scopeVisibilityClause(scope, "workspace_id", "project_id");
  const clauses = [visibility.sql];
  const values: (string | number)[] = [...visibility.values];
  if (input.targetType !== undefined) {
    if (!Object.hasOwn(TARGET_COLUMN, input.targetType)) {
      throw new Error(`Invalid Evaluation target type: ${input.targetType}`);
    }
    clauses.push(`${TARGET_COLUMN[input.targetType]} IS NOT NULL`);
  }
  if (input.after != null) {
    const cursor = decodeCursor("c1", input.after);
    clauses.push("(created_at > ? OR (created_at = ? AND id > ?))");
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(input.limit + 1);
  const rows = db
    .query<EvaluationDbRow, (string | number)[]>(
      `SELECT ${COLUMNS} FROM evaluations WHERE ${clauses.join(" AND ")}
       ORDER BY created_at ASC, id ASC LIMIT ?`,
    )
    .all(...values)
    .map(toEvaluationDto);
  return buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

function getEvaluationRow(db: Database, id: string): EvaluationDto | null {
  const row = db
    .query<EvaluationDbRow, [string]>(
      `SELECT ${COLUMNS} FROM evaluations WHERE id = ?`,
    )
    .get(id);
  return row ? toEvaluationDto(row) : null;
}

function toEvaluationDto(row: EvaluationDbRow): EvaluationDto {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    target: readTarget(row),
    kind: row.kind,
    verdict: row.verdict,
    favorite: row.favorite === 1,
    rating: row.rating,
    tags: JSON.parse(row.tags_json) as string[],
    note: row.note,
    authoredBySessionId: row.authored_by_session_id,
    createdAt: row.created_at,
  };
}

function readTarget(row: EvaluationDbRow): EvaluationTarget {
  if (row.artifact_revision_id !== null) {
    return { type: "artifact_revision", id: row.artifact_revision_id };
  }
  if (row.composition_revision_id !== null) {
    return { type: "composition_revision", id: row.composition_revision_id };
  }
  if (row.build_id !== null) return { type: "build", id: row.build_id };
  if (row.run_id !== null) return { type: "run", id: row.run_id };
  throw new Error(`Evaluation has no target: ${row.id}`);
}

/**
 * Scope is derived from the target, never trusted from input; the persistent
 * `evaluations_scope_insert` trigger re-proves the same rule in SQLite.
 */
function deriveTargetScope(
  db: Database,
  target: EvaluationTarget,
): { workspaceId: string; projectId: string | null } {
  const id = checkedText(target.id, "Evaluation target ID", 128);
  const queries: Record<EvaluationTargetType, string> = {
    artifact_revision: `SELECT artifact.workspace_id AS workspaceId,
             artifact.project_id AS projectId
      FROM artifact_revisions revision
      JOIN artifacts artifact ON artifact.id = revision.artifact_id
      WHERE revision.id = ?`,
    composition_revision: `SELECT project.workspace_id AS workspaceId, project.id AS projectId
      FROM composition_revisions revision
      JOIN compositions composition ON composition.id = revision.composition_id
      JOIN projects project ON project.id = composition.project_id
      WHERE revision.id = ?`,
    build: `SELECT project.workspace_id AS workspaceId, project.id AS projectId
      FROM builds build
      JOIN composition_revisions revision
        ON revision.id = build.composition_revision_id
      JOIN compositions composition ON composition.id = revision.composition_id
      JOIN projects project ON project.id = composition.project_id
      WHERE build.id = ?`,
    run: `SELECT workspace_id AS workspaceId, project_id AS projectId
      FROM runs WHERE id = ?`,
  };
  const query = queries[target.type];
  if (query === undefined) {
    throw new Error(`Invalid Evaluation target type: ${String(target.type)}`);
  }
  const scope = db
    .query<{ workspaceId: string | null; projectId: string | null }, [string]>(
      query,
    )
    .get(id);
  if (!scope) throw new Error(`Evaluation target not found: ${id}`);
  if (scope.workspaceId === null) {
    throw new Error("Evaluation target must belong to a Workspace");
  }
  return { workspaceId: scope.workspaceId, projectId: scope.projectId };
}

function checkedText(value: string, label: string, maxBytes: number): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || Buffer.byteLength(trimmed, "utf8") > maxBytes) {
    throw new Error(`${label} must be 1..${maxBytes} bytes`);
  }
  return trimmed;
}

function checkedRating(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error("Evaluation rating must be an integer from 1 through 5");
  }
  return value;
}

function checkedTags(values: string[]): string[] {
  if (!Array.isArray(values) || values.length > MAX_TAGS) {
    throw new Error(`Evaluation tags must be at most ${MAX_TAGS} entries`);
  }
  const tags = values.map((tag) => {
    if (
      typeof tag !== "string" ||
      !TAG.test(tag) ||
      Buffer.byteLength(tag, "utf8") > MAX_TAG_BYTES
    ) {
      throw new Error("Evaluation tag must be a bounded lowercase slug");
    }
    return tag;
  });
  if (new Set(tags).size !== tags.length) {
    throw new Error("Evaluation tags must be unique");
  }
  return tags;
}

function checkedNote(value: string | null): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > MAX_NOTE_BYTES
  ) {
    throw new Error(`Evaluation note must be 1..${MAX_NOTE_BYTES} bytes`);
  }
  return value;
}
