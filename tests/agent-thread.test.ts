import { describe, expect, test } from "vitest";
import {
  agentBlocks,
  agentTurns,
  elapsedLabel,
  groupLabel,
  groupMeta,
} from "@/features/agent-chat";
import type { AgentChatEntry } from "@/features/agent-chat";

/* The transcript's derivation, which is the whole of handoff 17's rule that fifty bash commands
   must never render as fifty blocks. The rendering is markup; this is the part that can be wrong. */

let id = 0;
function user(text: string): AgentChatEntry {
  return { id: ++id, kind: "user", at: 1_000, text };
}
function assistant(text: string): AgentChatEntry {
  return { id: ++id, kind: "assistant", at: 1_000, text };
}
function tool(name: string, summary: string, status: "running" | "complete" | "failed" = "complete"): AgentChatEntry {
  return { id: ++id, kind: "tool", at: 1_000, tool: { id: `t${id}`, name, summary, status } };
}
function result(durationMs: number, costUsd: number): AgentChatEntry {
  return { id: ++id, kind: "result", at: 1_000, run: { durationMs, costUsd } };
}

describe("agent transcript", () => {
  test("splits a transcript into turns at each prompt and keeps each turn's own reading", () => {
    const entries = [
      user("first"), assistant("one"), result(73_000, 0.08),
      user("second"), tool("Bash", "bun test"),
    ];
    const turns = agentTurns(entries);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.prompt?.text).toBe("first");
    expect(turns[0]!.work.map(({ kind }) => kind)).toEqual(["assistant"]);
    expect(turns[0]!.result?.run).toEqual({ durationMs: 73_000, costUsd: 0.08 });
    /* A turn still running has no reading, which is what tells the summary row to say "Working". */
    expect(turns[1]!.result).toBeNull();
  });

  test("keeps work that arrives before any prompt rather than dropping it", () => {
    const turns = agentTurns([assistant("resumed session"), user("next")]);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.prompt).toBeNull();
    expect(turns[0]!.work.map(({ kind }) => kind)).toEqual(["assistant"]);
  });

  test("folds a run of tool calls into one block and never one block per call", () => {
    const blocks = agentBlocks([
      assistant("looking"),
      ...Array.from({ length: 50 }, (_, index) => tool("Bash", `step ${index}`)),
      assistant("done"),
    ]);
    expect(blocks.map(({ kind }) => kind)).toEqual(["prose", "tools", "prose"]);
    expect(blocks[1]!.kind === "tools" && blocks[1]!.entries).toHaveLength(50);
  });

  test("breaks a group where something else interrupts the run", () => {
    const blocks = agentBlocks([
      tool("Read", "a.ts"),
      assistant("thinking out loud"),
      tool("Read", "b.ts"),
      { id: 900, kind: "error", at: 1_000, text: "504" },
    ]);
    expect(blocks.map(({ kind }) => kind)).toEqual(["tools", "prose", "tools", "error"]);
  });

  test("names a group from what it holds, and counts only statuses the harness reports", () => {
    const entries = [
      tool("Read", "a.ts"), tool("Read", "b.ts"),
      tool("Bash", "bun test"), tool("Bash", "git diff", "failed"),
      tool("Grep", "watchdog"),
    ];
    expect(groupLabel(entries)).toBe("Read 2 files, ran 2 commands, ran a search");
    expect(groupMeta(entries)).toBe("4 DONE · 1 FAILED");
    expect(groupLabel([tool("Bash", "bun test")])).toBe("Ran a command");
    expect(groupMeta([tool("Bash", "bun test", "running")])).toBe("1 RUNNING");
    /* An unknown tool name still names something: the transcript never prints a blank row. */
    expect(groupLabel([tool("Plurio__ask", "why")])).toBe("Called a tool");
  });

  test("reads a duration the way the design writes it", () => {
    expect(elapsedLabel(0)).toBe("0s");
    expect(elapsedLabel(14_400)).toBe("14s");
    expect(elapsedLabel(73_000)).toBe("1m 13s");
    expect(elapsedLabel(186_000)).toBe("3m 06s");
  });
});
