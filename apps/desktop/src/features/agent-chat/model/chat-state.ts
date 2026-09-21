/**
 * A chat's shape and the reducer that moves it.
 *
 * One conversation, many of them per scope, and one active id. Every transition is a pure
 * function of the previous state and one action, including the provider's own events -- a stream
 * of deltas is folded into the entry it belongs to rather than appended, so a re-render never
 * shows a half-written turn twice.
 *
 * Stored records validate ids and preserve complete text fields. A conversation's entries stay
 * intact: tool-heavy turns can contain hundreds of records before their first answer.
 */
import type {
  AgentChatEvent,
  AgentPermissionMode,
  AgentProvider,
  ClaudeAuthMethod,
} from "@/shared/api/ipc";

export const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MODEL_ID = /^[~a-zA-Z0-9][a-zA-Z0-9._~:/-]{0,255}$/;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AgentChatTool {
  id: string;
  name: string;
  summary: string;
  status: "running" | "complete" | "failed" | "unconfirmed";
}

export interface AgentChatEntry {
  id: number;
  kind: "user" | "assistant" | "tool" | "error" | "result";
  /* When the entry was appended. The operator's own turn prints it; nothing else does, but a
     transcript with a clock on one line and none on the others is a transcript with two shapes. */
  at: number;
  text?: string;
  /** Provider message identity survives interleaved tool events and text from other messages. */
  messageId?: string;
  tool?: AgentChatTool;
  /* A `result` entry: the turn's end, as the provider reported it. It is what the transcript's
     "worked for" row reads, and the only place a duration or a cost is a fact rather than a guess. */
  run?: { durationMs: number; costUsd: number; outcome?: "completed" | "cancelled" | "failed" };
}

export interface AgentChatProject { workspaceId: string; projectId: string }

export interface AgentConversation {
  id: string;
  /** Fixed at creation; browsing another project never moves a conversation. */
  project?: AgentChatProject | null;
  title: string;
  /* Whether the title is the chat's own name or still the first prompt wearing one. A generated
     name is asked for once, and the flag is what stops a reload from asking again. */
  titled: boolean;
  manualTitle?: boolean;
  archived?: boolean;
  provider: AgentProvider;
  model: string;
  entries: AgentChatEntry[];
  nextId: number;
  sessionId: string | null;
  busy: boolean;
  streamingAssistantId: number | null;
  claudeAuthMethod: ClaudeAuthMethod;
  permissionMode: AgentPermissionMode;
  lastCostUsd: number | null;
  /* What the provider said the last turn carried. Not persisted: a figure from a previous session
     is not a measurement of this one, and the Context page would read it as current. */
  usage: AgentChatUsage | null;
  updatedAt: number;
}

/** The provider's own reading of one turn. `contextWindow` is null when it does not name one. */
export interface AgentChatUsage {
  inputTokens: number;
  totalTokens: number;
  contextWindow: number | null;
}

export interface AgentChatState {
  chats: AgentConversation[];
  activeChatId: string;
  runningChatId: string | null;
}

export interface CreateAgentChatOptions {
  chatId: string;
  project?: AgentChatProject | null;
  provider: AgentProvider;
  model: string;
  now: number;
  permissionMode?: AgentPermissionMode;
}

export type AgentChatAction =
  | { type: "send"; chatId: string; text: string; now: number }
  | { type: "event"; chatId: string; event: AgentChatEvent; now: number }
  | ({ type: "new-chat" } & CreateAgentChatOptions)
  | ({ type: "set-provider" } & CreateAgentChatOptions)
  | { type: "select-chat"; chatId: string }
  | { type: "set-model"; model: string; now: number }
  | { type: "set-title"; chatId: string; title: string; now: number }
  | { type: "rename-chat"; chatId: string; title: string }
  | { type: "archive-chat"; chatId: string; archived: boolean }
  | { type: "set-auth"; method: ClaudeAuthMethod; now: number }
  | { type: "set-permission"; mode: AgentPermissionMode; now: number }
  | { type: "recover-history"; chatId: string; sessionId: string; beforeId: number; entries: AgentChatEntry[] }
  | { type: "restore"; state: AgentChatState };

export function validLocalId(value: string): boolean {
  return Boolean(value) && value.length <= 256 && !/[/\\\0]/.test(value);
}

