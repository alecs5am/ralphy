import { describe, expect, test } from "vitest";

import { readTitle, titleModels, titlePrompt } from "../electron/agent/title";

describe("naming a chat", () => {
  test("asks for a title and nothing else", () => {
    const prompt = titlePrompt("Cut the hero unit down to fifteen seconds and reschedule it");
    expect(prompt).toContain("three to six words");
    expect(prompt).toContain("no explanation");
    expect(prompt).toContain("Cut the hero unit down");
    // A long first message is a source, not a payload: it is bounded.
    expect(titlePrompt("x".repeat(5_000)).length).toBeLessThan(1_600);
  });

  test("takes a title out of whatever came back", () => {
    expect(readTitle("Hero cut for fifteen seconds")).toBe("Hero cut for fifteen seconds");
    expect(readTitle('"Rescheduling the hero unit."')).toBe("Rescheduling the hero unit");
    expect(readTitle("Title: Memory cleanup\n\nLet me know if…")).toBe("Memory cleanup");
    expect(readTitle("  \n  **Weekly ship plan**  \n")).toBe("Weekly ship plan");

    // Not a title: nothing at all, or a model that answered with a paragraph.
    expect(readTitle("")).toBeNull();
    expect(readTitle("   \n  ")).toBeNull();
    expect(readTitle("Sure, I can help you with that and here is what I would suggest first")).toBeNull();
  });

  test("names a chat on the cheapest model, falling back to the chat's own", () => {
    // A title is housekeeping: the small model first, whatever the chat itself runs on.
    expect(titleModels("claude", "opus")).toEqual(["fable", "opus"]);
    expect(titleModels("codex", "gpt-5.6-luna")).toEqual(["gpt-5.4-mini", "gpt-5.6-luna"]);
    // Already the cheap one -- one attempt, not two identical ones.
    expect(titleModels("claude", "fable")).toEqual(["fable"]);
    // No cheap equivalent to guess at for an id the operator chose themselves.
    expect(titleModels("openrouter", "x-ai/grok-4")).toEqual(["x-ai/grok-4"]);
  });
});
