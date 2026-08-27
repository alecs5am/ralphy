/**
 * The chat the app talks to: one scope's conversations, the provider's stream, and the controls
 * the composer and the sidebar call.
 *
 * The reducer and the storage live beside this file. What is left here is the part that cannot be
 * pure -- the bridge subscription, the scope reload, the debounced save, and the title a finished
 * turn asks the provider to name.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import { titlePrompt } from "../../../../electron/agent/title";
import { bridge } from "@/shared/api/ipc";
import type {
  AgentPermissionMode,
  AgentProvider,
  AgentProviderStatus,
  ClaudeAuthMethod,
  ProjectSummary,
} from "@/shared/api/ipc";

import {
  createAgentChatState,
  reduceAgentChat,
  type AgentChatState,
  type AgentConversation,
  type CreateAgentChatOptions,
  type StorageLike,
} from "./chat-state";
import { chatScopeKey, loadAgentChats, saveAgentChats, type AgentChatScope } from "./chat-storage";

export type { AgentChatScope };


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
  workspaceId,
  project,
  enabled = true,
}: {
  rootPath: string | null;
  workspaceId: string | null;
  project: ProjectSummary | null;
  enabled?: boolean;
}): AgentChatController {
  const storage = useMemo(localStorageOrNull, []);
  const scope = rootPath ? { rootPath, workspaceId } : null;
  const scopeKey = chatScopeKey(scope);
  const [state, dispatch] = useReducer(
    reduceAgentChat,
    scope,
    (initial) => initial && storage
      ? loadAgentChats(storage, initial, fallbackChat())
      : createAgentChatState(fallbackChat()),
  );
  const [providers, setProviders] = useState<AgentProviderStatus[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [authAction, setAuthAction] = useState<AgentProvider | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const loadedScope = useRef(scopeKey);
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
    if (loadedScope.current === scopeKey) return;
    const restored = rootPath && storage
      ? loadAgentChats(storage, { rootPath, workspaceId }, fallbackChat())
      : createAgentChatState(fallbackChat());
    pendingState.current = restored;
    dispatch({ type: "restore", state: restored });
  }, [rootPath, scopeKey, storage, workspaceId]);

  useEffect(() => {
    if (pendingState.current === state) {
      pendingState.current = null;
      loadedScope.current = scopeKey;
      return;
    }
    if (rootPath && storage && loadedScope.current === scopeKey) {
      saveAgentChats(storage, { rootPath, workspaceId }, state);
    }
  }, [rootPath, scopeKey, state, storage, workspaceId]);

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

  /* A chat remembers the model it was started with, and a model can stop existing under it: the
     provider's CLI is updated, or its configured default turns out to be one this CLI cannot run.
     The chat is moved to the provider's own default rather than left pinned to a name that fails
     every turn with "requires a newer version". Only a provider that actually lists models can
     say a model is gone -- an empty catalog means "not connected", not "no such model". */
  useEffect(() => {
    const status = providers.find(({ id }) => id === activeChat.provider);
    if (!status || status.models.length === 0) return;
    if (status.models.some(({ id }) => id === activeChat.model)) return;
    dispatch({ type: "set-model", model: status.defaultModel, now: Date.now() });
  }, [activeChat.model, activeChat.provider, providers]);

  /* The chat names itself once its first answer is in: the first prompt truncated to 52 characters
     is not a name, it is the same line the transcript already shows. The turn is read-only and it
     is asked for once per chat -- `titled` is what a reload reads instead of asking again -- and a
     provider that cannot answer right now simply leaves the chat as it is. */
  const naming = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || state.runningChatId !== null) return;
    const chat = state.chats.find(({ id }) => id === state.activeChatId);
    const first = chat?.entries.find(({ kind }) => kind === "user");
    if (!chat || chat.titled || !first || naming.current === chat.id) return;
    if (!chat.entries.some(({ kind }) => kind === "assistant")) return;
    naming.current = chat.id;
    void bridge.summariseAgentTitle({
      chatId: chat.id,
      provider: chat.provider,
      model: chat.model,
      prompt: titlePrompt(first.text ?? ""),
      claudeAuthMethod: chat.claudeAuthMethod,
      permissionMode: "plan",
    }).then((title) => {
      if (title) dispatch({ type: "set-title", chatId: chat.id, title, now: Date.now() });
    }).catch(() => undefined);
  }, [enabled, state.activeChatId, state.chats, state.runningChatId]);

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
      workspaceId: scope?.workspaceId ?? project?.workspaceId ?? null,
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
