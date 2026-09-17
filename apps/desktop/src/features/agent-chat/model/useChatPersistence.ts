import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { bridge, type AgentChatEnvelope } from "@/shared/api/ipc";
import { createAgentChatState, reduceAgentChat, type CreateAgentChatOptions, type StorageLike } from "./chat-state";
import { chatScopeKey, type AgentChatScope } from "./chat-storage";
import { openChatPersistence, type ChatPersistence } from "./chat-persistence";

function localStorageOrNull(): StorageLike | null {
  try { return typeof window === "undefined" ? null : window.localStorage ?? null; }
  catch { return null; }
}

export function useChatPersistence(scope: AgentChatScope | null, fallback: () => CreateAgentChatOptions) {
  const storage = useMemo(localStorageOrNull, []);
  const [state, dispatch] = useReducer(reduceAgentChat, undefined, () => createAgentChatState(fallback()));
  const [loaded, setLoaded] = useState<{ key: string; session: ChatPersistence } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const sessions = useRef(new Map<string, Promise<ChatPersistence>>());
  const scopes = useRef(new Map<string, AgentChatScope>());
  const key = chatScopeKey(scope);
  const rootPath = scope?.rootPath;
  const workspaceId = scope?.workspaceId ?? null;
  const ready = key === null || loaded?.key === key;
  const current = useRef({ key, ready });
  current.current = { key, ready };

  useEffect(() => {
    if (!key || !rootPath) return;
    let cancelled = false;
    setError(null);
    let pending = sessions.current.get(key);
    if (!pending) {
      pending = openChatPersistence(bridge, storage, { rootPath, workspaceId }, fallback());
      sessions.current.set(key, pending);
      scopes.current.set(key, { rootPath, workspaceId });
    }
    void pending.then((session) => {
      if (cancelled) return;
      dispatch({ type: "restore", state: session.state });
      setLoaded({ key, session });
    }).catch((cause: unknown) => {
      sessions.current.delete(key);
      if (!cancelled) setError(`Chat history could not be opened: ${cause instanceof Error ? cause.message : String(cause)}`);
    });
    return () => { cancelled = true; };
  }, [attempt, fallback, key, rootPath, storage, workspaceId]);

  useEffect(() => {
    if (!key || !ready || !loaded) return;
    let cancelled = false;
    void loaded.session.save(state).then(() => {
      if (!cancelled) setError(null);
    }).catch((cause: unknown) => {
      if (!cancelled) setError(`Chat history could not be saved. Keep this window open and retry. ${cause instanceof Error ? cause.message : String(cause)}`);
    });
    return () => { cancelled = true; };
  }, [attempt, key, loaded, ready, state]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const receiveEvent = useCallback((envelope: AgentChatEnvelope) => {
    const action = { type: "event" as const, chatId: envelope.chatId, event: envelope.event, now: Date.now() };
    for (const [sessionKey, pending] of sessions.current) {
      const scope = scopes.current.get(sessionKey);
      if (scope?.rootPath !== envelope.storeId || scope.workspaceId !== envelope.workspaceId) continue;
      if (current.current.ready && current.current.key === sessionKey) {
        dispatch(action);
      } else {
        void pending.then(async (session) => {
          if (session.state.chats.some(({ id }) => id === envelope.chatId)) {
            await session.save(reduceAgentChat(session.state, action));
          }
        }).catch(() => undefined); // Retain unsaved state; returning to this workspace retries it.
      }
    }
  }, []);
  return { state, dispatch, ready, error, retry, receiveEvent };
}
