import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ralphDir } from "../paths.js";
import { appendActivity } from "./activity.js";
import { requireConsumerSession } from "./consumer-runs.js";
import {
  afterDomainCommit,
  openDomainDb,
  withImmediateTransaction,
} from "./db.js";
import { newDomainId } from "./ids.js";
import { ingestObjectRow } from "./internal-objects.js";
import type { ObjectScope } from "./objects.js";
import { assertActiveSessionScope } from "./sessions.js";
import { assertLimit, buildPage, decodeCursor } from "./pagination.js";
import { cleanupRunSecretMaterialization } from "./secrets.js";
import {
  resolveQueryContext,
  scopeVisibilityClause,
  type QueryContext,
} from "./scope-context.js";
import type {
  RunAttemptRow,
  RunObjectRow,
  RunResultRow,
  RunRow,
} from "./internal-types.js";
import type {
  JsonValue,
  ObjectStorageClass,
  Page,
  RunAttemptDto,
  RunDto,
  RunObjectDto,
  RunResultEntityType,
  RunResultDto,
} from "./types.js";
import { StoreConflictError } from "./types.js";

type RunState = RunRow["state"];

type RunDbRow = {
  id: string;
  workspace_id: string | null;
  project_id: string | null;
  agent_session_id: string | null;
  kind: string;
  label: string | null;
  state: RunState;
  metadata_json: string | null;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
  error: string | null;
};

type RunDtoDbRow = {
  id: string;
  workspace_id: string | null;
  project_id: string | null;
  agent_session_id: string | null;
  kind: string;
  label: string | null;
  state: RunState;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
};

type RunAttemptDbRow = {
  id: string;
  run_id: string;
  attempt_no: number;
  provider: string | null;
  model: string | null;
  state: RunState;
  request_json: string | null;
  response_json: string | null;
  cost_usd: number | null;
  error: string | null;
  started_at: number;
  ended_at: number | null;
};

type RunAttemptDtoDbRow = {
  id: string;
  run_id: string;
  attempt_no: number;
  provider: string | null;
  model: string | null;
  state: RunState;
  cost_usd: number | null;
  started_at: number;
  ended_at: number | null;
};

type RunObjectDbRow = {
  id: string;
  run_id: string;
  object_id: string | null;
  path: string;
  purpose: string;
  state: string;
  retention: string;
  mime: string | null;
  bytes: number | null;
  sha256: string | null;
  metadata_json: string | null;
  created_at: number;
};

type RunObjectDtoDbRow = {
  id: string;
  workspace_id: string | null;
  project_id: string | null;
  run_id: string;
  object_id: string | null;
  purpose: string;
  state: string;
  retention: string;
  mime: string | null;
  bytes: number | null;
  created_at: number;
};

type RunResultDbRow = {
  id: string;
  run_id: string;
  position: number;
  entity_type: RunResultEntityType;
  entity_id: string;
  created_at: number;
};

const RUN_COLUMNS =
  "id, workspace_id, project_id, agent_session_id, kind, label, state, metadata_json, created_at, started_at, ended_at, error";
const RUN_DTO_COLUMNS =
  "id, workspace_id, project_id, agent_session_id, kind, label, state, created_at, started_at, ended_at";
const ATTEMPT_COLUMNS =
  "id, run_id, attempt_no, provider, model, state, request_json, response_json, cost_usd, error, started_at, ended_at";
const ATTEMPT_DTO_COLUMNS =
  "attempt.id, attempt.run_id, attempt.attempt_no, attempt.provider, attempt.model, attempt.state, attempt.cost_usd, attempt.started_at, attempt.ended_at";
const RUN_OBJECT_COLUMNS =
  "id, run_id, object_id, path, purpose, state, retention, mime, bytes, sha256, metadata_json, created_at";
const RUN_OBJECT_DTO_COLUMNS =
  "run_object.id, run.workspace_id, run.project_id, run_object.run_id, run_object.object_id, run_object.purpose, run_object.state, run_object.retention, run_object.mime, run_object.bytes, run_object.created_at";
const RUN_RESULT_COLUMNS =
  "id, run_id, position, entity_type, entity_id, created_at";
