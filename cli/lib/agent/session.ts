import { withImmediateTransaction } from "../store/db.js";
import { startRunInTransaction } from "../store/runs.js";
import { appendAgentTurnEventInTransaction, createAgentTurnInTransaction, getAgentTurn, listAgentTurnEvents } from "./store.js";
import type { AgentTurnDto, AgentTurnEventDto } from "./types.js";

export function startAgentTurn(input: {
  workspaceId: string;
  projectId?: string | null;
  agentSessionId: string;
  provider: string;
  chatId?: string | null;
  resumedFromTurnId?: string | null;
}): AgentTurnDto {
  return withImmediateTransaction((db) => {
    const run = startRunInTransaction(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      agentSessionId: input.agentSessionId,
      kind: "agent.turn",
      label: input.provider,
    });
    const turn = createAgentTurnInTransaction(db, {
      turnId: run.id,
      agentSessionId: input.agentSessionId,
      provider: input.provider,
      chatId: input.chatId,
      resumedFromTurnId: input.resumedFromTurnId,
    });
    appendAgentTurnEventInTransaction(db, { turnId: turn.turnId, kind: "started" });
    return turn;
  });
}

export function agentTurnStatus(turnId: string, afterSequence = 0): {
  turn: AgentTurnDto;
  events: AgentTurnEventDto[];
} {
  return { turn: getAgentTurn(turnId), events: listAgentTurnEvents(turnId, afterSequence) };
}
