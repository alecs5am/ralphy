import { describe, expect, test } from "vitest";

import {
  createAgentChatState,
  loadAgentChats,
  reduceAgentChat,
  saveAgentChats,
  type AgentChatState,
  type StorageLike,
} from "../src/chat/useAgentChat";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function initial(): AgentChatState {
  return createAgentChatState({
    chatId: "chat-codex",
    provider: "codex",
    model: "gpt-5.5",
    now: 100,
  });
}

describe("agent chat state", () => {
  test("defaults to one full-access provider chat", () => {
    const state = initial();
    expect(state.activeChatId).toBe("chat-codex");
    expect(state.runningChatId).toBeNull();
    expect(state.chats[0]).toMatchObject({
      id: "chat-codex",
      provider: "codex",
      model: "gpt-5.5",
      permissionMode: "full",
      entries: [],
    });
  });

  test("switches chats while events continue updating the originating chat", () => {
    let state = initial();
    state = reduceAgentChat(state, {
      type: "send",
      chatId: "chat-codex",
      text: "Review the current render",
      now: 110,
    });
    state = reduceAgentChat(state, {
      type: "new-chat",
      chatId: "chat-openrouter",
      provider: "openrouter",
      model: "openai/gpt-5.5",
      now: 120,
    });
    expect(state.activeChatId).toBe("chat-openrouter");
    expect(state.runningChatId).toBe("chat-codex");

    state = reduceAgentChat(state, {
      type: "event",
      chatId: "chat-codex",
      now: 130,
      event: { type: "text-delta", text: "The render is ready." },
    });
    state = reduceAgentChat(state, {
      type: "event",
      chatId: "chat-codex",
      now: 140,
      event: {
        type: "result",
        ok: true,
        cancelled: false,
        costUsd: 0,
        durationMs: 500,
        sessionId: "0199a213-81c0-7800-8aa1-bbab2a035a53",
      },
    });

    expect(state.activeChatId).toBe("chat-openrouter");
    expect(state.runningChatId).toBeNull();
    expect(state.chats.find(({ id }) => id === "chat-codex")).toMatchObject({
      title: "Review the current render",
      sessionId: "0199a213-81c0-7800-8aa1-bbab2a035a53",
      entries: [
        { kind: "user", text: "Review the current render" },
        { kind: "assistant", text: "The render is ready." },
        /* A finished turn leaves its own reading behind: the transcript's "worked for" row is
           per turn, and `lastCostUsd` only ever answers for the newest one. */
        { kind: "result", run: { durationMs: 500, costUsd: 0 } },
      ],
    });
    expect(state.chats.find(({ id }) => id === "chat-openrouter")?.entries).toEqual([]);

    state = reduceAgentChat(state, { type: "select-chat", chatId: "chat-codex" });
    expect(state.activeChatId).toBe("chat-codex");
  });

  test("changes provider in an empty chat but forks a populated chat", () => {
    let state = initial();
    state.chats[0] = { ...state.chats[0], title: "Claude chat" };
    state = reduceAgentChat(state, {
      type: "set-provider",
      provider: "claude",
      model: "sonnet",
      chatId: "unused",
      now: 110,
    });
    expect(state.chats).toHaveLength(1);
    expect(state.chats[0]).toMatchObject({
      provider: "claude",
      model: "sonnet",
      title: "New chat",
    });

    state = reduceAgentChat(state, {
      type: "send",
      chatId: "chat-codex",
      text: "Inspect this",
      now: 120,
    });
    state = reduceAgentChat(state, {
      type: "event",
      chatId: "chat-codex",
      now: 130,
      event: {
        type: "result",
        ok: true,
        cancelled: false,
        costUsd: 0,
        durationMs: 1,
        sessionId: null,
      },
    });
    state = reduceAgentChat(state, {
      type: "set-provider",
      provider: "openrouter",
      model: "google/gemini-3-pro",
      chatId: "chat-fork",
      now: 140,
    });

    expect(state.activeChatId).toBe("chat-fork");
    expect(state.chats).toHaveLength(2);
    expect(state.chats.at(-1)).toMatchObject({
      id: "chat-fork",
      provider: "openrouter",
      model: "google/gemini-3-pro",
      entries: [],
    });
  });

  test("persists independent chats and migrates the legacy Claude conversation", () => {
    const storage = new MemoryStorage();
    let state = initial();
    state = reduceAgentChat(state, {
      type: "new-chat",
      chatId: "chat-two",
      provider: "claude",
      model: "opus",
      now: 200,
    });
    state.chats[1] = { ...state.chats[1], title: "Claude chat" };
    saveAgentChats(storage, "/tmp/demo/.ralphy", state);

    const restored = loadAgentChats(storage, "/tmp/demo/.ralphy", {
      chatId: "fallback",
      provider: "codex",
      model: "default",
      now: 300,
    });
    expect(restored.activeChatId).toBe("chat-two");
    expect(restored.chats.map(({ provider, model }) => ({ provider, model }))).toEqual([
      { provider: "codex", model: "gpt-5.5" },
      { provider: "claude", model: "opus" },
    ]);
    expect(restored.chats[1].title).toBe("New chat");

    storage.setItem(
      "ralphy-media:claude-chat:%2Ftmp%2Flegacy%2F.ralphy",
      JSON.stringify({
        version: 1,
        entries: [{ id: 8, kind: "assistant", text: "Legacy answer" }],
        nextId: 9,
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        authMethod: "api-key",
        permissionMode: "plan",
        lastCostUsd: 0.4,
      }),
    );
    const migrated = loadAgentChats(storage, "/tmp/legacy/.ralphy", {
      chatId: "migrated-chat",
      provider: "codex",
      model: "default",
      now: 400,
    });
    expect(migrated.chats).toHaveLength(1);
    expect(migrated.chats[0]).toMatchObject({
      id: "migrated-chat",
      title: "Claude chat",
      provider: "claude",
      model: "sonnet",
      claudeAuthMethod: "api-key",
      permissionMode: "plan",
      entries: [{ id: 8, kind: "assistant", text: "Legacy answer" }],
    });
  });
});
