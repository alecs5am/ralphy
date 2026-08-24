import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { bridge } from "../lib/ipc";
import type {
  AgentChatEvent,
  AgentPermissionMode,
  AgentProvider,
  AgentProviderStatus,
  ClaudeAuthMethod,
  ProjectSummary,
} from "../lib/ipc";

const MAX_PERSISTED_CHATS = 30;
const MAX_PERSISTED_ENTRIES = 100;
const MAX_ENTRY_TEXT = 128 * 1024;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL_ID = /^[~a-zA-Z0-9][a-zA-Z0-9._~:/-]{0,255}$/;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AgentChatTool {
  id: string;
  name: string;
  summary: string;
  status: "running" | "complete" | "failed";
}

export interface AgentChatEntry {
  id: number;
  kind: "user" | "assistant" | "tool" | "error" | "result";
  /* When the entry was appended. The operator's own turn prints it; nothing else does, but a
     transcript with a clock on one line and none on the others is a transcript with two shapes. */
  at: number;
  text?: string;
  tool?: AgentChatTool;
  /* A `result` entry: the turn's end, as the provider reported it. It is what the transcript's
     "worked for" row reads, and the only place a duration or a cost is a fact rather than a guess. */
  run?: { durationMs: number; costUsd: number };
}

export interface AgentConversation {
  id: string;
  title: string;
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
  updatedAt: number;
}

export interface AgentChatState {
  chats: AgentConversation[];
  activeChatId: string;
  runningChatId: string | null;
}

export interface CreateAgentChatOptions {
  chatId: string;
  provider: AgentProvider;
  model: string;
  now: number;
}

export type AgentChatAction =
  | { type: "send"; chatId: string; text: string; now: number }
  | { type: "event"; chatId: string; event: AgentChatEvent; now: number }
  | ({ type: "new-chat" } & CreateAgentChatOptions)
  | ({ type: "set-provider" } & CreateAgentChatOptions)
  | { type: "select-chat"; chatId: string }
  | { type: "set-model"; model: string; now: number }
  | { type: "set-auth"; method: ClaudeAuthMethod; now: number }
  | { type: "set-permission"; mode: AgentPermissionMode; now: number }
  | { type: "restore"; state: AgentChatState };

function validLocalId(value: string): boolean {
  return Boolean(value) && value.length <= 256 && !/[/\\\0]/.test(value);
}