const RUN_RESULT_ENTITY_TYPES = new Set<RunResultEntityType>([
  "document_revision",
  "artifact_revision",
  "composition_revision",
  "build",
  "build_output",
  "unit_revision",
  "unit_item",
  "unit_presentation",
  "publication",
  "metric_snapshot",
]);
const TERMINAL_STATES = new Set<RunState>([
  "succeeded",
  "failed",
  "cancelled",
]);
const DATA_URL =
  /data:(?:[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+)?(?:;[a-z0-9!#$&^_.+-]+=[^;,\s]+)*(?:;base64)?,[^\s"'<>]*/i;
const RUN_OBJECT_MIME =
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/;
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

export function startRun(input: {
  workspaceId?: string | null;
  projectId?: string | null;
  agentSessionId?: string | null;
  kind: string;
  label?: string | null;
  metadata?: JsonValue | null;
}): RunDto {
  const kind = checkedText(input.kind, "Run kind");
  const label =
    input.label === undefined || input.label === null
      ? null
      : checkedText(input.label, "Run label");
  const metadata = checkedJson(input.metadata, "Run metadata");
  return withImmediateTransaction((db) => {
    const scope = resolveRunScope(db, input);
    if (input.agentSessionId != null) {
      if (scope.workspaceId === null) {
        throw new Error("Unscoped migration Run does not accept an Agent Session");
      }
      assertActiveSessionScope(db, input.agentSessionId, {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      });
    }
    const id = newDomainId("run");
    const createdAt = Date.now();
    db.prepare(
      `INSERT INTO runs
       (id, workspace_id, project_id, agent_session_id, kind, label, state, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).run(
      id,
      scope.workspaceId,
      scope.projectId,
      input.agentSessionId ?? null,
      kind,
      label,
      serializeJson(metadata),
      createdAt,
    );
    appendActivity(db, {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      entityType: "run",
      entityId: id,
      action: "run.created",
      payload: { kind },
      createdAt,
    });
    return toRunDtoFromRow(getRunRow(db, id)!);
  });
}

export function startRunAttempt(input: {
  runId: string;
  provider?: string | null;
  model?: string | null;
  request?: JsonValue | null;
}): RunAttemptDto {
  const provider = optionalText(input.provider, "Run Attempt provider");
  const model = optionalText(input.model, "Run Attempt model");
  const request = checkedJson(input.request, "Run Attempt request");
  return withImmediateTransaction((db) => {
    const run = requireRun(db, input.runId);
    if (run.state === "running") {
      throw new StoreConflictError("Run is already running");
    }
    if (run.state === "succeeded") {
      throw new StoreConflictError("Succeeded Run cannot be retried");
    }
    if (run.state !== "pending" && isExternalRun(db, run.id)) {
      throw new StoreConflictError("External Run retry requires a new Run");
    }
    const attemptNo =
      db
        .query<{ attemptNo: number }, [string]>(
          "SELECT COALESCE(MAX(attempt_no), 0) + 1 AS attemptNo FROM run_attempts WHERE run_id = ?",
        )
        .get(run.id)?.attemptNo ?? 1;
    const id = newDomainId("attempt");
    const startedAt = Date.now();
    db.prepare(
      `INSERT INTO run_attempts
       (id, run_id, attempt_no, provider, model, state, request_json, started_at)
       VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`,
    ).run(
      id,
      run.id,
      attemptNo,
      provider,
      model,
      serializeJson(request),
      startedAt,
    );
    db.prepare(
      `UPDATE runs SET state = 'running', started_at = COALESCE(started_at, ?),
       ended_at = NULL, error = NULL WHERE id = ?`,
    ).run(startedAt, run.id);
    appendActivity(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      entityType: "run_attempt",
      entityId: id,
      action: "run.attempt_started",
      payload: { runId: run.id, attemptNo },
      createdAt: startedAt,
    });
    return toRunAttemptDtoFromRow(getRunAttemptRow(db, id)!);
  });
}

export function finishRunAttempt(
  id: string,
  input: {
    state: "succeeded" | "failed" | "cancelled";
    response?: JsonValue | null;
    costUsd?: number | null;
    error?: string | null;
  },
): RunAttemptDto {
  assertTerminalState(input.state, "Run Attempt");
  const response = checkedJson(input.response, "Run Attempt response");
  const costUsd = checkedCost(input.costUsd);
  return withImmediateTransaction((db) => {
    const attempt = getRunAttemptRow(db, id);
    if (!attempt) throw new Error(`Run Attempt not found: ${id}`);
    if (attempt.state !== "running") {
      throw new StoreConflictError("Run Attempt is not running");
    }
    const endedAt = Date.now();
    const result = db.prepare(
      `UPDATE run_attempts SET state = ?, response_json = ?, cost_usd = ?, error = ?, ended_at = ?
       WHERE id = ? AND state = 'running'`,
    ).run(
      input.state,
      serializeJson(response),
      costUsd,
      input.error ?? null,
      endedAt,
      id,
    );
    if (!result.changes) {
      throw new StoreConflictError("Run Attempt is not running");
    }
    const run = requireRun(db, attempt.runId);
    appendActivity(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      entityType: "run_attempt",
      entityId: id,
      action: "run.attempt_finished",
      payload: { runId: run.id, state: input.state },
      createdAt: endedAt,
    });
    return toRunAttemptDtoFromRow(getRunAttemptRow(db, id)!);
  });
}

export function finishRun(
  id: string,
  input: {
    state: "succeeded" | "failed" | "cancelled";
    error?: string | null;
  },
): RunDto {
  assertTerminalState(input.state, "Run");
  return withImmediateTransaction((db) => finishRunInTransaction(db, id, input));
}

export function recordRunObject(input: {
  runId: string;
  path: string;
  purpose: string;
  state: string;
  retention: string;
  mime?: string | null;
  bytes?: number | null;
  sha256?: string | null;
  metadata?: JsonValue | null;
}): RunObjectDto {
  const locator = checkedRunObjectPath(input.path);
  const purpose = checkedText(input.purpose, "RunObject purpose");
  const state = checkedText(input.state, "RunObject state");
  const retention = checkedText(input.retention, "RunObject retention");
  const mime = checkedRunObjectMime(input.mime);
  const bytes = checkedBytes(input.bytes);
  const sha256 = checkedSha256(input.sha256);
  const metadata = checkedJson(input.metadata, "RunObject metadata");
  return withImmediateTransaction((db) => {
    const run = requireRun(db, input.runId);
    const id = newDomainId("robj");
    const createdAt = Date.now();
    db.prepare(
      `INSERT INTO run_objects
       (id, run_id, path, purpose, state, retention, mime, bytes, sha256, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      run.id,
      locator,
      purpose,
      state,
      retention,
      mime,
      bytes,
      sha256,
      serializeJson(metadata),
      createdAt,
    );
    appendActivity(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      entityType: "run_object",
      entityId: id,
      action: "run.object_recorded",
      payload: { runId: run.id, purpose, state },
      createdAt,
    });
    return toRunObjectDto(getRunObjectRow(db, id)!, run);
  });
}

export async function promoteRunObject(input: {
  runObjectId: string;
  mime: string;
  storageClass: ObjectStorageClass;
  originalName?: string;
  destinationScope?: ObjectScope;
}): Promise<RunObjectDto> {
  const mime = checkedRunObjectMime(input.mime);
  if (mime === null) throw new Error("RunObject promotion MIME is required");
  const initialDb = openDomainDb();
  const runObject = getRunObjectRow(initialDb, input.runObjectId);
  if (!runObject) throw new Error(`RunObject not found: ${input.runObjectId}`);
  if (runObject.objectId !== null) {
    throw new StoreConflictError("RunObject is already promoted");
  }
  if (runObject.mime !== null && runObject.mime !== mime) {
    throw new Error("RunObject promotion MIME does not match recorded evidence");
  }
  const run = requireRun(initialDb, runObject.runId);
  const scope = promotionScope(run, input.destinationScope);
  const sourcePath = resolveRunObjectSource(runObject.path);
  const facts = await inspectPromotionSource(sourcePath);
  if (runObject.bytes !== null && runObject.bytes !== facts.bytes) {
    throw new Error("RunObject byte count does not match recorded evidence");
  }
  if (runObject.sha256 !== null && runObject.sha256 !== facts.sha256) {
    throw new Error("RunObject SHA-256 does not match recorded evidence");
  }
  const object = await ingestObjectRow({
    scope,
    sourcePath,
    originalName: input.originalName ?? path.posix.basename(runObject.path),
    mime,
    storageClass: input.storageClass,
    metadata: runObject.metadata,
    transfer: "move",
  });
  if (object.bytes !== facts.bytes || object.sha256 !== facts.sha256) {
    throw new Error("RunObject promotion source changed during ingestion");
  }

  return withImmediateTransaction((db) => {
    const current = getRunObjectRow(db, input.runObjectId);
    if (!current) throw new Error(`RunObject not found: ${input.runObjectId}`);
    if (current.objectId !== null) {
      throw new StoreConflictError("RunObject is already promoted");
    }
    const result = db
      .prepare(
        "UPDATE run_objects SET object_id = ? WHERE id = ? AND object_id IS NULL",
      )
      .run(object.id, current.id);
    if (!result.changes) {
      throw new StoreConflictError("RunObject is already promoted");
    }
    appendActivity(db, {
      workspaceId: object.workspaceId,
      projectId: object.projectId,
      entityType: "run_object",
      entityId: current.id,
      action: "run.object_promoted",
      payload: { runId: current.runId, objectId: object.id },
    });
    return toRunObjectDto(getRunObjectRow(db, current.id)!, run);
  });
}

export function getRunObject(input: {
  context: QueryContext;
  runObjectId: string;
}): RunObjectDto {
  const db = openDomainDb();
  const access = resolveRunQueryAccess(db, input.context);
  const row = db
    .query<RunObjectDtoDbRow, (string | number)[]>(
      `SELECT ${RUN_OBJECT_DTO_COLUMNS}
       FROM run_objects AS run_object
       JOIN runs AS run ON run.id = run_object.run_id
       WHERE run_object.id = ? AND ${access.sql}`,
    )
    .get(input.runObjectId, ...access.values);
  if (!row) throw new Error(`RunObject not found: ${input.runObjectId}`);
  return toPublicRunObjectDto(row);
}

export function listRunObjects(input: {
  context: QueryContext;
  runId: string;
  after?: string | null;
  limit: number;
}): Page<RunObjectDto> {
  assertLimit(input.limit);
  const db = openDomainDb();
  const access = resolveRunQueryAccess(db, input.context);
  if (!getVisibleRunDtoRow(db, access, input.runId)) {
    throw new Error(`Run not found: ${input.runId}`);
  }
  const clauses = ["run_object.run_id = ?", access.sql];
  const values: (string | number)[] = [input.runId, ...access.values];
  if (input.after != null) {
    const cursor = decodeCursor("c1", input.after);
    clauses.push(
      "(run_object.created_at > ? OR (run_object.created_at = ? AND run_object.id > ?))",
    );
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(input.limit + 1);
  const rows = db
    .query<RunObjectDtoDbRow, (string | number)[]>(
      `SELECT ${RUN_OBJECT_DTO_COLUMNS}
       FROM run_objects AS run_object
       JOIN runs AS run ON run.id = run_object.run_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY run_object.created_at ASC, run_object.id ASC LIMIT ?`,
    )
    .all(...values)
    .map(toPublicRunObjectDto);
  return buildPage(rows, input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function getRun(input: {
  context: QueryContext;
  runId: string;
}): RunDto {
  const db = openDomainDb();
  const access = resolveRunQueryAccess(db, input.context);
  const row = getVisibleRunDtoRow(db, access, input.runId);
  if (!row) throw new Error(`Run not found: ${input.runId}`);
  return toRunDto(row);
}

export function listRuns(input: {
  context: QueryContext;
  after?: string | null;
  limit: number;
}): Page<RunDto> {
  assertLimit(input.limit);
  const db = openDomainDb();
  const access = resolveRunQueryAccess(db, input.context);
  const clauses = [access.sql];
  const values = [...access.values];
  if (input.after != null) {
    const cursor = decodeCursor("c1", input.after);
    clauses.push(
      "(run.created_at > ? OR (run.created_at = ? AND run.id > ?))",
    );
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(input.limit + 1);
  const rows = db
    .query<RunDtoDbRow, (string | number)[]>(
      `SELECT ${RUN_DTO_COLUMNS} FROM runs AS run
       WHERE ${clauses.join(" AND ")}
       ORDER BY run.created_at ASC, run.id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows.map(toRunDto), input.limit, "c1", (row) => ({
    ordinal: row.createdAt,
    id: row.id,
  }));
}

export function getRunAttempt(input: {
  context: QueryContext;
  attemptId: string;
}): RunAttemptDto {
  const db = openDomainDb();
  const access = resolveRunQueryAccess(db, input.context);
  const row = db
    .query<RunAttemptDtoDbRow, (string | number)[]>(
      `SELECT ${ATTEMPT_DTO_COLUMNS}
       FROM run_attempts AS attempt
       JOIN runs AS run ON run.id = attempt.run_id
       WHERE attempt.id = ? AND ${access.sql}`,
    )
    .get(input.attemptId, ...access.values);
  if (!row) throw new Error(`Run Attempt not found: ${input.attemptId}`);
  return toRunAttemptDto(row);
}

export function listRunAttempts(input: {
  context: QueryContext;
  runId: string;
  after?: string | null;
  limit: number;
}): Page<RunAttemptDto> {
  assertLimit(input.limit);
  const db = openDomainDb();
  const access = resolveRunQueryAccess(db, input.context);
  if (!getVisibleRunDtoRow(db, access, input.runId)) {
    throw new Error(`Run not found: ${input.runId}`);
  }
  const clauses = ["attempt.run_id = ?"];
  const values: (string | number)[] = [input.runId];
  if (input.after != null) {
    const cursor = decodeCursor("p1", input.after);
    clauses.push(
      "(attempt.attempt_no > ? OR (attempt.attempt_no = ? AND attempt.id > ?))",
    );
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(input.limit + 1);
  const rows = db
    .query<RunAttemptDtoDbRow, (string | number)[]>(
      `SELECT ${ATTEMPT_DTO_COLUMNS} FROM run_attempts AS attempt
       WHERE ${clauses.join(" AND ")}
       ORDER BY attempt.attempt_no ASC, attempt.id ASC LIMIT ?`,
    )
    .all(...values);
  return buildPage(rows.map(toRunAttemptDto), input.limit, "p1", (row) => ({
    ordinal: row.attemptNo,
    id: row.id,
  }));
}

/** @internal Stores one stable result identity inside the caller's transaction. */
export function recordRunResult(
  db: Database,
  input: {
    runId: string;
    position: number;
    entityType: RunResultEntityType;
    entityId: string;
  },
): RunResultDto {
  if (!RUN_RESULT_ENTITY_TYPES.has(input.entityType)) {
    throw new Error(`Unsupported Run result entity type: ${input.entityType}`);
  }
  if (!Number.isSafeInteger(input.position) || input.position < 0) {
    throw new Error("Run result position must be a non-negative integer");
  }
  const entityId = checkedText(input.entityId, "Run result entity ID");
  const run = getRunRow(db, input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (run.state !== "pending" && run.state !== "running") {
    throw new StoreConflictError("Run results require a pending or running Run");
  }
  const scope = resolveRunResultScope(db, input.entityType, entityId);
  if (!scope) throw new Error(`Run result entity not found: ${entityId}`);
  if (
    scope.workspaceId !== run.workspaceId ||
    scope.projectId !== run.projectId
  ) {
    throw new Error("Run result entity is outside the exact Run scope");
  }
  const id = newDomainId("result");
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO run_results
     (id, run_id, position, entity_type, entity_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, run.id, input.position, input.entityType, entityId, createdAt);
  return toRunResultDto(getRunResultRow(db, id)!);
}

/** @internal Validates a dedicated operation Run before its only attempt. */
export function assertFreshPendingRun(
  db: Database,
  runId: string,
  scope: { workspaceId: string; projectId: string | null },
): void {
  const run = getRunRow(db, runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  if (run.workspaceId !== scope.workspaceId || run.projectId !== scope.projectId) {
    throw new Error("Operation Run is outside the exact entity scope");
  }
  const used = db
    .query<{ count: number }, [string, string]>(
      `SELECT
         (SELECT COUNT(*) FROM run_attempts WHERE run_id = ?) +
         (SELECT COUNT(*) FROM run_results WHERE run_id = ?) AS count`,
    )
    .get(run.id, run.id)?.count ?? 0;
  if (run.state !== "pending" || used !== 0) {
    throw new StoreConflictError("Operation Run must be fresh and pending");
  }
}

/** @internal Starts the only attempt inside an existing transaction. */
export function startRunAttemptInTransaction(
  db: Database,
  input: {
    runId: string;
    provider?: string | null;
    model?: string | null;
    request?: JsonValue | null;
  },
): RunAttemptDto {
  const run = getRunRow(db, input.runId);
  if (!run) throw new Error(`Run not found: ${input.runId}`);
  if (run.state !== "pending") {
    throw new StoreConflictError("Operation Run is not pending");
  }
  const existing = db
    .query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM run_attempts WHERE run_id = ?",
    )
    .get(run.id)?.count ?? 0;
  if (existing !== 0) throw new StoreConflictError("Operation Run already has an attempt");
  const id = newDomainId("attempt");
  const startedAt = Date.now();
  db.prepare(
    `INSERT INTO run_attempts
     (id, run_id, attempt_no, provider, model, state, request_json, started_at)
     VALUES (?, ?, 1, ?, ?, 'running', ?, ?)`,
  ).run(
    id,
    run.id,
    optionalText(input.provider, "Run Attempt provider"),
    optionalText(input.model, "Run Attempt model"),
    serializeJson(checkedJson(input.request, "Run Attempt request")),
    startedAt,
  );
  db.prepare(
    "UPDATE runs SET state = 'running', started_at = ?, ended_at = NULL, error = NULL WHERE id = ? AND state = 'pending'",
  ).run(startedAt, run.id);
  appendActivity(db, {
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    entityType: "run_attempt",
    entityId: id,
    action: "run.attempt_started",
    payload: { runId: run.id, attemptNo: 1 },
    createdAt: startedAt,
  });
  return toRunAttemptDtoFromRow(getRunAttemptRow(db, id)!);
}

/** @internal Finishes the dedicated attempt inside an existing transaction. */
export function finishRunAttemptInTransaction(
  db: Database,
  id: string,
  input: {
    state: "succeeded" | "failed" | "cancelled";
    response?: JsonValue | null;
    error?: string | null;
  },
): RunAttemptDto {
  const attempt = getRunAttemptRow(db, id);
  if (!attempt) throw new Error(`Run Attempt not found: ${id}`);
  if (attempt.state !== "running") {
    throw new StoreConflictError("Run Attempt is not running");
  }
  const endedAt = Date.now();
  db.prepare(
    `UPDATE run_attempts SET state = ?, response_json = ?, error = ?, ended_at = ?
     WHERE id = ? AND state = 'running'`,
  ).run(
    input.state,
    serializeJson(checkedJson(input.response, "Run Attempt response")),
    input.error ?? null,
    endedAt,
    id,
  );
  const run = requireRun(db, attempt.runId);
  appendActivity(db, {
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    entityType: "run_attempt",
    entityId: id,
    action: "run.attempt_finished",
    payload: { runId: run.id, state: input.state },
    createdAt: endedAt,
  });
  return toRunAttemptDtoFromRow(getRunAttemptRow(db, id)!);
}

/** @internal Finishes the dedicated Run inside an existing transaction. */
export function finishRunInTransaction(
  db: Database,
  id: string,
  input: {
    state: "succeeded" | "failed" | "cancelled";
    error?: string | null;
  },
): RunDto {
  const run = requireRun(db, id);
  if (run.state !== "pending" && run.state !== "running") {
    throw new StoreConflictError("Run is already terminal");
  }
  assertNoRunningAttempt(db, id);
  const dataRoot = path.dirname(db.filename);
  afterDomainCommit(db, () => cleanupRunSecretMaterialization(dataRoot, id));
  const endedAt = Date.now();
  db.prepare(
    "UPDATE runs SET state = ?, ended_at = ?, error = ? WHERE id = ? AND state IN ('pending', 'running')",
  ).run(input.state, endedAt, input.error ?? null, id);
  appendActivity(db, {
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    entityType: "run",
    entityId: id,
    action: "run.finished",
    payload: { state: input.state },
    createdAt: endedAt,
  });
  return toRunDtoFromRow(getRunRow(db, id)!);
}

function resolveRunResultScope(
  db: Database,
  entityType: RunResultEntityType,
  entityId: string,
): { workspaceId: string; projectId: string | null } | null {
  const select = {
    document_revision: `SELECT document.workspace_id AS workspaceId, document.project_id AS projectId
      FROM document_revisions revision JOIN documents document ON document.id = revision.document_id
      WHERE revision.id = ?`,
    artifact_revision: `SELECT artifact.workspace_id AS workspaceId, artifact.project_id AS projectId
      FROM artifact_revisions revision JOIN artifacts artifact ON artifact.id = revision.artifact_id
      WHERE revision.id = ?`,
    composition_revision: `SELECT project.workspace_id AS workspaceId, project.id AS projectId
      FROM composition_revisions revision
      JOIN compositions composition ON composition.id = revision.composition_id
      JOIN projects project ON project.id = composition.project_id
      WHERE revision.id = ? AND revision.state = 'sealed'`,
    build: `SELECT project.workspace_id AS workspaceId, project.id AS projectId
      FROM builds build
      JOIN composition_revisions revision ON revision.id = build.composition_revision_id
      JOIN compositions composition ON composition.id = revision.composition_id
      JOIN projects project ON project.id = composition.project_id
      WHERE build.id = ? AND build.state IN ('succeeded', 'failed', 'cancelled')`,
    build_output: `SELECT project.workspace_id AS workspaceId, project.id AS projectId
      FROM build_outputs output JOIN builds build ON build.id = output.build_id
      JOIN composition_revisions revision ON revision.id = build.composition_revision_id
      JOIN compositions composition ON composition.id = revision.composition_id
      JOIN projects project ON project.id = composition.project_id
      WHERE output.id = ? AND build.state = 'succeeded'`,
    unit_revision: `SELECT unit.workspace_id AS workspaceId, unit.project_id AS projectId
      FROM unit_revisions revision JOIN units unit ON unit.id = revision.unit_id
      WHERE revision.id = ? AND revision.sealed_at IS NOT NULL`,
    unit_item: `SELECT unit.workspace_id AS workspaceId, unit.project_id AS projectId
      FROM unit_items item JOIN unit_revisions revision ON revision.id = item.unit_revision_id
      JOIN units unit ON unit.id = revision.unit_id
      WHERE item.id = ? AND revision.sealed_at IS NOT NULL`,
    unit_presentation: `SELECT unit.workspace_id AS workspaceId, unit.project_id AS projectId
      FROM unit_presentations presentation
      JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
      JOIN units unit ON unit.id = revision.unit_id
      WHERE presentation.id = ? AND revision.sealed_at IS NOT NULL`,
    publication: `SELECT unit.workspace_id AS workspaceId, unit.project_id AS projectId
      FROM publications publication
      JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
      JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
      JOIN units unit ON unit.id = revision.unit_id WHERE publication.id = ?`,
    metric_snapshot: `SELECT unit.workspace_id AS workspaceId, unit.project_id AS projectId
      FROM metric_snapshots metric JOIN publications publication ON publication.id = metric.publication_id
      JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
      JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
      JOIN units unit ON unit.id = revision.unit_id WHERE metric.id = ?`,
  } satisfies Record<RunResultEntityType, string>;
  return db
    .query<
      { workspaceId: string; projectId: string | null },
      [string]
    >(select[entityType])
    .get(entityId);
}

function resolveRunScope(
  db: Database,
  input: { workspaceId?: string | null; projectId?: string | null; kind: string },
): { workspaceId: string | null; projectId: string | null } {
  if (input.projectId) {
    const project = db
      .query<{ workspaceId: string }, [string]>(
        "SELECT workspace_id AS workspaceId FROM projects WHERE id = ?",
      )
      .get(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);
    if (input.workspaceId && input.workspaceId !== project.workspaceId) {
      throw new Error("Run Workspace does not own the Project");
    }
    return { workspaceId: project.workspaceId, projectId: input.projectId };
  }
  if (input.workspaceId) {
    if (
      !db
        .query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE id = ?")
        .get(input.workspaceId)
    ) {
      throw new Error(`Workspace not found: ${input.workspaceId}`);
    }
    return { workspaceId: input.workspaceId, projectId: null };
  }
  if (input.kind !== "migration") {
    throw new Error("Only migration Runs may be unscoped");
  }
  return { workspaceId: null, projectId: null };
}

function resolveRunQueryAccess(
  db: Database,
  context: QueryContext,
): { sql: string; values: (string | number)[] } {
  const scope = resolveQueryContext(db, context);
  if (context.sessionId !== undefined) {
    const principalId = db
      .query<{ principalId: string | null }, [string]>(
        `SELECT consumer_principal_id AS principalId
         FROM agent_sessions WHERE id = ?`,
      )
      .get(context.sessionId)?.principalId;
    if (principalId != null) {
      const consumer = requireConsumerSession(
        db,
        context.consumerAuthority,
        context.sessionId,
      );
      return consumer.projectId === null
        ? {
            sql: "run.external_system IS NOT NULL AND run.consumer_principal_id = ? AND run.workspace_id = ? AND run.project_id IS NULL",
            values: [consumer.principalId, consumer.workspaceId],
          }
        : {
            sql: "run.external_system IS NOT NULL AND run.consumer_principal_id = ? AND run.workspace_id = ? AND run.project_id = ?",
            values: [
              consumer.principalId,
              consumer.workspaceId,
              consumer.projectId,
            ],
          };
    }
  }
  return scopeVisibilityClause(
    scope,
    "run.workspace_id",
    "run.project_id",
  );
}

function getVisibleRunDtoRow(
  db: Database,
  access: { sql: string; values: (string | number)[] },
  runId: string,
): RunDtoDbRow | null {
  return (
    db
      .query<RunDtoDbRow, (string | number)[]>(
        `SELECT ${RUN_DTO_COLUMNS} FROM runs AS run
         WHERE run.id = ? AND ${access.sql}`,
      )
      .get(runId, ...access.values) ?? null
  );
}

function promotionScope(run: RunRow, explicit?: ObjectScope): ObjectScope {
  if (run.workspaceId === null) {
    if (!explicit) {
      throw new Error("Unscoped migration Run promotion requires a destination scope");
    }
    return explicit;
  }
  if (explicit) {
    throw new Error("A scoped Run already determines its promotion scope");
  }
  return {
    workspaceId: run.workspaceId,
    ...(run.projectId ? { projectId: run.projectId } : {}),
  };
}

function resolveRunObjectSource(locator: string): string {
  const root = path.resolve(ralphDir());
  const resolved = path.resolve(root, ...locator.split("/"));
  if (!isWithin(root, resolved)) throw new Error("RunObject path escapes .ralphy");
  return resolved;
}

async function inspectPromotionSource(
  sourcePath: string,
): Promise<{ bytes: number; sha256: string }> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.lstat(sourcePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("RunObject promotion source is missing");
    }
    throw error;
  }
  if (!stat.isFile()) {
    throw new Error("RunObject promotion source must be a regular file");
  }
  if (stat.size <= 0) {
    throw new Error("RunObject promotion source must not be empty");
  }
  const root = await fs.promises.realpath(path.resolve(ralphDir()));
  const source = await fs.promises.realpath(sourcePath);
  if (!isWithin(root, source)) throw new Error("RunObject path escapes .ralphy");
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of fs.createReadStream(sourcePath)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

function requireRun(db: Database, id: string): RunRow {
  const run = getRunRow(db, id);
  if (!run) throw new Error(`Run not found: ${id}`);
  return run;
}

function isExternalRun(db: Database, id: string): boolean {
  return (
    db
      .query<{ externalSystem: string | null }, [string]>(
        "SELECT external_system AS externalSystem FROM runs WHERE id = ?",
      )
      .get(id)?.externalSystem != null
  );
}

function assertNoRunningAttempt(db: Database, runId: string): void {
  if (
    db
      .query<{ id: string }, [string]>(
        "SELECT id FROM run_attempts WHERE run_id = ? AND state = 'running' LIMIT 1",
      )
      .get(runId)
  ) {
    throw new StoreConflictError("Run has a running Attempt");
  }
}

function getRunRow(db: Database, id: string): RunRow | null {
  const row = db
    .query<RunDbRow, [string]>(`SELECT ${RUN_COLUMNS} FROM runs WHERE id = ?`)
    .get(id);
  return row ? toRunRow(row) : null;
}

function getRunAttemptRow(db: Database, id: string): RunAttemptRow | null {
  const row = db
    .query<RunAttemptDbRow, [string]>(
      `SELECT ${ATTEMPT_COLUMNS} FROM run_attempts WHERE id = ?`,
    )
    .get(id);
  return row ? toRunAttemptRow(row) : null;
}

function getRunObjectRow(db: Database, id: string): RunObjectRow | null {
  const row = db
    .query<RunObjectDbRow, [string]>(
      `SELECT ${RUN_OBJECT_COLUMNS} FROM run_objects WHERE id = ?`,
    )
    .get(id);
  return row ? toRunObjectRow(row) : null;
}

function getRunResultRow(db: Database, id: string): RunResultRow | null {
  const row = db
    .query<RunResultDbRow, [string]>(
      `SELECT ${RUN_RESULT_COLUMNS} FROM run_results WHERE id = ?`,
    )
    .get(id);
  return row
    ? {
        id: row.id,
        runId: row.run_id,
        position: row.position,
        entityType: row.entity_type,
        entityId: row.entity_id,
        createdAt: row.created_at,
      }
    : null;
}

function toRunRow(row: RunDbRow): RunRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    agentSessionId: row.agent_session_id,
    kind: row.kind,
    label: row.label,
    state: row.state,
    metadata: parseJson(row.metadata_json),
    createdAt: row.created_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    error: row.error,
  };
}

function toRunDto(row: RunDtoDbRow): RunDto {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    agentSessionId: row.agent_session_id,
    kind: row.kind,
    label: row.label,
    state: row.state,
    createdAt: row.created_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function toRunDtoFromRow(row: RunRow): RunDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    agentSessionId: row.agentSessionId,
    kind: row.kind,
    label: row.label,
    state: row.state,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

function toRunAttemptDto(row: RunAttemptDtoDbRow): RunAttemptDto {
  return {
    id: row.id,
    runId: row.run_id,
    attemptNo: row.attempt_no,
    provider: row.provider,
    model: row.model,
    state: row.state,
    costUsd: row.cost_usd,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function toRunAttemptDtoFromRow(row: RunAttemptRow): RunAttemptDto {
  return {
    id: row.id,
    runId: row.runId,
    attemptNo: row.attemptNo,
    provider: row.provider,
    model: row.model,
    state: row.state,
    costUsd: row.costUsd,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

function toRunResultDto(row: RunResultRow): RunResultDto {
  return {
    id: row.id,
    runId: row.runId,
    position: row.position,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt,
  };
}

function toRunAttemptRow(row: RunAttemptDbRow): RunAttemptRow {
  return {
    id: row.id,
    runId: row.run_id,
    attemptNo: row.attempt_no,
    provider: row.provider,
    model: row.model,
    state: row.state,
    request: parseJson(row.request_json),
    response: parseJson(row.response_json),
    costUsd: row.cost_usd,
    error: row.error,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function toRunObjectRow(row: RunObjectDbRow): RunObjectRow {
  return {
    id: row.id,
    runId: row.run_id,
    objectId: row.object_id,
    path: row.path,
    purpose: row.purpose,
    state: row.state,
    retention: row.retention,
    mime: row.mime,
    bytes: row.bytes,
    sha256: row.sha256,
    metadata: parseJson(row.metadata_json),
    createdAt: row.created_at,
  };
}

function toRunObjectDto(row: RunObjectRow, run: RunRow): RunObjectDto {
  return {
    id: row.id,
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    runId: row.runId,
    objectId: row.objectId,
    purpose: row.purpose,
    state: row.state,
    retention: row.retention,
    mime: row.mime,
    bytes: row.bytes,
    createdAt: row.createdAt,
  };
}

function toPublicRunObjectDto(row: RunObjectDtoDbRow): RunObjectDto {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    runId: row.run_id,
    objectId: row.object_id,
    purpose: row.purpose,
    state: row.state,
    retention: row.retention,
    mime: row.mime,
    bytes: row.bytes,
    createdAt: row.created_at,
  };
}

function parseJson(value: string | null): JsonValue | null {
  return value === null ? null : (JSON.parse(value) as JsonValue);
}

function serializeJson(value: JsonValue | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function checkedText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must not be empty`);
  return trimmed;
}

function optionalText(
  value: string | null | undefined,
  label: string,
): string | null {
  return value == null ? null : checkedText(value, label);
}

function assertTerminalState(state: RunState, label: string): void {
  if (!TERMINAL_STATES.has(state)) {
    throw new Error(`${label} finish state must be terminal`);
  }
}

function checkedCost(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Run Attempt cost must be a finite non-negative number");
  }
  return value;
}

function checkedBytes(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("RunObject bytes must be a non-negative integer");
  }
  return value;
}

function checkedSha256(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error("RunObject SHA-256 must be 64 lowercase hex characters");
  }
  return value;
}

function checkedRunObjectMime(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const mime = value.trim();
  if (
    mime.length < 3 ||
    Buffer.byteLength(mime) > 255 ||
    !RUN_OBJECT_MIME.test(mime)
  ) {
    throw new Error("RunObject MIME is invalid");
  }
  return mime;
}

function checkedRunObjectPath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (
    !value ||
    value !== normalized ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    /^data:/i.test(value) ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ||
    normalized
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("RunObject path must be a relative .ralphy locator");
  }
  return value;
}

function checkedJson(
  value: JsonValue | null | undefined,
  label: string,
): JsonValue | null {
  if (value == null) return null;
  return checkedJsonValue(value, false, new Set<object>(), label);
}

function checkedJsonValue(
  value: unknown,
  binaryContext: boolean,
  seen: Set<object>,
  label: string,
): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} contains a non-finite number`);
    }
    return value;
  }
  if (typeof value === "string") {
    if (DATA_URL.test(value)) throw new Error(`${label} must not contain a data URL`);
    if (binaryContext && isStrictBase64(value)) {
      throw new Error(`${label} contains base64 beneath a binary key`);
    }
    return value;
  }
  if (typeof value !== "object") throw new Error(`${label} must be JSON`);
  if (seen.has(value)) throw new Error(`${label} contains a cycle`);
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
    for (const key of Object.keys(value).sort()) {
      if (DATA_URL.test(key)) throw new Error(`${label} must not contain a data URL`);
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

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}
