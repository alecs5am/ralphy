import type { Database } from "bun:sqlite";
import { appendActivity } from "./activity.js";
import { assertRequestDigest } from "./canonical-json.js";
import { openDomainDb, withImmediateTransaction } from "./db.js";
import { newDomainId } from "./ids.js";
import { assertLimit, buildPage, decodeCursor } from "./pagination.js";
import { resolveQueryContext, type QueryContext } from "./scope-context.js";
import type {
  ConsumerOperationStart,
  ExternalOperation,
  Page,
  RunDto,
  RunResultDto,
  RunState,
} from "./types.js";
import { StoreConflictError } from "./types.js";

type RunDbRow = {
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
  external_system: string | null;
  external_run_id: string | null;
  external_node_id: string | null;
  external_attempt: number | null;
  external_operation: string | null;
  idempotency_key: string | null;
  request_digest: string | null;
  consumer_principal_id: string | null;
};

const RUN_SELECT =
  "id, workspace_id, project_id, agent_session_id, kind, label, state, " +
  "created_at, started_at, ended_at, external_system, external_run_id, " +
  "external_node_id, external_attempt, external_operation, idempotency_key, " +
  "request_digest, consumer_principal_id";

const BOUNDED = /^[\x21-\x7e]{1,128}$/;

export type StartConsumerOperationRunInput = {
  sessionId: string;
  workspaceId: string;
  projectId?: string;
  kind: string;
  label?: string;
  external: ExternalOperation;
  requestDigest: string;
};

/**
 * Starts or replays the durable boundary of one external operation inside the
 * caller's transaction. A replay returns the original Run and creates nothing,
 * so the caller must skip its initial domain row and Job insert.
 */
