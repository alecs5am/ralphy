import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { normalizedEvents } from "../electron/agent/codex-session";
import { AgentThread, createAgentChatState, parseAgentChats, reduceAgentChat, serializeAgentChats } from "@/features/agent-chat";
import { parseAgentMessage } from "../src/features/agent-chat/lib/agent-mdx";
import { MarkdownView } from "@/shared/ui/MarkdownView";

const card = '<UnitCard workspaceId="ws_demo" projectId="proj_demo" unitId="unit_demo" title="First creative" />';

describe("agent message component positions", () => {
  test.each([
    `Before\n\n${card}\n\nAfter`,
    `Before\n${card}\nAfter`,
    `Before\n\n${card}\nAfter`,
    `Before ${card} After`,
    `Before\n${card.replace("<UnitCard ", "<UnitCard\n")}\nAfter`,
  ])("keeps a card between its surrounding prose: %s", (source) => {
    const parts = parseAgentMessage(source);
    expect(parts.map((part) => part.kind)).toEqual(["markdown", "unit", "markdown"]);
    expect(parts[0]).toMatchObject({ text: expect.stringContaining("Before") });
    expect(parts[2]).toMatchObject({ text: expect.stringContaining("After") });
  });

  test("keeps adjacent cards, copyable text, and prose in source order", () => {
    const parts = parseAgentMessage(`Before\n${card}\nA direction\n<PromptCard title="Lighting" text="Soft light &amp; paper texture" />\n${card.replace("unit_demo", "unit_other")}\n<CaptionCard text="An everyday escape.&#10;Save for later." />\nAfter`);
    expect(parts.map((part) => part.kind)).toEqual(["markdown", "unit", "markdown", "prompt", "unit", "caption", "markdown"]);
    expect(parts[3]).toEqual({ kind: "prompt", title: "Lighting", text: "Soft light & paper texture" });
    expect(parts[5]).toEqual({ kind: "caption", text: "An everyday escape.\nSave for later." });
  });

  test("does not turn examples, incomplete tags, or executable attributes into cards", () => {
    const examples = [
      `\`\`\`mdx\n${card}\n\`\`\``, `~~~mdx\n${card}\n~~~`, `    ${card}`,
      `\`${card}\``, `\\${card}`, `<!-- ${card} -->`, `<pre>${card}</pre>`,
      `<div>\n${card}\n</div>`, `Before <span>${card}</span> after`, `<script>\n${card}\n</script>`,
      card.slice(0, -1), card.replace('"unit_demo"', '{runCode()}'),
      card.replace('"unit_demo"', 'unit_demo'), card.replace(' />', ' onClick="run()" />'),
      card.replace(' />', ' unitId="duplicate" />'), card.replace('unit_demo', '../outside'),
      '<PromptCard text={runCode()} />', '<PromptCard text="Safe" onClick="run()" />',
      '<CaptionCard text="Safe"><script>run()</script></CaptionCard>',
      '<PromptCard text=" " />', `<PromptCard title="${"x".repeat(201)}" text="Safe" />`,
      `<CaptionCard text="${"x".repeat(8001)}" />`,
    ];
    for (const source of examples) expect(parseAgentMessage(source).every((part) => part.kind === "markdown"), source).toBe(true);
  });

  test("preserves ordinary Markdown and resolves reference links on both sides of cards", () => {
    const markdown = '**Strong** and *quiet*, [inline](https://example.com), [saved][source].\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n[source]: https://example.com/saved "Reference title"';
    expect(parseAgentMessage(markdown)).toEqual([{ kind: "markdown", text: markdown }]);
    const normal = renderToStaticMarkup(<MarkdownView markdown={markdown} tone="chat" />);
    expect(normal).toContain('<strong>Strong</strong>');
    expect(normal).toContain('<em>quiet</em>');
    expect(normal).toContain('<table>');
    expect(normal).not.toContain('[source]:');
    const parts = parseAgentMessage(`[Before][source]\n\n${card}\n\n[After][source]\n\n[source]: https://example.com/saved "Reference title"`);
    expect(parts.map((part) => part.kind)).toEqual(["markdown", "unit", "markdown"]);
    for (const part of parts) {
      if (part.kind !== "markdown") continue;
      const html = renderToStaticMarkup(<MarkdownView markdown={part.text} tone="chat" />);
      expect(html).toContain('href="https://example.com/saved"');
      expect(html).toContain('title="Reference title"');
      expect(html).not.toContain("[source]:");
    }
  });

  test("reveals one complete card in place regardless of streaming chunk boundaries", () => {
    for (let boundary = 1; boundary < card.length; boundary++) {
      const sent = new Map<string, number>();
      let state = createAgentChatState({ chatId: "chat", provider: "codex", model: "default", now: 0 });
      expect(parseAgentMessage(`Before\n${card.slice(0, boundary)}`).every((part) => part.kind === "markdown")).toBe(true);
      for (const delta of [`Before\n${card.slice(0, boundary)}`, `${card.slice(boundary)}\nAfter`]) {
        for (const event of normalizedEvents("item/agentMessage/delta", { itemId: "answer", delta }, sent)) {
          state = reduceAgentChat(state, { type: "event", chatId: "chat", event, now: 1 });
        }
      }
      expect(state.chats[0].entries).toHaveLength(1);
      expect(parseAgentMessage(state.chats[0].entries[0].text!).map((part) => part.kind)).toEqual(["markdown", "unit", "markdown"]);
    }
  });

  test("retains message and tool order during streaming and after storage restore", () => {
    const sent = new Map<string, number>();
    let state = createAgentChatState({ chatId: "chat", provider: "codex", model: "default", now: 0 });
    const events = [
      ...normalizedEvents("item/agentMessage/delta", { itemId: "first", delta: `Before creative\n${card.slice(0, -2)}` }, sent),
      ...normalizedEvents("item/started", { item: { type: "commandExecution", id: "inspect", command: "Inspect saved media" } }, sent),
      ...normalizedEvents("item/agentMessage/delta", { itemId: "second", delta: "Second update" }, sent),
      ...normalizedEvents("item/completed", { item: { type: "agentMessage", id: "first", text: `Before creative\n${card}\nAfter creative` } }, sent),
      ...normalizedEvents("item/completed", { item: { type: "commandExecution", id: "inspect", status: "completed" } }, sent),
    ];
    for (const event of events) state = reduceAgentChat(state, { type: "event", chatId: "chat", event, now: 1 });
    for (const chat of [state.chats[0], parseAgentChats(serializeAgentChats(state)).chats[0]]) {
      expect(chat.entries.map((entry) => entry.kind)).toEqual(["assistant", "tool", "assistant"]);
      const html = renderToStaticMarkup(<AgentThread entries={chat.entries} busy={false} streamingTool={null} onEdit={() => undefined} onRerun={() => undefined} />);
      const positions = ["Before creative", "First creative", "After creative", "Inspect saved media", "Second update"].map((text) => html.indexOf(text));
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });
});
