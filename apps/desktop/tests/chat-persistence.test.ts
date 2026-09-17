import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadAgentChatStore, saveAgentChatStore } from "../electron/agent/chat-store";
import { createAgentChatState, type StorageLike } from "../src/features/agent-chat/model/chat-state";
import { chatScopeKey, serializeAgentChats } from "../src/features/agent-chat/model/chat-storage";
import { openChatPersistence } from "../src/features/agent-chat/model/chat-persistence";
import type { AgentChatStorageBridge } from "../shared/agent-chat-storage";

const fallback = { chatId: "first", provider: "codex" as const, model: "default", now: 0 };
const roots: string[] = [];
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "ralphy-chats-"));
  roots.push(root);
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const fileBridge: AgentChatStorageBridge = {
  loadAgentChats: loadAgentChatStore,
  saveAgentChats: saveAgentChatStore,
};

describe("durable chat history", () => {
  test("round-trips full history across reopening, isolated by workspace and library", async () => {
    const root = await directory();
    const secondRoot = await directory();
    const state = createAgentChatState(fallback);
    state.chats[0].entries = [{ id: 1, kind: "assistant", at: 0, text: "A complete answer ".repeat(100_000) }];
    const raw = serializeAgentChats(state);
    const revision = await saveAgentChatStore(root, "workspace-a", raw, null);
    expect(await loadAgentChatStore(root, "workspace-a")).toEqual({ data: raw, revision });
    expect(await loadAgentChatStore(root, "workspace-b")).toEqual({ data: null, revision: null });
    expect(await loadAgentChatStore(secondRoot, "workspace-a")).toEqual({ data: null, revision: null });
    expect(await loadAgentChatStore(root, null)).toEqual({ data: null, revision: null });
    const restored = await openChatPersistence(fileBridge, null, { rootPath: root, workspaceId: "workspace-a" }, fallback);
    expect(restored.state.chats[0].entries).toEqual(state.chats[0].entries);
  });

  test("rejects conflicting writers and preserves history when the root changes during a write", async () => {
    const root = await directory();
    const raw = serializeAgentChats(createAgentChatState(fallback));
    const revision = await saveAgentChatStore(root, "workspace", raw, null);
    const a = serializeAgentChats(createAgentChatState({ ...fallback, chatId: "writer-a" }));
    const b = serializeAgentChats(createAgentChatState({ ...fallback, chatId: "writer-b" }));
    const results = await Promise.allSettled([
      saveAgentChatStore(root, "workspace", a, revision),
      saveAgentChatStore(root, "workspace", b, revision),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const stored = await loadAgentChatStore(root, "workspace");
    let assertions = 0;
    await expect(saveAgentChatStore(root, "workspace", raw, stored.revision, () => {
      if (++assertions === 5) throw new Error("Library changed");
    })).rejects.toThrow("Library changed");
    expect(await loadAgentChatStore(root, "workspace")).toEqual(stored);
  });

  test("keeps corrupt files unchanged and rejects symbolic links", async () => {
    const root = await directory();
    const raw = serializeAgentChats(createAgentChatState(fallback));
    await saveAgentChatStore(root, "workspace", raw, null);
    const directoryPath = join(root, "media-library", "agent-chats");
    const path = join(directoryPath, (await readdir(directoryPath))[0]);
    await writeFile(path, "unfinished history");
    await expect(loadAgentChatStore(root, "workspace")).rejects.toThrow();
    await expect(saveAgentChatStore(root, "workspace", raw, null)).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("unfinished history");
    await rm(path);
    const outside = join(root, "outside.json");
    await writeFile(outside, raw);
    await symlink(outside, path);
    await expect(loadAgentChatStore(root, "workspace")).rejects.toThrow();
    await expect(saveAgentChatStore(root, "workspace", raw, null)).rejects.toThrow();
    expect(await readFile(outside, "utf8")).toBe(raw);
  });

  test("migrates without browser quota writes and keeps the source until disk accepts it", async () => {
    const root = await directory();
    const scope = { rootPath: root, workspaceId: "workspace" };
    const raw = serializeAgentChats(createAgentChatState(fallback));
    const key = chatScopeKey(scope)!;
    const values = new Map([[key, raw]]);
    const storage: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: () => { throw new Error("Quota exceeded"); },
      removeItem: (key) => { values.delete(key); },
    };
    let fail = true;
    const bridge: AgentChatStorageBridge = { ...fileBridge, saveAgentChats: async (...args) => {
      if (fail) throw new Error("Disk full");
      return fileBridge.saveAgentChats(...args);
    } };
    const session = await openChatPersistence(bridge, storage, scope, fallback);
    await expect(session.save(session.state)).rejects.toThrow("Disk full");
    expect(values.get(key)).toBe(raw);
    fail = false;
    await session.save(session.state);
    expect(values.has(key)).toBe(false);
    expect((await loadAgentChatStore(root, "workspace")).data).toBe(raw);
  });

  test("serializes updates and retries the latest state after a failed save", async () => {
    const root = await directory();
    let fail = true;
    const bridge: AgentChatStorageBridge = { ...fileBridge, saveAgentChats: async (...args) => {
      if (fail) throw new Error("Disk full");
      return fileBridge.saveAgentChats(...args);
    } };
    const session = await openChatPersistence(bridge, null, { rootPath: root, workspaceId: "workspace" }, fallback);
    const next = createAgentChatState({ ...fallback, chatId: "unsaved" });
    await expect(session.save(next)).rejects.toThrow("Disk full");
    expect(session.state).toBe(next);
    fail = false;
    const latest = createAgentChatState({ ...fallback, chatId: "latest" });
    await Promise.all([session.save(next), session.save(latest)]);
    const restored = await openChatPersistence(fileBridge, null, { rootPath: root, workspaceId: "workspace" }, fallback);
    expect(restored.state.activeChatId).toBe("latest");
  });

  test("merges a second profile's old chats after disk initialization without overwriting newer chats", async () => {
    const root = await directory();
    const scope = { rootPath: root, workspaceId: "workspace" };
    const native = createAgentChatState(fallback);
    native.chats[0] = { ...native.chats[0], title: "My title", manualTitle: true, archived: true };
    await saveAgentChatStore(root, "workspace", serializeAgentChats(native), null);
    const legacy = createAgentChatState(fallback);
    const missing = createAgentChatState({ ...fallback, chatId: "legacy-demo" }).chats[0];
    missing.entries = [{ id: 1, kind: "user", at: 0, text: "Original prompt" }];
    legacy.chats.push(missing);
    const key = chatScopeKey(scope)!;
    const values = new Map([[key, serializeAgentChats(legacy)]]);
    const storage: StorageLike = { getItem: (key) => values.get(key) ?? null, setItem() {}, removeItem: (key) => { values.delete(key); } };
    const session = await openChatPersistence(fileBridge, storage, scope, fallback);
    expect(session.state.chats).toHaveLength(2);
    expect(session.state.chats[0]).toMatchObject({ title: "My title", manualTitle: true, archived: true });
    expect(session.state.chats[1].entries[0].text).toBe("Original prompt");
    await session.save(session.state);
    expect(values.has(key)).toBe(false);
    const reopened = await openChatPersistence(fileBridge, storage, scope, fallback);
    expect(reopened.state.chats).toHaveLength(2);
    values.set(key, "corrupt older backup");
    expect((await openChatPersistence(fileBridge, storage, scope, fallback)).state.chats).toHaveLength(2);
    expect(values.get(key)).toBe("corrupt older backup");
  });
});
