import { openDomainDb } from "../../cli/lib/store/db.js";
import type {
  RunAggregate,
  RunAttemptRow,
  RunObjectRow,
  RunRow,
} from "../../cli/lib/store/internal-types.js";
import type { JsonValue } from "../../cli/lib/store/types.js";

type RunDbRow = {
  id: string;
  workspace_id: string | null;
  project_id: string | null;
  agent_session_id: string | null;
  kind: string;
  label: string | null;
  state: RunRow["state"];
  metadata_json: string | null;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
  error: string | null;
};

type AttemptDbRow = {
  id: string;
  run_id: string;
  attempt_no: number;
  provider: string | null;
  model: string | null;
  state: RunRow["state"];
  request_json: string | null;
  response_json: string | null;
  cost_usd: number | null;
  error: string | null;
  started_at: number;
  ended_at: number | null;
};

type ObjectDbRow = {
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

export function getRunAggregate(id: string): RunAggregate {
  const db = openDomainDb();
  const row = db
    .query<RunDbRow, [string]>(
      `SELECT id, workspace_id, project_id, agent_session_id, kind, label,
              state, metadata_json, created_at, started_at, ended_at, error
       FROM runs WHERE id = ?`,
    )
    .get(id);
  if (!row) throw new Error(`Run not found: ${id}`);
  const run: RunRow = {
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
  const attempts = db
    .query<AttemptDbRow, [string]>(
      `SELECT id, run_id, attempt_no, provider, model, state, request_json,
              response_json, cost_usd, error, started_at, ended_at
       FROM run_attempts WHERE run_id = ? ORDER BY attempt_no ASC, id ASC`,
    )
    .all(id)
    .map<RunAttemptRow>((attempt) => ({
      id: attempt.id,
      runId: attempt.run_id,
      attemptNo: attempt.attempt_no,
      provider: attempt.provider,
      model: attempt.model,
      state: attempt.state,
      request: parseJson(attempt.request_json),
      response: parseJson(attempt.response_json),
      costUsd: attempt.cost_usd,
      error: attempt.error,
      startedAt: attempt.started_at,
      endedAt: attempt.ended_at,
    }));
  const objects = db
    .query<ObjectDbRow, [string]>(
      `SELECT id, run_id, object_id, path, purpose, state, retention, bytes,
              sha256, metadata_json, created_at
       FROM run_objects WHERE run_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(id)
    .map<RunObjectRow>((object) => ({
      id: object.id,
      runId: object.run_id,
      objectId: object.object_id,
      path: object.path,
      purpose: object.purpose,
      state: object.state,
      retention: object.retention,
      bytes: object.bytes,
      sha256: object.sha256,
      metadata: parseJson(object.metadata_json),
      createdAt: object.created_at,
    }));
  return { ...run, attempts, objects };
}

function parseJson(value: string | null): JsonValue | null {
  return value === null ? null : (JSON.parse(value) as JsonValue);
}