export function startConsumerOperationRunInTransaction(
  db: Database,
  input: StartConsumerOperationRunInput,
): ConsumerOperationStart {
  const external = checkedExternal(input.external);
  const requestDigest = assertRequestDigest(input.requestDigest);
  const kind = checkedBounded(input.kind, "Run kind");
  const label = input.label === undefined ? null : checkedBounded(input.label, "Run label");
  const session = requireConsumerSession(db, input.sessionId);
  const scope = requireScope(db, input, session);
  // external_system is derived from the authenticated principal, never trusted
  // from input.
  const externalSystem = `ralphy-${session.namespace}`;

  const byKey = db
    .query<RunDbRow, [string, string]>(
      `SELECT ${RUN_SELECT} FROM runs
       WHERE external_system = ? AND idempotency_key = ?`,
    )
    .get(externalSystem, external.idempotencyKey);
  const byTuple = db
    .query<RunDbRow, [string, string, string, number, string]>(
      `SELECT ${RUN_SELECT} FROM runs
       WHERE external_system = ? AND external_run_id = ? AND external_node_id = ?
         AND external_attempt = ? AND external_operation = ?`,
    )
    .get(
      externalSystem,
      external.runId,
      external.nodeId,
      external.attempt,
      external.operation,
    );
  if (byKey || byTuple) {
    if (!byKey || !byTuple || byKey.id !== byTuple.id) {
      throw new StoreConflictError(
        "External operation tuple and idempotency key disagree",
      );
    }
    assertReplayable(byKey, {
      principalId: session.principalId,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      kind,
      requestDigest,
    });
    return { run: toRunDto(byKey), replayed: true };
  }

  const id = newDomainId("run");
  const createdAt = Date.now();
  db.prepare(
    `INSERT INTO runs
     (id, workspace_id, project_id, agent_session_id, kind, label, state,
      external_system, external_run_id, external_node_id, external_attempt,
      external_operation, idempotency_key, request_digest,
      consumer_principal_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    scope.workspaceId,
    scope.projectId,
    input.sessionId,
    kind,
    label,
    externalSystem,
    external.runId,
    external.nodeId,
    external.attempt,
    external.operation,
    external.idempotencyKey,
    requestDigest,
    session.principalId,
    createdAt,
  );
  appendActivity(db, {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    entityType: "run",
    entityId: id,
    action: "run.created",
    payload: { kind, external: true },
    createdAt,
  });
  return { run: toRunDto(getRunDbRow(db, id)!), replayed: false };
}

export function startConsumerOperationRun(
  input: StartConsumerOperationRunInput,
): ConsumerOperationStart {
  return withImmediateTransaction((db) =>
    startConsumerOperationRunInTransaction(db, input),
  );
}

export type FindConsumerOperationInput = {
  sessionId: string;
  workspaceId: string;
  projectId?: string;
  resultsAfter?: string | null;
  resultsLimit?: number;
} & (
  | { external: Omit<ExternalOperation, "idempotencyKey">; idempotencyKey?: never }
  | { idempotencyKey: string; external?: never }
);

/**
 * Replay lookup for a reconnected consumer. Authorization compares the
 * authenticated principal and scope, never the historical Session ID.
 */
export function findConsumerOperation(input: FindConsumerOperationInput): {
  run: RunDto;
  results: Page<RunResultDto>;
  replayed: true;
} {
  const limit = input.resultsLimit ?? 100;
  assertLimit(limit);
  const db = openDomainDb();
  const session = requireConsumerSession(db, input.sessionId);
  const scope = requireScope(db, input, session);
  const externalSystem = `ralphy-${session.namespace}`;
  const row =
    input.idempotencyKey !== undefined
      ? db
          .query<RunDbRow, [string, string]>(
            `SELECT ${RUN_SELECT} FROM runs
             WHERE external_system = ? AND idempotency_key = ?`,
          )
          .get(externalSystem, checkedBounded(input.idempotencyKey, "Idempotency key"))
      : db
          .query<RunDbRow, [string, string, string, number, string]>(
            `SELECT ${RUN_SELECT} FROM runs
             WHERE external_system = ? AND external_run_id = ?
               AND external_node_id = ? AND external_attempt = ?
               AND external_operation = ?`,
          )
          .get(
            externalSystem,
            checkedBounded(input.external!.runId, "External Run ID"),
            checkedBounded(input.external!.nodeId, "External node ID"),
            checkedAttempt(input.external!.attempt),
            checkedBounded(input.external!.operation, "External operation"),
          );
  if (!row) throw new Error("External operation not found");
  if (
    row.consumer_principal_id !== session.principalId ||
    row.workspace_id !== scope.workspaceId ||
    row.project_id !== scope.projectId
  ) {
    throw new Error("External operation not found");
  }
  return {
    run: toRunDto(row),
    results: readRunResults(db, row.id, input.resultsAfter ?? null, limit),
    replayed: true,
  };
}

/**
 * Position-ordered Run results. An ordinary Run uses normal scoped read
 * visibility; an external Run additionally requires a live consumer Session for
 * its exact principal and scope, so guessing a Run ID cannot bypass replay
 * isolation.
 */
export function listRunResults(input: {
  context: QueryContext;
  runId: string;
  after?: string | null;
  limit: number;
}): Page<RunResultDto> {
  assertLimit(input.limit);
  const db = openDomainDb();
  const row = getRunDbRow(db, input.runId);
  if (!row) throw new Error(`Run not found: ${input.runId}`);
  if (row.external_system !== null) {
    if (input.context.sessionId === undefined) {
      throw new Error("External Run results require a consumer Session");
    }
    const session = requireConsumerSession(db, input.context.sessionId);
    if (
      session.principalId !== row.consumer_principal_id ||
      session.workspaceId !== row.workspace_id ||
      session.projectId !== row.project_id
    ) {
      throw new Error("External Run results require its own consumer principal");
    }
  } else {
    const scope = resolveQueryContext(db, input.context);
    const visible =
      row.workspace_id === scope.workspaceId &&
      (scope.projectId === null
        ? row.project_id === null
        : row.project_id === null || row.project_id === scope.projectId);
    if (!visible) throw new Error(`Run not found: ${input.runId}`);
  }
  return readRunResults(db, input.runId, input.after ?? null, input.limit);
}

function readRunResults(
  db: Database,
  runId: string,
  after: string | null,
  limit: number,
): Page<RunResultDto> {
  const clauses = ["run_id = ?"];
  const values: (string | number)[] = [runId];
  if (after != null) {
    const cursor = decodeCursor("p1", after);
    clauses.push("(position > ? OR (position = ? AND id > ?))");
    values.push(cursor.ordinal, cursor.ordinal, cursor.id);
  }
  values.push(limit + 1);
  const rows = db
    .query<
      {
        id: string;
        run_id: string;
        position: number;
        entity_type: string;
        entity_id: string;
        created_at: number;
      },
      (string | number)[]
    >(
      `SELECT id, run_id, position, entity_type, entity_id, created_at
       FROM run_results WHERE ${clauses.join(" AND ")}
       ORDER BY position ASC, id ASC LIMIT ?`,
    )
    .all(...values)
    .map((row) => ({
      id: row.id,
      runId: row.run_id,
      position: row.position,
      entityType: row.entity_type,
      entityId: row.entity_id,
      createdAt: row.created_at,
    }));
  return buildPage(rows, limit, "p1", (row) => ({
    ordinal: row.position,
    id: row.id,
  }));
}

type ConsumerSession = {
  id: string;
  principalId: string;
  namespace: string;
  workspaceId: string;
  projectId: string | null;
};

function requireConsumerSession(
  db: Database,
  sessionId: string,
): ConsumerSession {
  const row = db
    .query<
      {
        id: string;
        principalId: string | null;
        namespace: string | null;
        workspaceId: string;
        projectId: string | null;
        endedAt: number | null;
        disabledAt: number | null;
      },
      [string]
    >(
      `SELECT session.id AS id, session.consumer_principal_id AS principalId,
              principal.namespace AS namespace, session.workspace_id AS workspaceId,
              session.project_id AS projectId, session.ended_at AS endedAt,
              principal.disabled_at AS disabledAt
       FROM agent_sessions session
       LEFT JOIN consumer_principals principal
         ON principal.id = session.consumer_principal_id
       WHERE session.id = ?`,
    )
    .get(sessionId);
  if (!row) throw new Error(`Agent Session not found: ${sessionId}`);
  if (row.endedAt !== null) throw new Error(`Agent Session is ended: ${sessionId}`);
  if (row.principalId === null || row.namespace === null) {
    throw new Error("External operations require a consumer Session");
  }
  if (row.disabledAt !== null) {
    throw new Error("Consumer principal is disabled");
  }
  return {
    id: row.id,
    principalId: row.principalId,
    namespace: row.namespace,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  };
}

function requireScope(
  db: Database,
  input: { workspaceId: string; projectId?: string },
  session: ConsumerSession,
): { workspaceId: string; projectId: string | null } {
  const projectId = input.projectId ?? null;
  if (session.workspaceId !== input.workspaceId) {
    throw new Error("consumer Session does not contain the operation scope");
  }
  if (session.projectId !== null && session.projectId !== projectId) {
    throw new Error("consumer Session does not contain the operation scope");
  }
  if (projectId !== null) {
    const project = db
      .query<{ workspaceId: string }, [string]>(
        "SELECT workspace_id AS workspaceId FROM projects WHERE id = ?",
      )
      .get(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    if (project.workspaceId !== input.workspaceId) {
      throw new Error("Run Workspace does not own the Project");
    }
  }
  return { workspaceId: input.workspaceId, projectId };
}

function assertReplayable(
  row: RunDbRow,
  expected: {
    principalId: string;
    workspaceId: string;
    projectId: string | null;
    kind: string;
    requestDigest: string;
  },
): void {
  if (
    row.consumer_principal_id !== expected.principalId ||
    row.workspace_id !== expected.workspaceId ||
    row.project_id !== expected.projectId ||
    row.kind !== expected.kind ||
    row.request_digest !== expected.requestDigest
  ) {
    throw new StoreConflictError(
      "External operation replay does not match the original request",
    );
  }
}

function getRunDbRow(db: Database, id: string): RunDbRow | null {
  return (
    db
      .query<RunDbRow, [string]>(`SELECT ${RUN_SELECT} FROM runs WHERE id = ?`)
      .get(id) ?? null
  );
}

export function toRunDto(row: RunDbRow): RunDto {
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

function checkedExternal(external: ExternalOperation): ExternalOperation {
  return {
    runId: checkedBounded(external.runId, "External Run ID"),
    nodeId: checkedBounded(external.nodeId, "External node ID"),
    attempt: checkedAttempt(external.attempt),
    operation: checkedBounded(external.operation, "External operation"),
    idempotencyKey: checkedBounded(external.idempotencyKey, "Idempotency key"),
  };
}

function checkedAttempt(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("External attempt must be a positive safe integer");
  }
  return value;
}

function checkedBounded(value: string, label: string): string {
  if (typeof value !== "string" || !BOUNDED.test(value)) {
    throw new Error(`${label} must be 1..128 printable ASCII bytes`);
  }
  return value;
}