export function createConversation(options: CreateAgentChatOptions): AgentConversation {
  if (!validLocalId(options.chatId)) throw new Error("Invalid agent chat id");
  if (!MODEL_ID.test(options.model)) throw new Error("Invalid agent model");
  if (options.project && (!validLocalId(options.project.workspaceId) || !validLocalId(options.project.projectId))) throw new Error("Invalid chat project");
  return {
    id: options.chatId,
    project: options.project ? { ...options.project } : null,
    title: "New chat",
    titled: false,
    provider: options.provider,
    model: options.model,
    entries: [],
    nextId: 1,
    sessionId: null,
    busy: false,
    streamingAssistantId: null,
    claudeAuthMethod: "subscription",
    permissionMode: options.permissionMode ?? "plan",
    lastCostUsd: null,
    usage: null,
    updatedAt: options.now,
  };
}

export function createAgentChatState(options: CreateAgentChatOptions): AgentChatState {
  const chat = createConversation(options);
  return { chats: [chat], activeChatId: chat.id, runningChatId: null };
}

function appendEntry(
  chat: AgentConversation,
  entry: Omit<AgentChatEntry, "id">,
): AgentConversation {
  return {
    ...chat,
    entries: [...chat.entries, { ...entry, id: chat.nextId }],
    nextId: chat.nextId + 1,
  };
}

function reduceEvent(
  chat: AgentConversation,
  event: AgentChatEvent,
  now: number,
): AgentConversation {
  if (event.type === "session") return { ...chat, sessionId: event.sessionId };
  if (event.type === "text-delta") {
    let assistantId = chat.streamingAssistantId;
    if (event.messageId) {
      assistantId = null;
      for (let index = chat.entries.length - 1; index >= 0; index--) {
        const entry = chat.entries[index];
        if (entry.kind === "user") break;
        if (entry.kind === "assistant" && entry.messageId === event.messageId) { assistantId = entry.id; break; }
      }
    }
    if (assistantId != null) {
      return {
        ...chat,
        entries: chat.entries.map((entry) => (
          entry.id === assistantId
            ? { ...entry, text: `${entry.text ?? ""}${event.text}` }
            : entry
        )),
      };
    }
    const id = chat.nextId;
    return {
      ...appendEntry(chat, { kind: "assistant", at: now, text: event.text, ...(event.messageId ? { messageId: event.messageId } : {}) }),
      streamingAssistantId: id,
    };
  }
  if (event.type === "tool-start") {
    return {
      ...appendEntry(chat, {
        kind: "tool",
        at: now,
        tool: {
          id: event.id,
          name: event.name,
          summary: event.summary,
          status: "running",
        },
      }),
      streamingAssistantId: null,
    };
  }
  if (event.type === "tool-result") {
    return {
      ...chat,
      entries: chat.entries.map((entry) => (
        entry.tool?.id === event.id
          ? {
            ...entry,
            tool: {
              ...entry.tool,
              status: event.ok ? "complete" as const : "failed" as const,
            },
          }
          : entry
      )),
      streamingAssistantId: null,
    };
  }
  if (event.type === "result") {
    return {
      /* The turn's own record, not the chat's: a transcript keeps every turn's reading, and
         `lastCostUsd` only ever answers for the newest one. */
      ...appendEntry(settleUnconfirmedTools(chat), {
        kind: "result",
        at: now,
        run: { durationMs: event.durationMs, costUsd: event.costUsd, outcome: event.cancelled ? "cancelled" : event.ok ? "completed" : "failed" },
      }),
      busy: false,
      streamingAssistantId: null,
      sessionId: event.sessionId ?? chat.sessionId,
      lastCostUsd: event.costUsd,
    };
  }
  if (event.type === "usage") {
    return {
      ...chat,
      usage: {
        inputTokens: event.inputTokens,
        totalTokens: event.totalTokens,
        contextWindow: event.contextWindow,
      },
    };
  }
  return {
    ...appendEntry(settleUnconfirmedTools(chat), { kind: "error", at: now, text: event.message }),
    busy: false,
    streamingAssistantId: null,
  };
}

/** A finished turn cannot keep a tool running, but silence does not prove success or failure. */
function settleUnconfirmedTools(chat: AgentConversation): AgentConversation {
  return { ...chat, entries: chat.entries.map((entry) => entry.tool?.status === "running"
    ? { ...entry, tool: { ...entry.tool, status: "unconfirmed" } } : entry) };
}

