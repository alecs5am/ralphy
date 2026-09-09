/**
 * Reading and writing a scope's chats, and refusing anything that does not parse.
 *
 * Storage is untrusted input: every field is checked, every list is bounded, and a record that
 * fails any check is dropped rather than repaired -- a chat that half-loads is worse than a chat
 * that is gone, because the operator cannot tell which turns are missing. The legacy key is read
 * once and migrated, never written.
 */
import type { AgentProvider } from "@/shared/api/ipc";

import {
  createAgentChatState,
  createConversation,
  MAX_PERSISTED_CHATS,
  MAX_PERSISTED_ENTRIES,
  MAX_ENTRY_TEXT,
  MODEL_ID,
  SESSION_ID,
  validLocalId,
  type AgentChatEntry,
  type AgentChatState,
  type AgentChatTool,
  type AgentConversation,
  type CreateAgentChatOptions,
  type StorageLike,
} from "./chat-state";


/* A chat belongs to one workspace: the operator's chats are the work they are doing there, and a
   list that carried every workspace's chats at once made the workspace switch a no-op for the one
   surface that should have followed it. The root stays in the key because a library is a different
   set of workspaces entirely. */
export interface AgentChatScope {
  rootPath: string;
  workspaceId: string | null;
}

function storageKey({ rootPath, workspaceId }: AgentChatScope): string {
  return `ralphy-media:agent-chats:3:${encodeURIComponent(rootPath)}:${encodeURIComponent(workspaceId ?? "-")}`;
}

/** The identity of a stored chat list, for deciding when to reload it. */
export function chatScopeKey(scope: AgentChatScope | null): string | null {
  return scope && scope.rootPath ? storageKey(scope) : null;
}

function legacyStorageKey(rootPath: string): string {
  return `ralphy-media:claude-chat:${encodeURIComponent(rootPath)}`;
}

function boundedText(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return value.length <= MAX_ENTRY_TEXT ? value : value.slice(0, MAX_ENTRY_TEXT);
}

function parseEntry(value: unknown): AgentChatEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "number"
    || !Number.isSafeInteger(row.id)
    || !["user", "assistant", "tool", "error", "result"].includes(String(row.kind))
  ) return null;
  const kind = row.kind as AgentChatEntry["kind"];
  /* A stored entry from before the clock existed reads as epoch rather than as today: a turn's
     time is a fact about that turn, and inventing one on load would print a lie. */
  const at = typeof row.at === "number" && Number.isFinite(row.at) ? row.at : 0;
  if (kind === "result") {
    const run = row.run;
    if (!run || typeof run !== "object" || Array.isArray(run)) return null;
    const item = run as Record<string, unknown>;
    if (
      typeof item.durationMs !== "number" || !Number.isFinite(item.durationMs)
      || typeof item.costUsd !== "number" || !Number.isFinite(item.costUsd)
    ) return null;
    return { id: row.id, kind, at, run: { durationMs: item.durationMs, costUsd: item.costUsd } };
  }
  if (kind === "tool") {
    const tool = row.tool;
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) return null;
    const item = tool as Record<string, unknown>;
    if (
      typeof item.id !== "string"
      || typeof item.name !== "string"
      || !["running", "complete", "failed"].includes(String(item.status))
    ) return null;
    return {
      id: row.id,
      kind,
      at,
      tool: {
        id: item.id.slice(0, 128),
        name: item.name.slice(0, 128),
        summary: boundedText(item.summary) ?? "",
        status: item.status === "running"
          ? "failed"
          : item.status as AgentChatTool["status"],
      },
    };
  }
  const text = boundedText(row.text);
  return text ? { id: row.id, kind, at, text } : null;
}

function provider(value: unknown): AgentProvider | null {
  return value === "claude" || value === "codex" || value === "openrouter" ? value : null;
}

