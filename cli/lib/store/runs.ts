import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ralphDir } from "../paths.js";
import { appendActivity } from "./activity.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import {
  ingestObject,
  type ObjectScope,
} from "./objects.js";
import { assertActiveSessionScope } from "./sessions.js";
import type {
  JsonValue,
  ObjectStorageClass,
  RunAggregate,
  RunAttemptRow,
  RunObjectRow,
  RunRow,
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

type RunObjectDbRow = {
  id: string;
  run_id: string;
  object_id: string | null;
  path: string;
  purpose: string;
  state: string;
  retention: string;
  bytes: number | null;
  sha256: string | null;
  metadata_json: string | null;
  created_at: number;
};

const RUN_COLUMNS =
  "id, workspace_id, project_id, agent_session_id, kind, label, state, metadata_json, created_at, started_at, ended_at, error";
const ATTEMPT_COLUMNS =
  "id, run_id, attempt_no, provider, model, state, request_json, response_json, cost_usd, error, started_at, ended_at";
const RUN_OBJECT_COLUMNS =
  "id, run_id, object_id, path, purpose, state, retention, bytes, sha256, metadata_json, created_at";
const TERMINAL_STATES = new Set<RunState>([
  "succeeded",
  "failed",
  "cancelled",
]);
const DATA_URL =
  /data:(?:[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+)?(?:;[a-z0-9!#$&^_.+-]+=[^;,\s]+)*(?:;base64)?,[^\s"'<>]*/i;
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
}): RunRow {
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
    return getRunRow(db, id)!;
  });
}

export function startRunAttempt(input: {
  runId: string;
  provider?: string | null;
  model?: string | null;
  request?: JsonValue | null;
}): RunAttemptRow {
  const provider = optionalText(input.provider, "Run Attempt provider");
  const model = optionalText(input.model, "Run Attempt model");
  const request = checkedJson(input.request, "Run Attempt request");
  return withImmediateTransaction((db) => {
    const run = requireRun(db, input.runId);
    if (run.state === "running") {
      throw new StoreConflictError("Run is already running");
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
    return getRunAttemptRow(db, id)!;
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
): RunAttemptRow {
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
    return getRunAttemptRow(db, id)!;
  });
}

export function finishRun(
  id: string,
  input: {
    state: "succeeded" | "failed" | "cancelled";
    error?: string | null;
  },
): RunRow {
  assertTerminalState(input.state, "Run");
  return withImmediateTransaction((db) => {
    const run = requireRun(db, id);
    if (run.state !== "pending" && run.state !== "running") {
      throw new StoreConflictError("Run is already terminal");
    }
    const endedAt = Date.now();
    const result = db.prepare(
      "UPDATE runs SET state = ?, ended_at = ?, error = ? WHERE id = ? AND state IN ('pending', 'running')",
    ).run(input.state, endedAt, input.error ?? null, id);
    if (!result.changes) throw new StoreConflictError("Run is already terminal");
    appendActivity(db, {
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      entityType: "run",
      entityId: id,
      action: "run.finished",
      payload: { state: input.state },
      createdAt: endedAt,
    });
    return getRunRow(db, id)!;
  });
}

export function recordRunObject(input: {
  runId: string;
  path: string;
  purpose: string;
  state: string;
  retention: string;
  bytes?: number | null;
  sha256?: string | null;
  metadata?: JsonValue | null;
}): RunObjectRow {
  const locator = checkedRunObjectPath(input.path);
  const purpose = checkedText(input.purpose, "RunObject purpose");
  const state = checkedText(input.state, "RunObject state");
  const retention = checkedText(input.retention, "RunObject retention");
  const bytes = checkedBytes(input.bytes);
  const sha256 = checkedSha256(input.sha256);
  const metadata = checkedJson(input.metadata, "RunObject metadata");
  return withImmediateTransaction((db) => {
    const run = requireRun(db, input.runId);
    const id = newDomainId("robj");
    const createdAt = Date.now();
    db.prepare(
      `INSERT INTO run_objects
       (id, run_id, path, purpose, state, retention, bytes, sha256, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      run.id,
      locator,
      purpose,
      state,
      retention,
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
      payload: { runId: run.id, path: locator },
      createdAt,
    });
    return getRunObjectRow(db, id)!;
  });
}

export async function promoteRunObject(input: {
  runObjectId: string;
  mime: string;
  storageClass: ObjectStorageClass;
  originalName?: string;
  destinationScope?: ObjectScope;
}): Promise<RunObjectRow> {
  const initialDb = openDomainDb();
  const runObject = getRunObjectRow(initialDb, input.runObjectId);
  if (!runObject) throw new Error(`RunObject not found: ${input.runObjectId}`);
  if (runObject.objectId !== null) {
    throw new StoreConflictError("RunObject is already promoted");
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
  const object = await ingestObject({
    scope,
    sourcePath,
    originalName: input.originalName ?? path.posix.basename(runObject.path),
    mime: input.mime,
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
    return getRunObjectRow(db, current.id)!;
  });
}

export function getRun(id: string): RunAggregate {
  const db = openDomainDb();
  const run = getRunRow(db, id);
  if (!run) throw new Error(`Run not found: ${id}`);
  return {
    ...run,
    attempts: db
      .query<RunAttemptDbRow, [string]>(
        `SELECT ${ATTEMPT_COLUMNS} FROM run_attempts WHERE run_id = ? ORDER BY attempt_no ASC, id ASC`,
      )
      .all(id)
      .map(toRunAttemptRow),
    objects: db
      .query<RunObjectDbRow, [string]>(
        `SELECT ${RUN_OBJECT_COLUMNS} FROM run_objects WHERE run_id = ? ORDER BY created_at ASC, id ASC`,
      )
      .all(id)
      .map(toRunObjectRow),
  };
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
    bytes: row.bytes,
    sha256: row.sha256,
    metadata: parseJson(row.metadata_json),
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
