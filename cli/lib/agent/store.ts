import { appendActivity } from "../store/activity.js";
import { openDomainDb, withImmediateTransaction } from "../store/db.js";
import type { JsonValue } from "../store/types.js";
import type { AgentTurnDto, AgentTurnEventDto, AgentTurnEventKind } from "./types.js";

export type CreateAgentTurnInput = {
  turnId: string;
  agentSessionId: string;
  provider: string;
  chatId?: string | null;
  resumedFromTurnId?: string | null;
};

export function createAgentTurn(input: CreateAgentTurnInput): AgentTurnDto {
  return withImmediateTransaction((db) => createAgentTurnInTransaction(db, input));
}

export function createAgentTurnInTransaction(
  db: ReturnType<typeof openDomainDb>,
  input: CreateAgentTurnInput,
): AgentTurnDto {
    const session = db
      .query<{ workspaceId: string; projectId: string | null }, [string]>(
        "SELECT workspace_id AS workspaceId, project_id AS projectId FROM agent_sessions WHERE id = ? AND ended_at IS NULL",
      )
      .get(input.agentSessionId);
    if (!session) throw new Error("Agent Session not found or ended");
    const createdAt = Date.now();
    db.prepare(
      `INSERT INTO agent_turns
       (run_id, agent_session_id, chat_id, provider, resumed_from_run_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      checked(input.turnId, "turnId"),
      input.agentSessionId,
      input.chatId ?? null,
      checked(input.provider, "provider"),
      input.resumedFromTurnId ?? null,
      createdAt,
    );
    appendActivity(db, {
      workspaceId: session.workspaceId,
      projectId: session.projectId,
      entityType: "agent_turn",
      entityId: input.turnId,
      action: "agent_turn.started",
      payload: { provider: input.provider },
      createdAt,
    });
    return readTurn(db, input.turnId)!;
}

export function getAgentTurn(turnId: string): AgentTurnDto {
  const turn = readTurn(openDomainDb(), checked(turnId, "turnId"));
  if (!turn) throw new Error(`Agent turn not found: ${turnId}`);
  return turn;
}

export function appendAgentTurnEvent(input: {
  turnId: string;
  kind: AgentTurnEventKind;
  data?: JsonValue;
}): AgentTurnEventDto {
  return withImmediateTransaction((db) => appendAgentTurnEventInTransaction(db, input));
}

export function appendAgentTurnEventInTransaction(
  db: ReturnType<typeof openDomainDb>,
  input: {
    turnId: string;
    kind: AgentTurnEventKind;
    data?: JsonValue;
  },
): AgentTurnEventDto {
    const turn = readTurn(db, input.turnId);
    if (!turn) throw new Error(`Agent turn not found: ${input.turnId}`);
    const terminal = db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM agent_turn_events WHERE run_id = ? AND kind IN ('completed','failed','cancelled')",
      )
      .get(input.turnId)?.count ?? 0;
    if (terminal > 0) throw new Error("Agent turn is already terminal");
    const sequence =
      db.query<{ sequence: number | null }, [string]>(
        "SELECT MAX(sequence) AS sequence FROM agent_turn_events WHERE run_id = ?",
      ).get(input.turnId)?.sequence ?? 0;
    const createdAt = Date.now();
    db.prepare(
      "INSERT INTO agent_turn_events (run_id, sequence, kind, data_json, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(input.turnId, sequence + 1, input.kind, JSON.stringify(input.data ?? {}), createdAt);
    return {
      turnId: input.turnId,
      sequence: sequence + 1,
      kind: input.kind,
      data: input.data ?? {},
      createdAt,
    };
}

export function listAgentTurnEvents(turnId: string, afterSequence = 0): AgentTurnEventDto[] {
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) throw new Error("Agent event cursor is invalid");
  const rows = openDomainDb().query<{
    run_id: string;
    sequence: number;
    kind: AgentTurnEventKind;
    data_json: string;
    created_at: number;
  }, [string, number]>(
    `SELECT run_id, sequence, kind, data_json, created_at
     FROM agent_turn_events WHERE run_id = ? AND sequence > ? ORDER BY sequence ASC`,
  ).all(turnId, afterSequence);
  return rows.map((row) => ({
    turnId: row.run_id,
    sequence: row.sequence,
    kind: row.kind,
    data: JSON.parse(row.data_json) as JsonValue,
    createdAt: row.created_at,
  }));
}

export function setAgentProviderResumeId(turnId: string, providerResumeId: string): void {
  withImmediateTransaction((db) => {
    const result = db.prepare(
      "UPDATE agent_turns SET provider_resume_id = ? WHERE run_id = ? AND provider_resume_id IS NULL",
    ).run(checked(providerResumeId, "providerResumeId"), turnId);
    if (!result.changes) throw new Error("Agent provider resume ID is already set or turn is missing");
  });
}

function readTurn(db: ReturnType<typeof openDomainDb>, turnId: string): AgentTurnDto | null {
  const row = db.query<{
    run_id: string;
    agent_session_id: string;
    chat_id: string | null;
    provider: string;
    resumed_from_run_id: string | null;
    created_at: number;
  }, [string]>(
    `SELECT run_id, agent_session_id, chat_id, provider,
            resumed_from_run_id, created_at FROM agent_turns WHERE run_id = ?`,
  ).get(turnId);
  return row ? {
    turnId: row.run_id,
    agentSessionId: row.agent_session_id,
    chatId: row.chat_id,
    provider: row.provider,
    resumedFromTurnId: row.resumed_from_run_id,
    createdAt: row.created_at,
  } : null;
}

function checked(value: string, label: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}