function parseConversation(value: unknown): AgentConversation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const parsedProvider = provider(row.provider);
  if (
    typeof row.id !== "string"
    || !validLocalId(row.id)
    || !parsedProvider
    || typeof row.model !== "string"
    || !MODEL_ID.test(row.model)
  ) return null;
  const entries = Array.isArray(row.entries)
    ? row.entries.map(parseEntry).filter((entry): entry is AgentChatEntry => entry !== null)
      .slice(-MAX_PERSISTED_ENTRIES)
    : [];
  const highestId = Math.max(0, ...entries.map((entry) => entry.id));
  return {
    id: row.id,
    title: entries.length === 0 ? "New chat" : boundedText(row.title)?.slice(0, 80) ?? "New chat",
    titled: row.titled === true && entries.length > 0,
    provider: parsedProvider,
    model: row.model,
    entries,
    nextId: Math.max(highestId + 1, Number.isSafeInteger(row.nextId) ? Number(row.nextId) : 1),
    sessionId: typeof row.sessionId === "string" && SESSION_ID.test(row.sessionId)
      ? row.sessionId
      : null,
    busy: false,
    streamingAssistantId: null,
    claudeAuthMethod: row.claudeAuthMethod === "api-key" ? "api-key" : "subscription",
    permissionMode: row.permissionMode === "auto" || row.permissionMode === "plan"
      || row.permissionMode === "full" ? row.permissionMode : "full",
    lastCostUsd: typeof row.lastCostUsd === "number" && Number.isFinite(row.lastCostUsd)
      ? row.lastCostUsd
      : null,
    usage: null,
    updatedAt: typeof row.updatedAt === "number" && Number.isFinite(row.updatedAt)
      ? row.updatedAt
      : 0,
  };
}

function migrateLegacy(value: unknown, fallback: CreateAgentChatOptions): AgentChatState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const entries = Array.isArray(row.entries)
    ? row.entries.map(parseEntry).filter((entry): entry is AgentChatEntry => entry !== null)
      .slice(-MAX_PERSISTED_ENTRIES)
    : [];
  const highestId = Math.max(0, ...entries.map((entry) => entry.id));
  const chat: AgentConversation = {
    ...createConversation({ ...fallback, provider: "claude", model: "sonnet" }),
    title: "Claude chat",
    titled: false,
    entries,
    nextId: Math.max(highestId + 1, Number.isSafeInteger(row.nextId) ? Number(row.nextId) : 1),
    sessionId: typeof row.sessionId === "string" && SESSION_ID.test(row.sessionId)
      ? row.sessionId
      : null,
    claudeAuthMethod: row.authMethod === "api-key" ? "api-key" : "subscription",
    permissionMode: row.version === 1 && (
      row.permissionMode === "auto" || row.permissionMode === "plan" || row.permissionMode === "full"
    ) ? row.permissionMode : "full",
    lastCostUsd: typeof row.lastCostUsd === "number" && Number.isFinite(row.lastCostUsd)
      ? row.lastCostUsd
      : null,
  };
  return { chats: [chat], activeChatId: chat.id, runningChatId: null };
}

export function saveAgentChats(
  storage: StorageLike,
  scope: AgentChatScope,
  state: AgentChatState,
): void {
  if (!scope.rootPath) return;
  const chats = state.chats.slice(-MAX_PERSISTED_CHATS).map((chat) => ({
    ...chat,
    entries: chat.entries.slice(-MAX_PERSISTED_ENTRIES),
    busy: undefined,
    streamingAssistantId: undefined,
  }));
  try {
    storage.setItem(storageKey(scope), JSON.stringify({
      version: 3,
      chats,
      activeChatId: state.activeChatId,
    }));
  } catch {
    // Chat persistence is best-effort; provider CLIs keep canonical transcripts.
  }
}

export function loadAgentChats(
  storage: StorageLike,
  scope: AgentChatScope,
  fallback: CreateAgentChatOptions,
): AgentChatState {
  if (!scope.rootPath) return createAgentChatState(fallback);
  try {
    const raw = storage.getItem(storageKey(scope));
    if (raw) {
      const value = JSON.parse(raw) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const row = value as Record<string, unknown>;
        const chats = Array.isArray(row.chats)
          ? row.chats.map(parseConversation)
            .filter((chat): chat is AgentConversation => chat !== null)
            .slice(-MAX_PERSISTED_CHATS)
          : [];
        if (chats.length > 0) {
          const activeChatId = typeof row.activeChatId === "string"
            && chats.some(({ id }) => id === row.activeChatId)
            ? row.activeChatId
            : chats.at(-1)!.id;
          return { chats, activeChatId, runningChatId: null };
        }
      }
    }
    /* The pre-scope record is consumed, not just read: it is keyed by root alone, so leaving it in
       place would hand the same chat to every workspace the operator opens. */
    const legacy = storage.getItem(legacyStorageKey(scope.rootPath));
    if (legacy) {
      storage.removeItem(legacyStorageKey(scope.rootPath));
      return migrateLegacy(JSON.parse(legacy) as unknown, fallback) ?? createAgentChatState(fallback);
    }
  } catch {
    return createAgentChatState(fallback);
  }
  return createAgentChatState(fallback);
}
