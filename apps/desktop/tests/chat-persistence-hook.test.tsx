import { act } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { bridge } from "@/shared/api/ipc";
import { createAgentChatState } from "../src/features/agent-chat/model/chat-state";
import { serializeAgentChats, type AgentChatScope } from "../src/features/agent-chat/model/chat-storage";
import { useChatPersistence } from "../src/features/agent-chat/model/useChatPersistence";
import type { StoredAgentChats } from "../shared/agent-chat-storage";
import { createReactHost } from "./react-host";

const fallback = () => ({ chatId: "fresh", provider: "codex" as const, model: "default", now: 0 });
afterEach(() => vi.restoreAllMocks());

test("retains an unsaved conversation when switching workspaces and retries it in its original scope", async () => {
  vi.spyOn(bridge, "loadAgentChats").mockResolvedValue({ data: null, revision: null });
  let fail = false;
  let revision = 0;
  const save = vi.spyOn(bridge, "saveAgentChats").mockImplementation(async () => {
    if (fail) throw new Error("Disk full");
    return String(++revision);
  });
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let chat!: ReturnType<typeof useChatPersistence>;
  function Harness({ scope }: { scope: AgentChatScope }) { chat = useChatPersistence(scope, fallback); return null; }
  const a = { rootPath: "library", workspaceId: "workspace-a" };
  const b = { ...a, workspaceId: "workspace-b" };
  try {
    await act(async () => root.render(<Harness scope={a} />));
    fail = true;
    await act(async () => chat.dispatch({ type: "send", chatId: "fresh", text: "Do not lose this message", now: 1 }));
    expect(chat.error).toContain("Disk full");
    await act(async () => root.render(<Harness scope={b} />));
    expect(chat.state.chats[0].entries).toEqual([]);
    await act(async () => root.render(<Harness scope={a} />));
    expect(chat.state.chats[0].entries[0].text).toBe("Do not lose this message");
    fail = false;
    await act(async () => chat.retry());
    expect(chat.error).toBeNull();
    expect(save.mock.calls.at(-1)?.slice(0, 2)).toEqual(["library", "workspace-a"]);
    expect(save.mock.calls.at(-1)?.[2]).toContain("Do not lose this message");
    const otherSaves = save.mock.calls.filter((call) => call[1] === "workspace-b");
    expect(otherSaves.every((call) => !call[2].includes("Do not lose this message"))).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.restore();
  }
});

test("ignores a slow load after the workspace changes and never saves over unreadable history", async () => {
  let resolveFirst!: (value: StoredAgentChats) => void;
  const first = new Promise<StoredAgentChats>((resolve) => { resolveFirst = resolve; });
  const data = (id: string) => serializeAgentChats(createAgentChatState({ ...fallback(), chatId: id }));
  vi.spyOn(bridge, "loadAgentChats").mockImplementation(async (_root, workspace) => {
    if (workspace === "a") return first;
    if (workspace === "broken") throw new Error("Invalid history file");
    return { data: data("workspace-b-chat"), revision: "b" };
  });
  const save = vi.spyOn(bridge, "saveAgentChats").mockResolvedValue("next");
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let chat!: ReturnType<typeof useChatPersistence>;
  function Harness({ workspaceId }: { workspaceId: string }) {
    chat = useChatPersistence({ rootPath: "library", workspaceId }, fallback); return null;
  }
  try {
    await act(async () => root.render(<Harness workspaceId="a" />));
    expect(chat.ready).toBe(false);
    await act(async () => root.render(<Harness workspaceId="b" />));
    await act(async () => resolveFirst({ data: data("workspace-a-chat"), revision: "a" }));
    expect(chat.state.activeChatId).toBe("workspace-b-chat");
    await act(async () => root.render(<Harness workspaceId="broken" />));
    expect(chat.ready).toBe(false);
    expect(chat.error).toContain("Invalid history file");
    expect(save.mock.calls.filter((call) => call[1] === "broken")).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    host.restore();
  }
});

test("routes incoming turns by workspace even when old histories share a chat ID", async () => {
  vi.spyOn(bridge, "loadAgentChats").mockImplementation(async (_root, workspace) => ({
    data: serializeAgentChats(createAgentChatState({ ...fallback(), chatId: "shared-chat-id" })), revision: workspace,
  }));
  const save = vi.spyOn(bridge, "saveAgentChats").mockResolvedValue("saved");
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let chat!: ReturnType<typeof useChatPersistence>;
  function Harness({ workspaceId }: { workspaceId: string }) {
    chat = useChatPersistence({ rootPath: "library", workspaceId }, fallback); return null;
  }
  try {
    await act(async () => root.render(<Harness workspaceId="a" />));
    await act(async () => chat.dispatch({ type: "send", chatId: "shared-chat-id", text: "Continue in the background", now: 1 }));
    await act(async () => root.render(<Harness workspaceId="b" />));
    await act(async () => chat.receiveEvent({ storeId: "library", workspaceId: "a", chatId: "shared-chat-id", provider: "codex", event: { type: "session", sessionId: "00000000-0000-0000-0000-000000000001", tools: [] } }));
    await act(async () => chat.receiveEvent({ storeId: "library", workspaceId: "a", chatId: "shared-chat-id", provider: "codex", event: { type: "text-delta", text: "Background answer" } }));
    expect(chat.state.chats[0].entries).toEqual([]);
    expect(chat.state.chats[0].sessionId).toBeNull();
    expect(save.mock.calls.some((call) => call[1] === "a" && call[2].includes("Background answer"))).toBe(true);
    await act(async () => root.render(<Harness workspaceId="a" />));
    expect(chat.state.chats[0].entries.at(-1)?.text).toBe("Background answer");
    expect(chat.state.chats[0].sessionId).toBe("00000000-0000-0000-0000-000000000001");
  } finally {
    await act(async () => root.unmount());
    host.restore();
  }
});