function createConversation(options: CreateAgentChatOptions): AgentConversation {
  if (!validLocalId(options.chatId)) throw new Error("Invalid agent chat id");
  if (!MODEL_ID.test(options.model)) throw new Error("Invalid agent model");
  return {
    id: options.chatId,
    title: "New chat",
    provider: options.provider,
    model: options.model,
    entries: [],
    nextId: 1,
    sessionId: null,
    busy: false,
    streamingAssistantId: null,
    claudeAuthMethod: "subscription",
    permissionMode: "full",
    lastCostUsd: null,
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
    if (chat.streamingAssistantId !== null) {
      return {
        ...chat,
        entries: chat.entries.map((entry) => (
          entry.id === chat.streamingAssistantId
            ? { ...entry, text: `${entry.text ?? ""}${event.text}` }
            : entry
        )),
      };
    }
    const id = chat.nextId;
    return {
      ...appendEntry(chat, { kind: "assistant", at: now, text: event.text }),
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
      ...appendEntry(chat, {
        kind: "result",
        at: now,
        run: { durationMs: event.durationMs, costUsd: event.costUsd },
      }),
      busy: false,
      streamingAssistantId: null,
      sessionId: event.sessionId ?? chat.sessionId,
      lastCostUsd: event.costUsd,
    };
  }
  return {
    ...appendEntry(chat, { kind: "error", at: now, text: event.message }),
    busy: false,
    streamingAssistantId: null,
  };
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
  if (action.type === "select-chat") {
    return state.chats.some(({ id }) => id === action.chatId)
      ? { ...state, activeChatId: action.chatId }
      : state;
  }
  if (action.type === "new-chat") {
    const chat = createConversation(action);
    return {
      ...state,
      chats: [...state.chats.filter(({ id }) => id !== chat.id), chat].slice(-MAX_PERSISTED_CHATS),
      activeChatId: chat.id,
    };
  }
  if (action.type === "set-provider") {
    const active = state.chats.find(({ id }) => id === state.activeChatId);
    if (!active || active.entries.length > 0 || active.busy) {
      return reduceAgentChat(state, { ...action, type: "new-chat" });
    }
    return updateChat(state, active.id, (chat) => ({
      ...chat,
      title: "New chat",
      provider: action.provider,
      model: action.model,
      sessionId: null,
      lastCostUsd: null,
      updatedAt: action.now,
    }));
  }
  if (action.type === "set-model") {
    if (!MODEL_ID.test(action.model)) return state;
    return updateChat(state, state.activeChatId, (chat) => ({
      ...chat,
      model: action.model,
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
        title: chat.entries.length === 0 ? text.slice(0, 52) : chat.title,
        busy: true,
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

function storageKey(rootPath: string): string {
  return `ralphy-media:agent-chats:2:${encodeURIComponent(rootPath)}`;
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
  rootPath: string,
  state: AgentChatState,
): void {
  if (!rootPath) return;
  const chats = state.chats.slice(-MAX_PERSISTED_CHATS).map((chat) => ({
    ...chat,
    entries: chat.entries.slice(-MAX_PERSISTED_ENTRIES),
    busy: undefined,
    streamingAssistantId: undefined,
  }));
  try {
    storage.setItem(storageKey(rootPath), JSON.stringify({
      version: 2,
      chats,
      activeChatId: state.activeChatId,
    }));
  } catch {
    // Chat persistence is best-effort; provider CLIs keep canonical transcripts.
  }
}

export function loadAgentChats(
  storage: StorageLike,
  rootPath: string,
  fallback: CreateAgentChatOptions,
): AgentChatState {
  if (!rootPath) return createAgentChatState(fallback);
  try {
    const raw = storage.getItem(storageKey(rootPath));
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
    const legacy = storage.getItem(legacyStorageKey(rootPath));
    if (legacy) return migrateLegacy(JSON.parse(legacy) as unknown, fallback)
      ?? createAgentChatState(fallback);
  } catch {
    return createAgentChatState(fallback);
  }
  return createAgentChatState(fallback);
}

export interface AgentChatController {
  state: AgentChatState;
  activeChat: AgentConversation;
  providers: AgentProviderStatus[];
  providersLoading: boolean;
  authAction: AgentProvider | null;
  connectionError: string | null;
  connected: boolean;
  send(text: string): void;
  stop(): void;
  newChat(): void;
  selectChat(chatId: string): void;
  /* A model can be named with the provider: handoff 17 has one model control listing every
     connected provider's catalog, so choosing a row is a provider switch and a model choice at
     once. Without one the provider's default model is taken. */
  setProvider(provider: AgentProvider, model?: string): void;
  setModel(model: string): void;
  setClaudeAuthMethod(method: ClaudeAuthMethod): void;
  setPermissionMode(mode: AgentPermissionMode): void;
  login(provider: "claude" | "codex"): Promise<void>;
  setApiKey(provider: "claude" | "openrouter", apiKey: string): Promise<boolean>;
  clearApiKey(provider: "claude" | "openrouter"): Promise<void>;
  refreshProviders(): Promise<AgentProviderStatus[]>;
}

function newChatId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `chat-${globalThis.crypto.randomUUID()}`;
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fallbackChat(): CreateAgentChatOptions {
  return {
    chatId: newChatId(),
    provider: "codex",
    model: "default",
    now: Date.now(),
  };
}

function localStorageOrNull(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAgentChat({
  rootPath,
  project,
  enabled = true,
}: {
  rootPath: string | null;
  project: ProjectSummary | null;
  enabled?: boolean;
}): AgentChatController {
  const storage = useMemo(localStorageOrNull, []);
  const [state, dispatch] = useReducer(
    reduceAgentChat,
    rootPath,
    (root) => root && storage
      ? loadAgentChats(storage, root, fallbackChat())
      : createAgentChatState(fallbackChat()),
  );
  const [providers, setProviders] = useState<AgentProviderStatus[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [authAction, setAuthAction] = useState<AgentProvider | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const loadedRoot = useRef(rootPath);
  const pendingState = useRef<AgentChatState | null>(null);
  const providersLoaded = useRef(false);

  const activeChat = state.chats.find(({ id }) => id === state.activeChatId)
    ?? state.chats[0]!;
  const activeProvider = providers.find(({ id }) => id === activeChat.provider);
  const connected = activeChat.provider === "claude"
    ? activeChat.claudeAuthMethod === "subscription"
      ? activeProvider?.accountConnected === true
      : activeProvider?.apiKeyConfigured === true
    : activeProvider?.connected === true;

  useEffect(() => {
    if (loadedRoot.current === rootPath) return;
    const restored = rootPath && storage
      ? loadAgentChats(storage, rootPath, fallbackChat())
      : createAgentChatState(fallbackChat());
    pendingState.current = restored;
    dispatch({ type: "restore", state: restored });
  }, [rootPath, storage]);

  useEffect(() => {
    if (pendingState.current === state) {
      pendingState.current = null;
      loadedRoot.current = rootPath;
      return;
    }
    if (rootPath && storage && loadedRoot.current === rootPath) {
      saveAgentChats(storage, rootPath, state);
    }
  }, [rootPath, state, storage]);

  useEffect(() => bridge.onAgentEvent((envelope) => {
    if (envelope.storeId === rootPath) {
      dispatch({
        type: "event",
        chatId: envelope.chatId,
        event: envelope.event,
        now: Date.now(),
      });
    }
  }), [rootPath]);

  const refreshProviders = useCallback(async (): Promise<AgentProviderStatus[]> => {
    setProvidersLoading(true);
    try {
      const next = await bridge.getAgentProviders();
      setProviders(next);
      providersLoaded.current = true;
      setConnectionError(null);
      return next;
    } catch (error) {
      setConnectionError(message(error));
      return [];
    } finally {
      setProvidersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled && !providersLoaded.current) void refreshProviders();
  }, [enabled, refreshProviders]);

  const send = useCallback((text: string): void => {
    const prompt = text.trim();
    if (!rootPath || !connected || !prompt || state.runningChatId !== null) return;
    const chat = state.chats.find(({ id }) => id === state.activeChatId);
    if (!chat) return;
    setConnectionError(null);
    dispatch({ type: "send", chatId: chat.id, text: prompt, now: Date.now() });
    void bridge.sendAgentMessage({
      chatId: chat.id,
      provider: chat.provider,
      model: chat.model,
      prompt,
      project: project
        ? { workspaceId: project.workspaceId, projectId: project.projectId }
        : null,
      claudeAuthMethod: chat.claudeAuthMethod,
      permissionMode: chat.permissionMode,
      resumeSessionId: chat.sessionId,
    }).catch((error: unknown) => {
      dispatch({
        type: "event",
        chatId: chat.id,
        now: Date.now(),
        event: { type: "error", code: "send-failed", message: message(error) },
      });
    });
  }, [connected, project, rootPath, state.activeChatId, state.chats, state.runningChatId]);

  const login = useCallback(async (provider: "claude" | "codex"): Promise<void> => {
    setAuthAction(provider);
    setConnectionError(null);
    try {
      setProviders(await bridge.loginAgentProvider(provider));
      providersLoaded.current = true;
    } catch (error) {
      setConnectionError(message(error));
    } finally {
      setAuthAction(null);
    }
  }, []);

  const setApiKey = useCallback(async (
    provider: "claude" | "openrouter",
    apiKey: string,
  ): Promise<boolean> => {
    setAuthAction(provider);
    setConnectionError(null);
    try {
      setProviders(await bridge.setAgentApiKey(provider, apiKey));
      providersLoaded.current = true;
      return true;
    } catch (error) {
      setConnectionError(message(error));
      return false;
    } finally {
      setAuthAction(null);
    }
  }, []);

  const clearApiKey = useCallback(async (
    provider: "claude" | "openrouter",
  ): Promise<void> => {
    setConnectionError(null);
    try {
      setProviders(await bridge.clearAgentApiKey(provider));
      providersLoaded.current = true;
    } catch (error) {
      setConnectionError(message(error));
    }
  }, []);

  return {
    state,
    activeChat,
    providers,
    providersLoading,
    authAction,
    connectionError,
    connected,
    send,
    stop: () => {
      void bridge.stopAgent().catch((error: unknown) => setConnectionError(message(error)));
    },
    newChat: () => dispatch({
      type: "new-chat",
      chatId: newChatId(),
      provider: activeChat.provider,
      model: activeChat.model,
      now: Date.now(),
    }),
    selectChat: (chatId) => dispatch({ type: "select-chat", chatId }),
    setProvider: (provider, model) => {
      const status = providers.find(({ id }) => id === provider);
      dispatch({
        type: "set-provider",
        chatId: newChatId(),
        provider,
        model: model ?? status?.defaultModel ?? (provider === "claude" ? "sonnet" : "default"),
        now: Date.now(),
      });
    },
    setModel: (model) => dispatch({ type: "set-model", model, now: Date.now() }),
    setClaudeAuthMethod: (method) => dispatch({ type: "set-auth", method, now: Date.now() }),
    setPermissionMode: (mode) => dispatch({ type: "set-permission", mode, now: Date.now() }),
    login,
    setApiKey,
    clearApiKey,
    refreshProviders,
  };
}
