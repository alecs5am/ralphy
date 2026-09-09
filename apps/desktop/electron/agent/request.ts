import type {
  AgentChatRequest,
  AgentProvider,
  ProjectReference,
} from "../media/types";

const MAX_PROMPT_BYTES = 128 * 1024;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL_ID = /^[~a-zA-Z0-9][a-zA-Z0-9._~:/-]{0,255}$/;

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !value
    || value.length > 256
    || value === "."
    || value === ".."
    || /[/\\\0]/.test(value)
  ) throw new Error(`Invalid agent ${label}`);
  return value;
}

function projectReference(value: unknown): ProjectReference | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid agent project");
  }
  const row = value as Record<string, unknown>;
  return {
    workspaceId: identifier(row.workspaceId, "workspace id"),
    projectId: identifier(row.projectId, "project id"),
  };
}

function provider(value: unknown): AgentProvider {
  if (value === "claude" || value === "codex" || value === "openrouter") return value;
  throw new Error("Invalid agent provider");
}

export function parseAgentChatRequest(value: unknown): AgentChatRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid agent chat request");
  }
  const row = value as Record<string, unknown>;
  if (Object.hasOwn(row, "rootPath") || Object.hasOwn(row, "storeId")) {
    throw new Error("Agent root binding is main-owned");
  }
  const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
  if (!prompt || Buffer.byteLength(prompt) > MAX_PROMPT_BYTES) {
    throw new Error("Invalid agent prompt");
  }
  if (typeof row.model !== "string" || !MODEL_ID.test(row.model)) {
    throw new Error("Invalid agent model");
  }
  if (
    row.permissionMode !== "auto"
    && row.permissionMode !== "plan"
    && row.permissionMode !== "full"
  ) throw new Error("Invalid agent permission mode");
  if (
    row.claudeAuthMethod !== undefined
    && row.claudeAuthMethod !== "subscription"
    && row.claudeAuthMethod !== "api-key"
  ) throw new Error("Invalid Claude authentication method");
  if (
    row.workspaceId !== undefined
    && row.workspaceId !== null
    && (typeof row.workspaceId !== "string" || row.workspaceId.length === 0 || row.workspaceId.length > 256)
  ) throw new Error("Invalid workspace identifier");
  const resumeSessionId = row.resumeSessionId;
  if (
    resumeSessionId !== undefined
    && resumeSessionId !== null
    && (typeof resumeSessionId !== "string" || !SESSION_ID.test(resumeSessionId))
  ) throw new Error("Invalid agent session id");
  return {
    chatId: identifier(row.chatId, "chat id"),
    provider: provider(row.provider),
    model: row.model,
    prompt,
    workspaceId: typeof row.workspaceId === "string" ? row.workspaceId : null,
    project: projectReference(row.project),
    claudeAuthMethod: row.claudeAuthMethod === "api-key" ? "api-key" : "subscription",
    permissionMode: row.permissionMode,
    resumeSessionId: typeof resumeSessionId === "string" ? resumeSessionId : null,
  };
}
