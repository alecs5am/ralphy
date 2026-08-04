import type { JsonValue } from "../store/types.js";

export type AgentTurnEventKind =
  | "started"
  | "text-delta"
  | "tool-start"
  | "tool-end"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentTurnDto = {
  turnId: string;
  agentSessionId: string;
  chatId: string | null;
  provider: string;
  resumedFromTurnId: string | null;
  createdAt: number;
};

export type AgentTurnEventDto = {
  turnId: string;
  sequence: number;
  kind: AgentTurnEventKind;
  data: JsonValue;
  createdAt: number;
};
