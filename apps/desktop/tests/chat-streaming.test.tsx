import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { normalizedEvents } from "../electron/agent/codex-session";
import type { AgentChatEvent } from "../electron/media/types";
import {
  AgentThread, createAgentChatState, parseAgentChats, reduceAgentChat, serializeAgentChats,
} from "@/features/agent-chat";

function conversation(events: AgentChatEvent[]) {
  let state = createAgentChatState({ chatId: "chat", provider: "codex", model: "default", now: 0 });
  state = reduceAgentChat(state, { type: "send", chatId: "chat", text: "Show the command", now: 1 });
  for (const event of events) state = reduceAgentChat(state, { type: "event", chatId: "chat", event, now: 2 });
  return state;
}

const completed: AgentChatEvent = {
  type: "result", ok: true, cancelled: false, durationMs: 1000, costUsd: 0, sessionId: null,
};

describe("agent stream boundaries", () => {
  test("restores a stopped saved tool without claiming it failed or remains running", () => {
    const state = conversation([{ type: "tool-start", id: "pending", name: "Image", summary: "Preview" }]);
    const restored = parseAgentChats(serializeAgentChats(state)).chats[0];
    expect(restored.busy).toBe(false);
    expect(restored.entries.at(-1)?.tool?.status).toBe("unconfirmed");
  });

  test("keeps one fenced answer intact across interleaved tools and another assistant message", () => {
    const sent = new Map<string, number>();
    const events = [
      ...normalizedEvents("item/agentMessage/delta", { itemId: "answer", delta: "```sh\necho " }, sent),
      ...normalizedEvents("item/started", { item: { type: "commandExecution", id: "tool", command: "inspect" } }, sent),
      ...normalizedEvents("item/agentMessage/delta", { itemId: "answer", delta: "ready" }, sent),
      ...normalizedEvents("item/completed", { item: { type: "commandExecution", id: "tool", status: "completed" } }, sent),
      ...normalizedEvents("item/agentMessage/delta", { itemId: "other", delta: "Separate update." }, sent),
      ...normalizedEvents("item/completed", { item: { type: "agentMessage", id: "answer", text: "```sh\necho ready\n```" } }, sent),
      completed,
    ];
    const state = conversation(events);
    const chat = state.chats[0];
    expect(chat.entries.filter(({ kind }) => kind === "assistant").map(({ text }) => text))
      .toEqual(["```sh\necho ready\n```", "Separate update."]);
    expect(parseAgentChats(serializeAgentChats(state)).chats[0].entries).toEqual(chat.entries);
    const html = renderToStaticMarkup(<AgentThread entries={chat.entries} busy={false} streamingTool={null} onEdit={() => undefined} onRerun={() => undefined} />);
    expect(html.match(/<pre\b/g)).toHaveLength(1);
    expect(html).toContain("echo ready");
    expect(html).toContain("Separate update.");
  });

  test.each([completed, { type: "error", code: "disconnected", message: "Connection lost" } satisfies AgentChatEvent])(
    "does not claim an unfinished tool is still running after $type",
    (ending) => {
      const state = conversation([
        { type: "tool-start", id: "known", name: "Read", summary: "brief" },
        { type: "tool-result", id: "known", ok: true },
        { type: "tool-start", id: "pending", name: "Image", summary: "Preview" },
        ending,
      ]);
      const chat = state.chats[0];
      expect(chat.entries.filter(({ tool }) => tool).map(({ tool }) => tool!.status)).toEqual(["complete", "unconfirmed"]);
      expect(parseAgentChats(serializeAgentChats(state)).chats[0].entries).toEqual(chat.entries);
      const html = renderToStaticMarkup(<AgentThread entries={chat.entries} busy={false} streamingTool={null} onEdit={() => undefined} onRerun={() => undefined} />);
      expect(html).not.toContain("RUNNING");
      expect(html).toContain("1 DONE · 1 NO RESULT");
      expect(html).not.toContain('aria-live="polite"');
    },
  );
});
