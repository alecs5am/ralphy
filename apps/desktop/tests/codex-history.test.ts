import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readCodexHistory } from "../electron/agent/codex-history";
import { createAgentChatState, recoverAgentChatEntries, reduceAgentChat } from "@/features/agent-chat";

test("recovers scoped user prompts and command start order, preserving the saved suffix", async () => {
  const codexHome = await mkdtemp(join(tmpdir(), "ralphy-history-"));
  const sessionId = "123e4567-e89b-12d3-a456-426614174000";
  const input = { codexHome, sessionId, rootPath: "/library", workspaceId: "ws-1" };
  const item = (at: number, value: object) => ({
    type: "event_msg", timestamp: new Date(at).toISOString(),
    payload: { type: "item_completed", started_at_ms: at, item: value },
  });
  const rows = [
    { type: "session_meta", payload: { id: sessionId } },
    // Injected instructions must never become a user's message.
    { type: "response_item", payload: { type: "message", role: "user", content: [{ text: "AGENTS.md" }] } },
    item(100, { type: "UserMessage", id: "user", content: [{ text:
      "[Ralphy Media context]\nLibrary: /library\nActive workspace ID: ws-1\n[/Ralphy Media context]\n\nImport creatives" }] }),
    item(110, { type: "AgentMessage", id: "answer", content: [{ type: "Text", text: "I will read the sources." }] }),
    // Completed in reverse order, as parallel commands can be.
    item(130, { type: "CommandExecution", id: "second", command: ["zsh", "-lc", "second command"], status: "completed" }),
    item(120, { type: "CommandExecution", id: "first", command: ["zsh", "-lc", "first command"], status: "completed" }),
  ];
  try {
    await mkdir(join(codexHome, "sessions", "2026"), { recursive: true });
    await writeFile(join(codexHome, "sessions", "2026", `rollout-${sessionId}.jsonl`), rows.map(JSON.stringify).join("\n"));
    const history = await readCodexHistory(input);
    const state = createAgentChatState({ chatId: "chat", provider: "codex", model: "default", now: 0 });
    const chat = { ...state.chats[0], sessionId, entries: [
      { id: 4, at: 130, kind: "tool" as const, tool: { id: "second", name: "Bash", summary: "saved summary", status: "complete" as const } },
      { id: 5, at: 140, kind: "error" as const, text: "Local connection error" },
      { id: 6, at: 150, kind: "assistant" as const, text: "<UnitCard title=\"Creative\" />" },
    ] };
    const entries = recoverAgentChatEntries(chat, history);
    expect(entries.map((entry) => entry.kind)).toEqual(["user", "assistant", "tool", "tool", "error", "assistant"]);
    expect(entries[0].text).toBe("Import creatives");
    expect(entries[2].tool?.id).toBe("first");
    expect(entries.slice(-3)).toEqual(chat.entries);
    expect(() => recoverAgentChatEntries({ ...chat, entries: [{ ...chat.entries[0], tool: { ...chat.entries[0].tool!, id: "missing" } }] }, history)).toThrow("safely match");
    const action = { type: "recover-history" as const, chatId: chat.id, sessionId, beforeId: 4, entries };
    const busyState = { ...state, chats: [{ ...chat, busy: true }] };
    expect(reduceAgentChat(busyState, action).chats[0]).toBe(busyState.chats[0]);
    const recovered = reduceAgentChat({ ...state, chats: [chat] }, action);
    expect(recovered.chats[0].entries).toEqual(entries);
    expect(reduceAgentChat(recovered, action)).toEqual(recovered);
    await expect(readCodexHistory({ ...input, workspaceId: "another-workspace" })).rejects.toThrow("workspace");
    await expect(readCodexHistory({ ...input, sessionId: "../private" })).rejects.toThrow("session ID");
  } finally {
    await rm(codexHome, { recursive: true, force: true });
  }
});
