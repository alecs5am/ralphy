import { describe, expect, test } from "vitest";

import {
  createAgentChatState,
  loadAgentChats,
  reduceAgentChat,
  saveAgentChats,
  type AgentChatState,
  type StorageLike,
} from "@/features/agent-chat";

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
  test("renamed archived chats preserve running work, manual titles and restoration after reload", () => {
    const storage = new MemoryStorage(), scope = { rootPath: "/tmp/organized", workspaceId: "ws" };
    let state = reduceAgentChat(initial(), { type: "rename-chat", chatId: "chat-codex", title: "My creative research" });
    state = reduceAgentChat(state, { type: "set-title", chatId: "chat-codex", title: "Late generated title", now: 105 });
    expect(state.chats[0].title).toBe("My creative research");
    state = reduceAgentChat(state, { type: "send", chatId: "chat-codex", text: "Compare the images", now: 110 });
    state = reduceAgentChat(state, { type: "archive-chat", chatId: "chat-codex", archived: true });
    expect(state.runningChatId).toBe("chat-codex");
    expect(state.chats[0].busy).toBe(true);
    state = reduceAgentChat(state, { type: "event", chatId: "chat-codex", event: { type: "text-delta", text: "Still working" }, now: 120 });
    expect(state.chats[0].entries.at(-1)?.text).toBe("Still working");
    expect(state.chats[0].archived).toBe(true);
    saveAgentChats(storage, scope, state);
    state = loadAgentChats(storage, scope, { chatId: "fallback", provider: "codex", model: "default", now: 130 });
    expect(state.chats[0]).toMatchObject({ title: "My creative research", manualTitle: true, archived: true });
    state = reduceAgentChat(state, { type: "archive-chat", chatId: "chat-codex", archived: false });
    expect(state.chats[0].entries).toHaveLength(2);
    expect(state.chats[0].archived).toBe(false);
  });
  test("keeps the whole long turn across saves and reloads, including its initial prompt", () => {
    const storage = new MemoryStorage();
    const scope = { rootPath: "/tmp/history", workspaceId: "ws-1" };
    let state = reduceAgentChat(initial(), {
      type: "send", chatId: "chat-codex", text: "Import image and video creatives", now: 110,
    });
    for (let i = 0; i < 350; i++) {
      state = reduceAgentChat(state, {
        type: "event", chatId: "chat-codex", now: 120 + i,
        event: { type: "tool-start", id: `tool-${i}`, name: "Bash", summary: `Step ${i}` },
      });
      state = reduceAgentChat(state, {
        type: "event", chatId: "chat-codex", now: 120 + i,
        event: { type: "tool-result", id: `tool-${i}`, ok: true },
      });
    }
    state = reduceAgentChat(state, {
      type: "event", chatId: "chat-codex", now: 500,
      event: { type: "text-delta", text: "Creative versions are ready." },
    });
    for (let i = 0; i < 2; i++) {
      saveAgentChats(storage, scope, state);
      const restored = loadAgentChats(storage, scope, {
        chatId: "fallback", provider: "codex", model: "default", now: 600,
      });
      expect(restored.chats[0].entries).toEqual(state.chats[0].entries);
      expect(restored.chats[0].nextId).toBe(353);
      state = restored;
    }
  });

  test("defaults to one read-only provider chat", () => {
    const state = initial();
    expect(state.activeChatId).toBe("chat-codex");
    expect(state.runningChatId).toBeNull();
    expect(state.chats[0]).toMatchObject({
      id: "chat-codex",
      provider: "codex",
      model: "gpt-5.5",
      permissionMode: "plan",
      entries: [],
    });
  });

  test("keeps every conversation and complete text across repeated reloads", () => {
    const storage = new MemoryStorage();
    const scope = { rootPath: "/tmp/full-history", workspaceId: "workspace" };
    const text = "Complete transcript ".repeat(20_000);
    let state = initial();
    state.chats[0].entries = [
      { id: 1, kind: "user", at: 1, text },
      { id: 2, kind: "assistant", at: 2, text },
      { id: 3, kind: "tool", at: 3, tool: { id: "tool", name: "Bash", summary: text, status: "complete" } },
    ];
    for (let i = 1; i < 80; i++) state = reduceAgentChat(state, {
      type: "new-chat", chatId: `chat-${i}`, provider: "codex", model: "default", now: i,
    });
    expect(state.chats).toHaveLength(80);
    for (let i = 0; i < 2; i++) {
      expect(saveAgentChats(storage, scope, state)).toBe(true);
      state = loadAgentChats(storage, scope, { chatId: "fallback", provider: "codex", model: "default", now: 100 });
      expect(state.chats).toHaveLength(80);
      expect(state.chats[0].entries.map((entry) => entry.text ?? entry.tool?.summary)).toEqual([text, text, text]);
    }
  });

  test("retains the legacy source if migration cannot save its replacement", () => {
    const storage = new MemoryStorage();
    const key = "ralphy-media:claude-chat:%2Ftmp%2Fquota";
    const raw = JSON.stringify({ version: 1, entries: [{ id: 1, kind: "user", text: "Keep this" }] });
    storage.setItem(key, raw);
    storage.setItem = () => { throw new Error("Quota exceeded"); };
    const state = loadAgentChats(storage, { rootPath: "/tmp/quota", workspaceId: "workspace" }, {
      chatId: "migrated", provider: "codex", model: "default", now: 0,
    });
    expect(state.chats[0].entries[0].text).toBe("Keep this");
    expect(storage.getItem(key)).toBe(raw);
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
    const scope = { rootPath: "/tmp/demo/.ralphy", workspaceId: "ws-1" };
    saveAgentChats(storage, scope, state);

    const restored = loadAgentChats(storage, scope, {
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

    /* A chat belongs to a workspace: the same root under another workspace is another list, and
       the chat the operator was in does not follow them there. */
    const elsewhere = loadAgentChats(storage, { ...scope, workspaceId: "ws-2" }, {
      chatId: "other-workspace",
      provider: "codex",
      model: "default",
      now: 350,
    });
    expect(elsewhere.chats.map(({ id }) => id)).toEqual(["other-workspace"]);

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
    const legacyScope = { rootPath: "/tmp/legacy/.ralphy", workspaceId: "ws-1" };
    const migrated = loadAgentChats(storage, legacyScope, {
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
    /* The pre-scope record is consumed by the migration, so the next workspace on the same root
       starts empty rather than inheriting a copy of the same conversation. */
    expect(loadAgentChats(storage, { ...legacyScope, workspaceId: "ws-2" }, {
      chatId: "after-migration",
      provider: "codex",
      model: "default",
      now: 500,
    }).chats.map(({ id }) => id)).toEqual(["after-migration"]);
  });
});