function updateChat(
  state: AgentChatState,
  chatId: string,
  update: (chat: AgentConversation) => AgentConversation,
): AgentChatState {
  if (!state.chats.some(({ id }) => id === chatId)) return state;
  return {
    ...state,
    chats: state.chats.map((chat) => chat.id === chatId ? update(chat) : chat),
  };
}

export function reduceAgentChat(
  state: AgentChatState,
  action: AgentChatAction,
): AgentChatState {
  if (action.type === "restore") return action.state;
  if (action.type === "recover-history") {
    return updateChat(state, action.chatId, (chat) => (
      chat.busy || chat.sessionId !== action.sessionId || chat.entries[0]?.id !== action.beforeId
        ? chat : { ...chat, entries: action.entries, nextId: action.entries.length + 1 }
    ));
  }
  if (action.type === "select-chat") {
    return state.chats.some(({ id }) => id === action.chatId)
      ? { ...state, activeChatId: action.chatId }
      : state;
  }
  if (action.type === "new-chat") {
    const chat = createConversation(action);
    return {
      ...state,
      chats: [...state.chats.filter(({ id }) => id !== chat.id), chat],
      activeChatId: chat.id,
    };
  }
  if (action.type === "set-provider") {
    const active = state.chats.find(({ id }) => id === state.activeChatId);
    if (!active || active.entries.length > 0 || active.busy) {
      return reduceAgentChat(state, { ...action, project: active?.project ?? null, type: "new-chat" });
    }
    return updateChat(state, active.id, (chat) => ({
      ...chat,
      title: chat.manualTitle ? chat.title : "New chat",
      titled: chat.manualTitle === true,
      provider: action.provider,
      model: action.model,
      sessionId: null,
      lastCostUsd: null,
      /* A new provider is a different window and a different preamble, so the previous reading
         stops describing this chat. */
      usage: null,
      updatedAt: action.now,
    }));
  }
  if (action.type === "set-title") {
    const title = action.title.trim().slice(0, 80);
    return title
      ? updateChat(state, action.chatId, (chat) => chat.manualTitle ? chat : ({ ...chat, title, titled: true, updatedAt: chat.updatedAt }))
      : state;
  }
  if (action.type === "rename-chat") {
    const title = action.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80);
    return title ? updateChat(state, action.chatId, (chat) => ({ ...chat, title, titled: true, manualTitle: true })) : state;
  }
  if (action.type === "archive-chat") {
    return updateChat(state, action.chatId, (chat) => ({ ...chat, archived: action.archived }));
  }
  if (action.type === "set-model") {
    if (!MODEL_ID.test(action.model)) return state;
    return updateChat(state, state.activeChatId, (chat) => ({
      ...chat,
      model: action.model,
      usage: null,
      updatedAt: action.now,
    }));
  }
  if (action.type === "set-auth") {
    return updateChat(state, state.activeChatId, (chat) => ({
      ...chat,
      claudeAuthMethod: action.method,
      updatedAt: action.now,
    }));
  }
  if (action.type === "set-permission") {
    return updateChat(state, state.activeChatId, (chat) => ({
      ...chat,
      permissionMode: action.mode,
      updatedAt: action.now,
    }));
  }
  if (action.type === "send") {
    const text = action.text.trim();
    if (!text || state.runningChatId !== null) return state;
    const target = state.chats.find(({ id }) => id === action.chatId);
    if (!target || target.busy) return state;
    return {
      ...updateChat(state, target.id, (chat) => ({
        ...appendEntry(chat, { kind: "user", at: action.now, text }),
        title: chat.entries.length === 0 && !chat.titled ? text.slice(0, 52) : chat.title,
        busy: true,
        archived: false,
        streamingAssistantId: null,
        lastCostUsd: null,
        updatedAt: action.now,
      })),
      runningChatId: target.id,
    };
  }
  const next = updateChat(state, action.chatId, (chat) => ({
    ...reduceEvent(chat, action.event, action.now),
    updatedAt: action.now,
  }));
  const finished = action.event.type === "result" || action.event.type === "error";
  return finished && state.runningChatId === action.chatId
    ? { ...next, runningChatId: null }
    : next;
}
